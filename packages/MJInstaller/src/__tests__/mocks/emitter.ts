import { vi } from 'vitest';
import { InstallerEventEmitter, type InstallerEventType } from '../../events/InstallerEvents.js';

/**
 * Create a real InstallerEventEmitter with a spy on Emit.
 * The emitter works normally, but we can inspect all emitted events.
 */
export function createMockEmitter() {
  const emitter = new InstallerEventEmitter();
  const emitSpy = vi.spyOn(emitter, 'Emit');
  return { emitter, emitSpy };
}

/**
 * Filter captured Emit calls by event type.
 * Returns the event payloads for all emissions of the given type.
 */
export function emittedEvents(
  emitSpy: ReturnType<typeof vi.spyOn>,
  type: InstallerEventType
): unknown[] {
  return emitSpy.mock.calls
    .filter((call) => call[0] === type)
    .map((call) => call[1]);
}

/**
 * Get all emitted event types in order.
 */
export function emittedEventTypes(
  emitSpy: ReturnType<typeof vi.spyOn>
): string[] {
  return emitSpy.mock.calls.map((call) => call[0] as string);
}
