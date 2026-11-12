import { vi } from 'vitest';

/**
 * Captures what a DB-lane case writes to the console on purpose — the bootstrap's metadata-cache status lines, the SQL
 * provider's error log for a row the database refuses — so the case asserts the line it expects and the lane's output
 * stays clean (`pnpm run test:db 2>&1 | grep -c "stderr |"` is 0).
 */
export class ConsoleCapture {
  /** The bootstrap's two metadata-cache status lines are the only console output `BootstrapIntegrationServer` may write. */
  public static readonly BootstrapLine = /^\[Metadata( Cache)?\] /;

  /**
   * Runs `work` with `console[method]` silenced and returns its result with every line the channel received (an `Error`
   * argument contributes its message). The spy is restored even when `work` throws.
   */
  public static async During<T>(method: 'log' | 'error', work: () => Promise<T>): Promise<{ Result: T; Lines: string[] }> {
    const lines: string[] = [];
    const spy = vi.spyOn(console, method).mockImplementation((...args) => {
      lines.push(args.map((a) => (a instanceof Error ? a.message : String(a))).join(' '));
    });
    try {
      return { Result: await work(), Lines: lines };
    } finally {
      spy.mockRestore();
    }
  }

  /** The lines of a bootstrap's output that are not its metadata-cache status lines (a case expects none). */
  public static UnexpectedBootstrapLines(lines: readonly string[]): string[] {
    return lines.filter((l) => !ConsoleCapture.BootstrapLine.test(l));
  }
}
