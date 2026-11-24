/**
 * @module training/object-key-reservations
 *
 * The storage keys this process is writing right now, per storage provider: what makes write-once hold for two saves
 * of one key that run at the same time.
 *
 * `FileStorageBase` has no conditional put, so a write-once save is `ObjectExists` then `PutObject`. Two saves of one key
 * started together both see no object and both write: the later rename wins, both `MJ: Files` rows name the key, and one
 * row's stored hash describes bytes that are no longer there (measured by the M2.5 harness on the `Local File System`
 * provider). A save therefore reserves its key before `ObjectExists` and releases it after its row is saved; a second
 * save of a reserved key is refused, as a key that already holds an object is.
 *
 * **Known limit (D4-86).** The reservation set is per process: two processes saving one key at the same moment are not
 * serialized by it. Across processes, the fresh UUID in every production key (`<KEY_PREFIX>/<randomUUID()>/<name>`) is
 * what prevents a collision, and a forced or legacy name is only ever written by one process.
 */
import { BaseSingleton, UUIDMap } from '@memberjunction/global';

/** The process-wide set of storage keys a save is writing, by storage provider ID. */
export class ObjectKeyReservations extends BaseSingleton<ObjectKeyReservations> {
  /** Keys being written, per provider ID (provider IDs compared as UUIDs; keys compared exactly, as a store compares them). */
  private readonly inFlight = new UUIDMap<Set<string>>();

  protected constructor() {
    super();
  }

  /** The process's one instance. */
  public static get Instance(): ObjectKeyReservations {
    return super.getInstance<ObjectKeyReservations>();
  }

  /**
   * Reserves `objectKey` on the provider for one save.
   *
   * @returns true when the key was free and is now reserved; false when another save in this process holds it
   */
  public TryReserve(providerId: string, objectKey: string): boolean {
    let keys = this.inFlight.Get(providerId);
    if (!keys) {
      keys = new Set<string>();
      this.inFlight.Set(providerId, keys);
    }
    if (keys.has(objectKey)) return false;
    keys.add(objectKey);
    return true;
  }

  /** Releases a key {@link TryReserve} reserved; releasing a key that is not reserved does nothing. */
  public Release(providerId: string, objectKey: string): void {
    const keys = this.inFlight.Get(providerId);
    if (!keys) return;
    keys.delete(objectKey);
    if (keys.size === 0) this.inFlight.Delete(providerId);
  }

  /** Whether a save in this process is writing `objectKey` on the provider now. */
  public IsReserved(providerId: string, objectKey: string): boolean {
    return this.inFlight.Get(providerId)?.has(objectKey) || false;
  }
}
