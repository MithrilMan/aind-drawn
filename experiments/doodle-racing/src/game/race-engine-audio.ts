import type { DriveInput, RacerSnapshot, RaceSnapshot } from './race-model.js';

type AudioContextFactory = () => AudioContext;

type EngineVoice = {
  source: AudioBufferSourceNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  panner: StereoPannerNode | null;
};

export type EngineLoopWindow = Readonly<{
  startSample: number;
  lengthSamples: number;
}>;

export type EngineParameters = Readonly<{
  playbackRate: number;
  gain: number;
  filterFrequency: number;
}>;

const IGNITION_SOURCES = Object.freeze([
  new URL('../assets/audio/engine-ignition-1.opus', import.meta.url).href,
  new URL('../assets/audio/engine-ignition-2.opus', import.meta.url).href,
  new URL('../assets/audio/engine-ignition-3.opus', import.meta.url).href,
  new URL('../assets/audio/engine-ignition-4.opus', import.meta.url).href,
]);
const FALLBACK_ENGINE_SOURCE = new URL('../assets/audio/engine-loop.opus', import.meta.url).href;
const ENGINE_MAX_SPEED = 29;
const LOOP_SECONDS = 0.72;
const LOOP_CROSSFADE_SECONDS = 0.09;
const VEHICLE_VOICE_IDS = Object.freeze(['you', 'mica', 'rook', 'pip']);

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function rms(channel: Float32Array, start: number, length: number): number {
  let sum = 0;
  const end = Math.min(channel.length, start + length);
  for (let index = start; index < end; index += 1) {
    const sample = channel[index] ?? 0;
    sum += sample * sample;
  }
  return Math.sqrt(sum / Math.max(1, end - start));
}

/** Finds a loud, steady rev inside an ignition clip while skipping starter noise and the tail. */
export function selectEngineLoopWindow(
  channels: readonly Float32Array[],
  sampleRate: number,
): EngineLoopWindow {
  const shortestChannel = Math.min(...channels.map(({ length }) => length));
  const requestedLength = Math.round(sampleRate * LOOP_SECONDS);
  const lengthSamples = Math.min(requestedLength, shortestChannel);
  if (channels.length === 0 || !Number.isFinite(shortestChannel) || shortestChannel <= 0) {
    return Object.freeze({ startSample: 0, lengthSamples: 0 });
  }
  if (shortestChannel <= requestedLength) {
    return Object.freeze({ startSample: 0, lengthSamples: shortestChannel });
  }

  const searchStart = Math.min(
    shortestChannel - lengthSamples,
    Math.round(sampleRate * 0.24),
  );
  const searchEnd = Math.max(
    searchStart,
    Math.min(shortestChannel - lengthSamples, Math.round(sampleRate * 1.72)),
  );
  const step = Math.max(1, Math.round(sampleRate * 0.035));
  const edgeLength = Math.max(1, Math.round(sampleRate * 0.08));
  let bestStart = searchStart;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let start = searchStart; start <= searchEnd; start += step) {
    let score = 0;
    for (const channel of channels) {
      const energy = rms(channel, start, lengthSamples);
      const entry = rms(channel, start, edgeLength);
      const exit = rms(channel, start + lengthSamples - edgeLength, edgeLength);
      score += energy - Math.abs(entry - exit) * 1.8;
    }
    score /= channels.length;
    if (score > bestScore) {
      bestScore = score;
      bestStart = start;
    }
  }
  return Object.freeze({ startSample: bestStart, lengthSamples });
}

export function engineParametersFor(
  racer: RacerSnapshot,
  input: DriveInput,
  acceleration: number,
  voiceIndex: number,
): EngineParameters {
  const speedRatio = clamp(racer.speed / ENGINE_MAX_SPEED, 0, 1);
  const accelerating = racer.isPlayer ? Number(input.accelerate) : clamp(acceleration / 8, 0, 1);
  const braking = racer.isPlayer ? Number(input.brake) : clamp(-acceleration / 10, 0, 1);
  const individuality = 0.965 + voiceIndex * 0.022;
  const playbackRate = individuality * (
    0.72 + speedRatio * 0.76 + accelerating * 0.16 - braking * 0.13
  );
  const gainBase = racer.isPlayer ? 0.105 : 0.024;
  const gainRange = racer.isPlayer ? 0.105 : 0.032;
  return Object.freeze({
    playbackRate: clamp(playbackRate, 0.58, 1.72),
    gain: clamp(gainBase + speedRatio * gainRange + accelerating * 0.025 - braking * 0.018, 0, 0.24),
    filterFrequency: clamp(820 + speedRatio * 2_500 + accelerating * 620 - braking * 460, 520, 4_200),
  });
}

export class RaceEngineAudioController {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices: EngineVoice[] = [];
  private ignitionSources: AudioBufferSourceNode[] = [];
  private buffersPromise: Promise<readonly AudioBuffer[]> | null = null;
  private enabled = true;
  private raceActive = false;
  private freeDriveVoiceIndex: number | null = null;
  private raceToken = 0;
  private lastCountdown: number | null = null;
  private readonly previousSpeeds = new Map<string, number>();

  public constructor(
    private readonly createContext: AudioContextFactory = () => new AudioContext(),
  ) {}

  public unlock(): void {
    const context = this.ensureContext();
    if (context === null) return;
    void context.resume().catch(() => undefined);
    void this.loadBuffers(context).catch(() => undefined);
  }

  public startRace(): void {
    this.raceActive = true;
    this.freeDriveVoiceIndex = null;
    this.lastCountdown = null;
    this.previousSpeeds.clear();
    const token = ++this.raceToken;
    if (!this.enabled) return;
    const context = this.ensureContext();
    if (context === null) return;
    void this.beginRaceAudio(context, token);
  }

  public startFreeDrive(vehicleId: string): void {
    this.raceActive = true;
    this.freeDriveVoiceIndex = Math.max(0, VEHICLE_VOICE_IDS.indexOf(vehicleId));
    this.lastCountdown = null;
    this.previousSpeeds.clear();
    const token = ++this.raceToken;
    if (!this.enabled) return;
    const context = this.ensureContext();
    if (context === null) return;
    void this.beginRaceAudio(context, token, true, this.freeDriveVoiceIndex);
  }

  public stopRace(): void {
    this.raceActive = false;
    this.freeDriveVoiceIndex = null;
    this.raceToken += 1;
    this.lastCountdown = null;
    this.previousSpeeds.clear();
    this.stopSources();
  }

  public setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    if (!enabled) {
      this.raceToken += 1;
      this.stopSources();
      return;
    }
    if (this.raceActive) {
      const context = this.ensureContext();
      if (context !== null) void this.beginRaceAudio(context, ++this.raceToken, false);
    }
  }

  public sync(snapshot: RaceSnapshot, input: DriveInput, deltaSeconds: number): void {
    if (!this.enabled || !this.raceActive || this.context === null) return;
    const activePhase = snapshot.phase === 'intro'
      || snapshot.phase === 'countdown'
      || snapshot.phase === 'running'
      || snapshot.phase === 'paused';
    if (!activePhase) {
      this.stopRace();
      return;
    }

    if (snapshot.phase === 'countdown') {
      const countdown = Math.ceil(snapshot.countdown);
      if (countdown >= 1 && countdown <= 3 && countdown !== this.lastCountdown) {
        this.playCountdownTick(countdown);
        this.lastCountdown = countdown;
      }
    } else if (snapshot.phase === 'intro') {
      this.lastCountdown = null;
    }

    const now = this.context.currentTime;
    this.master?.gain.setTargetAtTime(snapshot.phase === 'paused' ? 0.16 : 1, now, 0.08);
    snapshot.racers.forEach((racer, index) => {
      const previousSpeed = this.previousSpeeds.get(racer.id) ?? racer.speed;
      const acceleration = (racer.speed - previousSpeed) / Math.max(0.001, deltaSeconds);
      this.previousSpeeds.set(racer.id, racer.speed);
      const voice = this.voices[index];
      if (voice === undefined) return;
      const parameters = engineParametersFor(racer, input, acceleration, index);
      voice.source.playbackRate.setTargetAtTime(parameters.playbackRate, now, 0.075);
      voice.gain.gain.setTargetAtTime(parameters.gain, now, input.brake ? 0.045 : 0.095);
      voice.filter.frequency.setTargetAtTime(parameters.filterFrequency, now, 0.08);
      voice.panner?.pan.setTargetAtTime(this.panFor(racer, snapshot), now, 0.09);
    });
  }

  public syncFreeDrive(racer: RacerSnapshot, input: DriveInput, deltaSeconds: number): void {
    const selectedIndex = this.freeDriveVoiceIndex;
    if (!this.enabled || !this.raceActive || this.context === null || selectedIndex === null) return;
    const previousSpeed = this.previousSpeeds.get(racer.id) ?? racer.speed;
    const acceleration = (racer.speed - previousSpeed) / Math.max(0.001, deltaSeconds);
    this.previousSpeeds.set(racer.id, racer.speed);
    const now = this.context.currentTime;
    this.master?.gain.setTargetAtTime(1, now, 0.08);
    this.voices.forEach((voice, index) => {
      if (index !== selectedIndex) {
        voice.gain.gain.setTargetAtTime(0, now, 0.05);
        return;
      }
      const parameters = engineParametersFor(racer, input, acceleration, index);
      voice.source.playbackRate.setTargetAtTime(parameters.playbackRate, now, 0.075);
      voice.gain.gain.setTargetAtTime(parameters.gain, now, input.brake ? 0.045 : 0.095);
      voice.filter.frequency.setTargetAtTime(parameters.filterFrequency, now, 0.08);
      voice.panner?.pan.setTargetAtTime(0, now, 0.06);
    });
  }

  public dispose(): void {
    this.raceActive = false;
    this.raceToken += 1;
    this.stopSources();
    const context = this.context;
    this.context = null;
    this.master = null;
    this.buffersPromise = null;
    if (context !== null) void context.close().catch(() => undefined);
  }

  private ensureContext(): AudioContext | null {
    if (this.context !== null) return this.context;
    try {
      this.context = this.createContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.86;
      this.master.connect(this.context.destination);
      return this.context;
    } catch {
      return null;
    }
  }

  private loadBuffers(context: AudioContext): Promise<readonly AudioBuffer[]> {
    this.buffersPromise ??= Promise.all(
      [...IGNITION_SOURCES, FALLBACK_ENGINE_SOURCE].map(async (source) => {
        const response = await fetch(source);
        if (!response.ok) throw new Error(`Unable to load race audio: ${response.status}`);
        return context.decodeAudioData(await response.arrayBuffer());
      }),
    );
    return this.buffersPromise;
  }

  private async beginRaceAudio(
    context: AudioContext,
    token: number,
    playIgnitions = true,
    ignitionIndex: number | null = null,
  ): Promise<void> {
    try {
      await context.resume();
      const buffers = await this.loadBuffers(context);
      if (!this.enabled || !this.raceActive || token !== this.raceToken) return;
      this.stopSources();
      const ignitionBuffers = buffers.slice(0, IGNITION_SOURCES.length);
      if (playIgnitions) this.playIgnitions(context, ignitionBuffers, ignitionIndex);
      this.startEngineLoops(context, ignitionBuffers, buffers.at(-1) as AudioBuffer, playIgnitions ? 1.05 : 0);
    } catch {
      // Audio is enhancement-only. Rendering and simulation must remain playable.
    }
  }

  private playIgnitions(
    context: AudioContext,
    buffers: readonly AudioBuffer[],
    onlyIndex: number | null,
  ): void {
    buffers.forEach((buffer, index) => {
      if (onlyIndex !== null && index !== onlyIndex) return;
      const source = context.createBufferSource();
      const gain = context.createGain();
      const panner = typeof context.createStereoPanner === 'function' ? context.createStereoPanner() : null;
      source.buffer = buffer;
      gain.gain.value = index === 0 ? 0.2 : 0.09;
      if (panner !== null) {
        panner.pan.value = [-0.12, 0.22, -0.35, 0.4][index] ?? 0;
        source.connect(gain).connect(panner).connect(this.master as GainNode);
      } else {
        source.connect(gain).connect(this.master as GainNode);
      }
      source.start(context.currentTime + index * 0.075);
      source.addEventListener('ended', () => {
        this.ignitionSources = this.ignitionSources.filter((candidate) => candidate !== source);
      }, { once: true });
      this.ignitionSources.push(source);
    });
  }

  private startEngineLoops(
    context: AudioContext,
    ignitionBuffers: readonly AudioBuffer[],
    fallback: AudioBuffer,
    delaySeconds: number,
  ): void {
    this.voices = ignitionBuffers.map((ignition, index) => {
      const loop = this.createEngineLoop(context, ignition, fallback);
      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      const panner = typeof context.createStereoPanner === 'function' ? context.createStereoPanner() : null;
      source.buffer = loop;
      source.loop = true;
      source.playbackRate.value = 0.72 + index * 0.018;
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      filter.Q.value = 0.45;
      gain.gain.value = 0;
      source.connect(filter).connect(gain);
      if (panner !== null) gain.connect(panner).connect(this.master as GainNode);
      else gain.connect(this.master as GainNode);
      source.start(context.currentTime + delaySeconds, index * 0.037);
      return { source, filter, gain, panner };
    });
  }

  private createEngineLoop(context: AudioContext, ignition: AudioBuffer, fallback: AudioBuffer): AudioBuffer {
    const channels = Array.from(
      { length: ignition.numberOfChannels },
      (_, index) => ignition.getChannelData(index),
    );
    const window = selectEngineLoopWindow(channels, ignition.sampleRate);
    if (window.lengthSamples < ignition.sampleRate * 0.35) return fallback;
    const overlap = Math.min(
      Math.round(ignition.sampleRate * LOOP_CROSSFADE_SECONDS),
      Math.floor(window.lengthSamples / 3),
    );
    const outputLength = window.lengthSamples - overlap;
    const output = context.createBuffer(ignition.numberOfChannels, outputLength, ignition.sampleRate);
    for (let channelIndex = 0; channelIndex < ignition.numberOfChannels; channelIndex += 1) {
      const source = ignition.getChannelData(channelIndex);
      const target = output.getChannelData(channelIndex);
      for (let index = 0; index < overlap; index += 1) {
        const blend = (index + 1) / overlap;
        const tail = source[window.startSample + outputLength + index] ?? 0;
        const head = source[window.startSample + index] ?? 0;
        target[index] = tail * (1 - blend) + head * blend;
      }
      for (let index = overlap; index < outputLength; index += 1) {
        target[index] = source[window.startSample + index] ?? 0;
      }
    }
    return output;
  }

  private playCountdownTick(countdown: number): void {
    const context = this.context;
    if (context === null || this.master === null) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(540 + (3 - countdown) * 70, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.075, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + 0.12);
  }

  private panFor(racer: RacerSnapshot, snapshot: RaceSnapshot): number {
    const player = snapshot.racers.find(({ isPlayer }) => isPlayer);
    if (player === undefined || racer.isPlayer) return 0;
    const dx = racer.x - player.x;
    const dz = racer.z - player.z;
    const rightX = Math.sin(player.heading);
    const rightZ = Math.cos(player.heading);
    return clamp((dx * rightX + dz * rightZ) / 16, -0.78, 0.78);
  }

  private stopSources(): void {
    for (const source of this.ignitionSources) {
      try { source.stop(); } catch { /* The one-shot already ended. */ }
    }
    for (const { source } of this.voices) {
      try { source.stop(); } catch { /* The loop was never started. */ }
    }
    this.ignitionSources = [];
    this.voices = [];
  }
}
