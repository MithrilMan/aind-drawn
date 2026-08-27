import type { RaceSnapshot } from './race-model.js';

function requireElement<T extends Element>(
  root: ParentNode,
  selector: string,
  constructor: abstract new () => T,
): T {
  const element = root.querySelector(selector);
  if (!(element instanceof constructor)) throw new Error(`Missing required element: ${selector}`);
  return element;
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remaining = (seconds % 60).toFixed(1).padStart(4, '0');
  return `${minutes}:${remaining}`;
}

export class RaceHud {
  private readonly position = requireElement(document, '[data-position-number]', HTMLElement);
  private readonly lap = requireElement(document, '[data-lap]', HTMLElement);
  private readonly totalLaps = requireElement(document, '[data-total-laps]', HTMLElement);
  private readonly time = requireElement(document, '[data-time]', HTMLElement);
  private readonly routeCoverage = requireElement(document, '[data-route-coverage]', HTMLElement);
  private readonly routeGap = requireElement(document, '[data-route-gap]', HTMLElement);
  private readonly routeGapLimit = requireElement(document, '[data-route-gap-limit]', HTMLElement);
  private readonly routeMeter = requireElement(document, '[data-route-meter]', HTMLElement);
  private readonly routeMeterFill = requireElement(document, '[data-route-meter-fill]', HTMLElement);
  private readonly speed = requireElement(document, '[data-speed]', HTMLElement);
  private readonly speedometer = requireElement(document, '.speedometer', HTMLElement);
  private readonly driftMultiplier = requireElement(document, '[data-drift-multiplier]', HTMLElement);
  private readonly driftChain = requireElement(document, '[data-drift-chain]', HTMLElement);
  private readonly driftScore = requireElement(document, '[data-drift-score]', HTMLElement);
  private readonly driftMeter = requireElement(document, '[data-drift-meter]', HTMLElement);
  private readonly draftMeter = requireElement(document, '[data-draft-meter]', HTMLElement);
  private readonly flowStatus = requireElement(document, '[data-flow-status]', HTMLElement);
  private readonly driftLinks = requireElement(document, '[data-drift-links]', HTMLElement);
  private readonly nearMisses = requireElement(document, '[data-near-misses]', HTMLElement);
  private readonly runningOrder = requireElement(document, '[data-running-order]', HTMLOListElement);
  private readonly countdown = requireElement(document, '[data-countdown]', HTMLElement);
  private readonly callout = requireElement(document, '[data-event-callout]', HTMLElement);
  private readonly calloutTitle = requireElement(document, '[data-event-title]', HTMLElement);
  private readonly calloutDetail = requireElement(document, '[data-event-detail]', HTMLElement);
  private readonly liveStatus = requireElement(document, '[data-live-status]', HTMLElement);

  private previousPhase: RaceSnapshot['phase'] | null = null;
  private previousOffRoad = false;
  private previousDrifting = false;
  private previousRespawning = false;
  private previousCountdown = -1;
  private previousOrder = '';
  private previousFlowEventSequence = 0;

  public constructor(private readonly shell: HTMLElement) {}

  public announce(message: string): void {
    this.liveStatus.textContent = message;
  }

  public render(snapshot: RaceSnapshot): void {
    this.position.textContent = snapshot.playerPosition.toString();
    this.lap.textContent = snapshot.playerLap.toString();
    this.totalLaps.textContent = snapshot.totalLaps.toString();
    this.time.textContent = formatTime(snapshot.elapsed);
    const routeCoveragePercent = Math.floor(snapshot.routeCoverage * 100);
    this.routeCoverage.textContent = `${routeCoveragePercent}%`;
    this.routeGap.textContent = snapshot.largestRouteGap.toFixed(1);
    this.routeGapLimit.textContent = snapshot.routeGapLimit.toFixed(0);
    this.routeMeter.setAttribute('aria-valuenow', routeCoveragePercent.toString());
    this.routeMeterFill.style.inlineSize = `${routeCoveragePercent}%`;
    this.routeMeter.closest('.route-validation')?.classList.toggle(
      'route-invalid',
      snapshot.largestRouteGap > snapshot.routeGapLimit,
    );
    this.speed.textContent = Math.round(snapshot.playerSpeedKph).toString();
    this.speedometer.style.setProperty(
      '--speed-progress',
      `${Math.min(1, snapshot.playerSpeedKph / 185) * 270}deg`,
    );
    this.driftMultiplier.textContent = `x${snapshot.driftMultiplier.toFixed(1)}`;
    this.driftChain.textContent = `+${snapshot.driftChain.toString().padStart(4, '0')}`;
    this.driftScore.textContent = snapshot.driftScore.toString().padStart(5, '0');
    this.driftLinks.textContent = snapshot.driftLinks.toString();
    this.nearMisses.textContent = snapshot.nearMisses.toString();
    const boostPercent = Math.round(snapshot.boostCharge * 100);
    this.driftMeter.style.inlineSize = `${boostPercent}%`;
    this.draftMeter.style.inlineSize = `${Math.round(snapshot.draftStrength * 100)}%`;
    this.driftMeter.parentElement?.setAttribute('aria-valuenow', boostPercent.toString());
    this.flowStatus.textContent = snapshot.boostIntensity > 0
      ? 'Boost'
      : snapshot.draftStrength > 0.08
        ? `Draft ${Math.round(snapshot.draftStrength * 100)}%`
        : snapshot.racers.find(({ isPlayer }) => isPlayer)?.airborne === true
          ? 'Set landing'
          : snapshot.boostCharge > 0.02
            ? `${boostPercent}% charged`
            : 'Ready';
    this.shell.classList.toggle('off-road', snapshot.offRoad);
    this.shell.classList.toggle('is-drifting', snapshot.drifting);
    this.shell.classList.toggle('is-boosting', snapshot.boostIntensity > 0);
    this.shell.classList.toggle('is-drafting', snapshot.draftStrength > 0.08);
    this.shell.classList.toggle(
      'is-airborne',
      snapshot.racers.find(({ isPlayer }) => isPlayer)?.airborne === true,
    );
    this.shell.classList.toggle('is-impacting', snapshot.impact > 0.18);
    this.shell.classList.toggle('is-respawning', snapshot.respawning);
    this.renderRunningOrder(snapshot);
    this.renderRaceState(snapshot);
    this.renderEvent(snapshot);
  }

  private renderRunningOrder(snapshot: RaceSnapshot): void {
    const ordered = [...snapshot.racers].sort((left, right) => right.raceScore - left.raceScore);
    const key = ordered.map(({ id, lap }) => `${id}:${lap}`).join(':');
    if (key === this.previousOrder) return;
    this.previousOrder = key;
    this.runningOrder.replaceChildren(...ordered.map((racer, index) => {
      const item = document.createElement('li');
      if (racer.isPlayer) item.classList.add('player-row');
      const place = document.createElement('span');
      place.textContent = (index + 1).toString().padStart(2, '0');
      const name = document.createElement('strong');
      name.textContent = racer.name;
      const lap = document.createElement('small');
      lap.textContent = racer.lap >= snapshot.totalLaps
        ? 'FIN'
        : `L${Math.min(snapshot.totalLaps, racer.lap + 1)}`;
      item.append(place, name, lap);
      return item;
    }));
  }

  private renderRaceState(snapshot: RaceSnapshot): void {
    const count = Math.ceil(snapshot.countdown);
    if (snapshot.phase === 'menu' || snapshot.phase === 'intro') {
      this.countdown.hidden = true;
    } else if (snapshot.phase === 'countdown') {
      this.countdown.hidden = false;
      this.countdown.textContent = count.toString();
      if (count !== this.previousCountdown) this.announce(`Race starts in ${count}.`);
      this.previousCountdown = count;
    } else if (snapshot.phase === 'paused') {
      this.countdown.hidden = false;
      this.countdown.textContent = 'Paused';
    } else {
      this.countdown.hidden = true;
    }

    if (snapshot.phase !== this.previousPhase) {
      if (snapshot.phase === 'menu') this.announce('Race setup ready. Choose a render style and lap count.');
      else if (snapshot.phase === 'intro') this.announce('Broadcast intro. Meet the Paper Circuit crowd.');
      else if (snapshot.phase === 'countdown') this.announce('Cars are on the grid. Countdown started.');
      else if (snapshot.phase === 'running') this.announce('Go. The race is running.');
      else if (snapshot.phase === 'paused') this.announce('Race paused.');
      else {
        this.announce(`Finished in position ${snapshot.playerPosition} after ${formatTime(snapshot.elapsed)}.`);
      }
      this.previousPhase = snapshot.phase;
    }
  }

  private renderEvent(snapshot: RaceSnapshot): void {
    let title = '';
    let detail = '';
    if (snapshot.phase === 'menu') {
      title = '';
      detail = '';
    } else if (snapshot.phase === 'intro') {
      title = 'Make some noise!';
      detail = 'Live from the Paper Circuit grandstand';
    } else if (snapshot.phase === 'finished') {
      title = `P${snapshot.playerPosition} — finish!`;
      detail = `${formatTime(snapshot.elapsed)} · move + hold B: outrun the victory mob`;
    } else if (snapshot.respawning) {
      title = 'Reset!';
      detail = 'Back to the last safe line';
    } else if (snapshot.impact > 0.25) {
      title = 'Crunch!';
      detail = 'That barrier was not decorative';
    } else if (snapshot.flowEvent !== null) {
      ({ title, detail } = this.flowEventCopy(snapshot));
    } else if (snapshot.racers.find(({ isPlayer }) => isPlayer)?.airborne === true) {
      title = 'Airborne!';
      detail = 'Straighten the car before touchdown';
    } else if (snapshot.drifting) {
      title = 'Sideways!';
      detail = `+${snapshot.driftChain} keep it loose`;
    } else if (snapshot.draftStrength > 0.12) {
      title = 'In the draft';
      detail = 'Pull out sideways for the slingshot';
    } else if (snapshot.offRoad) {
      title = 'Loose ground';
      detail = 'Grip is reduced';
    }
    this.callout.hidden = title === '';
    this.calloutTitle.textContent = title;
    this.calloutDetail.textContent = detail;

    if (snapshot.respawning && !this.previousRespawning) {
      this.announce('Vehicle reset to the last safe track point.');
    } else if (
      snapshot.flowEvent !== null
      && snapshot.flowEvent.sequence !== this.previousFlowEventSequence
    ) {
      const copy = this.flowEventCopy(snapshot);
      this.announce(`${copy.title} ${copy.detail}`);
      this.previousFlowEventSequence = snapshot.flowEvent.sequence;
    } else if (snapshot.drifting && !this.previousDrifting) {
      this.announce('Drift chain started.');
    } else if (snapshot.offRoad !== this.previousOffRoad) {
      this.announce(snapshot.offRoad ? 'Loose ground. Grip is reduced.' : 'Back on the road.');
    }
    this.previousRespawning = snapshot.respawning;
    this.previousDrifting = snapshot.drifting;
    this.previousOffRoad = snapshot.offRoad;
  }

  private flowEventCopy(snapshot: RaceSnapshot): Readonly<{ title: string; detail: string }> {
    switch (snapshot.flowEvent?.kind) {
      case 'takeoff':
        return Object.freeze({ title: 'Launch!', detail: 'Straighten the car for a landing boost' });
      case 'drift-boost':
        return Object.freeze({ title: 'Snap boost!', detail: 'Clean countersteer converted flow into speed' });
      case 'linked-corner':
        return Object.freeze({ title: 'Linked!', detail: `${snapshot.driftLinks} corners · charge kept` });
      case 'near-miss':
        return Object.freeze({ title: 'Threaded it!', detail: 'Near miss added flow charge' });
      case 'slingshot':
        return Object.freeze({ title: 'Slingshot!', detail: 'Draft converted into speed' });
      case 'clean-landing':
        return Object.freeze({ title: 'Stuck it!', detail: 'Straight landing · speed preserved' });
      case 'rough-landing':
        return Object.freeze({ title: 'Heavy landing', detail: 'Too much angle at touchdown' });
      default:
        return Object.freeze({ title: '', detail: '' });
    }
  }
}
