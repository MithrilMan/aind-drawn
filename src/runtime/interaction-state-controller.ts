import type { InteractionSpec } from '../contracts/asset-semantics.js';

type StateApplicator = (interactionId: string, state: string) => void;

/** Owns idempotent mutable state while projection adapters apply visual state. */
export class InteractionStateController {
  private readonly definitions: ReadonlyMap<string, InteractionSpec>;
  private readonly states = new Map<string, string>();
  private readonly apply: StateApplicator;

  public constructor(
    definitions: readonly InteractionSpec[],
    apply: StateApplicator,
  ) {
    this.definitions = new Map(definitions.map((definition) => [definition.id, definition]));
    this.apply = apply;
    for (const definition of definitions) {
      this.apply(definition.id, definition.initialState);
      this.states.set(definition.id, definition.initialState);
    }
  }

  public get ids(): readonly string[] {
    return [...this.states.keys()];
  }

  public get(id: string): string | null {
    return this.states.get(id) ?? null;
  }

  public set(id: string, state: string): void {
    const definition = this.definitions.get(id);
    if (definition === undefined) throw new Error(`Unknown interaction: ${id}`);
    if (!definition.states.includes(state)) {
      throw new RangeError(`Interaction ${id} does not define state ${state}`);
    }
    if (this.states.get(id) === state) return;
    this.apply(id, state);
    this.states.set(id, state);
  }

  public snapshot(): Readonly<Record<string, string>> {
    return Object.freeze(Object.fromEntries(this.states));
  }

  public dispose(): void {
    this.states.clear();
  }
}
