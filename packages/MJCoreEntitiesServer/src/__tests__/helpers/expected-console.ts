/**
 * Keeps a test file's run output clean without hiding a surprise: every `console.error`, `console.warn` and
 * `console.log` line a test writes is captured, and after each test any captured line that none of the file's expected
 * patterns matches fails that test. MJ's `LogError` / `LogStatus` write through these channels, so a code path a test
 * drives on purpose (a refused save, a logged warning) is asserted by its pattern instead of printed.
 */
import { afterEach, beforeEach, expect, vi, type MockInstance } from 'vitest';

type ConsoleSpy = MockInstance<typeof console.error>;

export class ExpectedConsole {
  /** Installs the capture for every test of the calling file; `expected` lists the lines its tests write on purpose. */
  public static Install(expected: readonly RegExp[]): void {
    let spies: ConsoleSpy[] = [];
    beforeEach(() => {
      spies = [vi.spyOn(console, 'error'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'log')].map((s) => s.mockImplementation(() => undefined));
    });
    afterEach(() => {
      const lines = spies.flatMap((s) => s.mock.calls.map((args) => args.map((a: Error | string | number | boolean | object) => (a instanceof Error ? `${a.name}: ${a.message}` : String(a))).join(' ')));
      for (const s of spies) s.mockRestore();
      expect(lines.filter((line) => !expected.some((p) => p.test(line)))).toEqual([]);
    });
  }
}
