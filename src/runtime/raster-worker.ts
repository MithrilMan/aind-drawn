import type { RasterBoilAuditReport } from '../authoring/raster-visual-audit.js';
import { auditRasterBoil } from '../authoring/raster-visual-audit.js';
import type { AssetBlueprint } from '../contracts/raster-asset.js';
import { offscreenCanvasFactory } from '../core/canvas.js';
import { bakeRasterLayerFrame } from './raster-frame-baker.js';

export type SerializableRasterBoilAuditOptions = Readonly<{
  frameCount?: number;
  gridSize?: number;
  structuralThreshold?: number;
  states?: 'all' | 'initial';
}>;

export type RasterWorkerBakeFrameJob<TPayload> = Readonly<{
  payload: TPayload;
  layerId: string;
  state: string;
  frame: number;
}>;

export type RasterWorkerAuditJob<TPayload> = Readonly<{
  payload: TPayload;
  options?: SerializableRasterBoilAuditOptions;
}>;

export type RasterWorkerBakedFrame = Readonly<{
  canvas: OffscreenCanvas;
  paperColor: readonly [number, number, number];
  durationMilliseconds: number;
}>;

export type RasterWorkerBoilAudit = Readonly<{
  report: RasterBoilAuditReport;
  durationMilliseconds: number;
}>;

type RasterWorkerRequest<TPayload> = Readonly<{
  protocol: 'aind:raster-worker:1';
  requestId: number;
  job: Readonly<{
    kind: 'bake-frame';
    value: RasterWorkerBakeFrameJob<TPayload>;
  }> | Readonly<{
    kind: 'audit-boil';
    value: RasterWorkerAuditJob<TPayload>;
  }>;
}>;

type RasterWorkerResponse = Readonly<{
  protocol: 'aind:raster-worker:1';
  requestId: number;
  result: Readonly<{
    kind: 'bake-frame';
    value: RasterWorkerBakedFrame;
  }> | Readonly<{
    kind: 'audit-boil';
    value: RasterWorkerBoilAudit;
  }>;
}> | Readonly<{
  protocol: 'aind:raster-worker:1';
  requestId: number;
  error: Readonly<{
    name: string;
    message: string;
    stack?: string;
  }>;
}>;

export type RasterWorkerEndpoint = Readonly<{
  postMessage: (message: unknown, options?: StructuredSerializeOptions) => void;
  addEventListener: (type: 'message', listener: (event: MessageEvent<unknown>) => void) => void;
  removeEventListener: (type: 'message', listener: (event: MessageEvent<unknown>) => void) => void;
}>;

export type RasterWorkerHost = Readonly<{
  postMessage: (message: unknown, options?: StructuredSerializeOptions) => void;
  addEventListener: (type: 'message', listener: (event: MessageEvent<unknown>) => void) => void;
  removeEventListener: (type: 'message', listener: (event: MessageEvent<unknown>) => void) => void;
}>;

export type RasterWorkerBlueprintResolver<TPayload> = (
  payload: TPayload,
) => AssetBlueprint | Promise<AssetBlueprint>;

type PendingRequest = Readonly<{
  expectedKind: 'bake-frame' | 'audit-boil';
  resolve: (value: RasterWorkerBakedFrame | RasterWorkerBoilAudit) => void;
  reject: (reason: unknown) => void;
  detachAbort: () => void;
}>;

function isResponse(value: unknown): value is RasterWorkerResponse {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Partial<RasterWorkerResponse>;
  return candidate.protocol === 'aind:raster-worker:1'
    && Number.isInteger(candidate.requestId);
}

function errorRecord(error: unknown): Readonly<{
  name: string;
  message: string;
  stack?: string;
}> {
  if (error instanceof Error) {
    return Object.freeze({
      name: error.name,
      message: error.message,
      ...(error.stack === undefined ? {} : { stack: error.stack }),
    });
  }
  return Object.freeze({ name: 'Error', message: String(error) });
}

function responseError(error: RasterWorkerResponse & { error: unknown }): Error {
  const failure = error.error as { name: string; message: string; stack?: string };
  const result = new Error(failure.message);
  result.name = failure.name;
  if (failure.stack !== undefined) result.stack = failure.stack;
  return result;
}

function now(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

function asAbortError(reason: unknown, fallback: string): Error {
  if (reason instanceof Error) return reason;
  return new DOMException(typeof reason === 'string' ? reason : fallback, 'AbortError');
}

function asDispatchError(reason: unknown, fallback: string): Error {
  return reason instanceof Error ? reason : new Error(
    typeof reason === 'string' ? reason : fallback,
  );
}

/**
 * Main-thread client for deterministic worker baking. The payload, rather than
 * a blueprint containing draw callbacks, crosses the structured-clone boundary.
 */
export class RasterWorkerClient<TPayload> {
  private readonly endpoint: RasterWorkerEndpoint;
  private readonly pending = new Map<number, PendingRequest>();
  private nextRequestId = 1;
  private disposed = false;

  public constructor(endpoint: RasterWorkerEndpoint) {
    this.endpoint = endpoint;
    this.endpoint.addEventListener('message', this.onMessage);
  }

  public bakeFrame(
    job: RasterWorkerBakeFrameJob<TPayload>,
    signal?: AbortSignal,
  ): Promise<RasterWorkerBakedFrame> {
    return this.dispatch('bake-frame', job, signal) as Promise<RasterWorkerBakedFrame>;
  }

  public auditBoil(
    job: RasterWorkerAuditJob<TPayload>,
    signal?: AbortSignal,
  ): Promise<RasterWorkerBoilAudit> {
    return this.dispatch('audit-boil', job, signal) as Promise<RasterWorkerBoilAudit>;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.endpoint.removeEventListener('message', this.onMessage);
    for (const pending of this.pending.values()) {
      pending.detachAbort();
      pending.reject(new Error('Raster worker client is disposed'));
    }
    this.pending.clear();
  }

  private readonly onMessage = (event: MessageEvent<unknown>): void => {
    if (!isResponse(event.data)) return;
    const response = event.data;
    const pending = this.pending.get(response.requestId);
    if (pending === undefined) return;
    this.pending.delete(response.requestId);
    pending.detachAbort();
    if ('error' in response) {
      pending.reject(responseError(response));
      return;
    }
    if (response.result.kind !== pending.expectedKind) {
      pending.reject(new Error(
        `Raster worker returned ${response.result.kind} for ${pending.expectedKind}`,
      ));
      return;
    }
    pending.resolve(response.result.value);
  };

  private dispatch(
    kind: 'bake-frame' | 'audit-boil',
    value: RasterWorkerBakeFrameJob<TPayload> | RasterWorkerAuditJob<TPayload>,
    signal: AbortSignal | undefined,
  ): Promise<RasterWorkerBakedFrame | RasterWorkerBoilAudit> {
    if (this.disposed) return Promise.reject(new Error('Raster worker client is disposed'));
    if (signal?.aborted === true) {
      return Promise.reject(asAbortError(signal.reason, 'Raster worker request aborted'));
    }
    const requestId = this.nextRequestId;
    this.nextRequestId += 1;
    return new Promise((resolve, reject) => {
      const abort = (): void => {
        const pending = this.pending.get(requestId);
        if (pending === undefined) return;
        this.pending.delete(requestId);
        pending.detachAbort();
        reject(asAbortError(signal?.reason, 'Raster worker request aborted'));
      };
      const detachAbort = (): void => signal?.removeEventListener('abort', abort);
      signal?.addEventListener('abort', abort, { once: true });
      this.pending.set(requestId, Object.freeze({
        expectedKind: kind,
        resolve,
        reject,
        detachAbort,
      }));
      const request: RasterWorkerRequest<TPayload> = Object.freeze({
        protocol: 'aind:raster-worker:1',
        requestId,
        job: Object.freeze({ kind, value }) as RasterWorkerRequest<TPayload>['job'],
      });
      try {
        this.endpoint.postMessage(request);
      } catch (error) {
        this.pending.delete(requestId);
        detachAbort();
        reject(asDispatchError(error, 'Raster worker postMessage failed'));
      }
    });
  }
}

/** Installs the worker-side half of the raster protocol. */
export function installRasterWorkerHost<TPayload>(
  host: RasterWorkerHost,
  resolveBlueprint: RasterWorkerBlueprintResolver<TPayload>,
): () => void {
  const onMessage = (event: MessageEvent<unknown>): void => {
    const request = event.data as Partial<RasterWorkerRequest<TPayload>>;
    if (request.protocol !== 'aind:raster-worker:1'
        || !Number.isInteger(request.requestId)
        || request.job === undefined) return;
    const validated = request as RasterWorkerRequest<TPayload>;
    const job = validated.job;
    void (async () => {
      try {
        const blueprint = await resolveBlueprint(job.value.payload);
        if (job.kind === 'bake-frame') {
          const layer = blueprint.layers.find(({ id }) => id === job.value.layerId);
          if (layer === undefined) {
            throw new RangeError(`Unknown raster worker layer ${job.value.layerId}`);
          }
          const started = now();
          const baked = bakeRasterLayerFrame(
            blueprint,
            layer,
            job.value.state,
            job.value.frame,
            { canvasFactory: offscreenCanvasFactory },
          );
          if (!(baked.canvas instanceof OffscreenCanvas)) {
            throw new TypeError('Raster worker bake did not produce an OffscreenCanvas');
          }
          const response: RasterWorkerResponse = Object.freeze({
            protocol: 'aind:raster-worker:1',
            requestId: validated.requestId,
            result: Object.freeze({
              kind: 'bake-frame',
              value: Object.freeze({
                canvas: baked.canvas,
                paperColor: baked.paperColor,
                durationMilliseconds: now() - started,
              }),
            }),
          });
          host.postMessage(response, { transfer: [baked.canvas] });
          return;
        }
        const started = now();
        const report = auditRasterBoil(blueprint, {
          ...job.value.options,
          canvasFactory: offscreenCanvasFactory,
        });
        const response: RasterWorkerResponse = Object.freeze({
          protocol: 'aind:raster-worker:1',
          requestId: validated.requestId,
          result: Object.freeze({
            kind: 'audit-boil',
            value: Object.freeze({
              report,
              durationMilliseconds: now() - started,
            }),
          }),
        });
        host.postMessage(response);
      } catch (error) {
        const response: RasterWorkerResponse = Object.freeze({
          protocol: 'aind:raster-worker:1',
          requestId: validated.requestId,
          error: errorRecord(error),
        });
        host.postMessage(response);
      }
    })();
  };
  host.addEventListener('message', onMessage);
  return () => { host.removeEventListener('message', onMessage); };
}
