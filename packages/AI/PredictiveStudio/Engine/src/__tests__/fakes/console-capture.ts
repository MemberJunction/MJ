import { vi, type MockInstance } from 'vitest';

/**
 * Captures what code under test writes to the console on purpose (MJ's `LogError` writes to `console.error`,
 * `LogStatus` to `console.log`), so a test that drives an error or status path asserts the line it expects and the
 * run output stays clean. The shared vitest config restores every spy after each test.
 */
export class ConsoleCapture {
  /** Silences `console.error` for the current test and returns its spy. */
  public static Errors(): MockInstance<typeof console.error> {
    return vi.spyOn(console, 'error').mockImplementation(() => undefined);
  }

  /** Silences `console.log` for the current test and returns its spy. */
  public static Status(): MockInstance<typeof console.log> {
    return vi.spyOn(console, 'log').mockImplementation(() => undefined);
  }

  /** The text of every line a captured channel received (an `Error` argument contributes its message). */
  public static Lines(spy: MockInstance<typeof console.error> | MockInstance<typeof console.log>): string[] {
    return spy.mock.calls.map((args) =>
      args.map((a: Error | string | number | boolean | object) => (a instanceof Error ? a.message : String(a))).join(' '),
    );
  }
}
