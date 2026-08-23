const CARRIER_OWNER_KEY_CAPACITY = 1_024;

/**
 * Allocates stable, render-target-safe owner keys for the parts of one carrier.
 * The policy slot already distinguishes carrier instances, so this namespace
 * only needs to be unique within one registration.
 */
export class InkedSolidCarrierOwnerKeys {
  private readonly occupied = new Uint8Array(CARRIER_OWNER_KEY_CAPACITY);

  public allocate(seed: number): number {
    const integerSeed = Math.trunc(seed);
    const firstSlot = (
      (integerSeed % CARRIER_OWNER_KEY_CAPACITY) + CARRIER_OWNER_KEY_CAPACITY
    ) % CARRIER_OWNER_KEY_CAPACITY;
    for (let offset = 0; offset < CARRIER_OWNER_KEY_CAPACITY; offset += 1) {
      const slot = (firstSlot + offset) % CARRIER_OWNER_KEY_CAPACITY;
      if (this.occupied[slot] !== 0) continue;
      this.occupied[slot] = 1;
      return (slot + 0.5) / CARRIER_OWNER_KEY_CAPACITY;
    }
    throw new RangeError(
      `Inked-solid carrier exceeds ${CARRIER_OWNER_KEY_CAPACITY} uniquely identifiable parts`,
    );
  }
}
