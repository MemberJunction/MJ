/**
 * Shared `vi.mock` factory for `install/history-recorder.js`.
 *
 * The orchestrator suites stub every history-recorder export. Listing them by hand in each suite
 * meant every new export had to be added to every copy, and a missed one failed on the mock's
 * shape (`No "X" export is defined on the mock`) rather than on the behaviour under test. This
 * derives the shape from the real module instead, so a new export needs no test change.
 *
 * Usage (the factory is hoisted, so import the helper inside it):
 *
 * ```ts
 * vi.mock('../install/history-recorder.js', async (importOriginal) => {
 *     const { MockHistoryRecorder } = await import('./helpers/history-recorder-mock.js');
 *     return MockHistoryRecorder(await importOriginal());
 * });
 * ```
 */
import { vi } from 'vitest';
import type * as HistoryRecorder from '../../install/history-recorder.js';

export type HistoryRecorderModule = typeof HistoryRecorder;

/**
 * The module with every exported function replaced by a bare `vi.fn()` (returns `undefined`
 * until a test sets a value). Non-function exports are kept as they are.
 */
export function MockHistoryRecorder(actual: HistoryRecorderModule): HistoryRecorderModule {
    const mocked: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(actual)) {
        mocked[name] = typeof value === 'function' ? vi.fn() : value;
    }
    return mocked as HistoryRecorderModule;
}
