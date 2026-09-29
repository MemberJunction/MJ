/**
 * Console Manager - Temporarily suppress console output for clean CLI experience
 */

interface ConsoleBackup {
  log: typeof console.log;
  error: typeof console.error;
  warn: typeof console.warn;
  info: typeof console.info;
  debug: typeof console.debug;
}

export class ConsoleManager {
  private static originalConsole: ConsoleBackup | null = null;
  private static isSuppressed: boolean = false;

  /**
   * Suppress all console output except errors
   */
  public static SuppressOutput(): void {
    if (this.isSuppressed) return;

    // Backup original console methods
    this.originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn,
      info: console.info,
      debug: console.debug
    };

    // Replace with no-op functions (except error)
    console.log = () => {};
    console.warn = () => {};
    console.info = () => {};
    console.debug = () => {};
    // Keep error output for critical issues
    // console.error = console.error;

    this.isSuppressed = true;
  }

  /** @deprecated Use {@link SuppressOutput}. */
  public static suppressOutput(): void {
    return this.SuppressOutput();
  }

  /**
   * Restore original console output
   */
  public static RestoreOutput(): void {
    if (!this.isSuppressed || !this.originalConsole) return;

    // Restore original console methods
    console.log = this.originalConsole.log;
    console.error = this.originalConsole.error;
    console.warn = this.originalConsole.warn;
    console.info = this.originalConsole.info;
    console.debug = this.originalConsole.debug;

    this.originalConsole = null;
    this.isSuppressed = false;
  }

  /** @deprecated Use {@link RestoreOutput}. */
  public static restoreOutput(): void {
    return this.RestoreOutput();
  }

  /**
   * Execute a function with suppressed console output
   */
  public static async WithSuppressedOutput<T>(fn: () => Promise<T>): Promise<T> {
    this.SuppressOutput();
    try {
      return await fn();
    } finally {
      this.RestoreOutput();
    }
  }

  /** @deprecated Use {@link WithSuppressedOutput}. */
  public static async withSuppressedOutput<T>(fn: () => Promise<T>): Promise<T> {
    return this.WithSuppressedOutput(fn);
  }

  /**
   * Check if console output is currently suppressed
   */
  public static IsOutputSuppressed(): boolean {
    return this.isSuppressed;
  }

  /** @deprecated Use {@link IsOutputSuppressed}. */
  public static isOutputSuppressed(): boolean {
    return this.IsOutputSuppressed();
  }
}