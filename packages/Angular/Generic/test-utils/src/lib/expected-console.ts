import { afterEach, beforeEach, expect, vi } from 'vitest';

/**
 * Captures the console lines a test file's tests are known to produce, so a run prints nothing, and fails the test
 * that produced any line the file did not declare. Call once at the top of a test file (or inside a `describe`),
 * before the tests: each test gets fresh spies, checked after it runs. Lines are recorded as they are logged, so a
 * test's own `vi.restoreAllMocks()` (or the shared `restoreMocks`) does not lose them before the check.
 */

/** The console methods a test can log through. */
export type ConsoleMethod = 'log' | 'info' | 'warn' | 'error' | 'debug';

/** For each console method, the patterns its expected lines match; a method not listed may log nothing. */
export type ExpectedConsoleLines = Partial<Record<ConsoleMethod, readonly RegExp[]>>;

/** One line a test logged: its arguments joined with spaces, an Error as its stack, an object as JSON. */
export interface CapturedConsoleLine {
  readonly Method: ConsoleMethod;
  readonly Line: string;
}

const CONSOLE_METHODS: readonly ConsoleMethod[] = ['log', 'info', 'warn', 'error', 'debug'];

/**
 * Silences the console for every test of the file and, after each, asserts that every line it logged matches one of
 * `expected` for its method. `Lines()` returns the running test's lines, for a test that asserts a specific one.
 */
export function ExpectConsoleLines(expected: ExpectedConsoleLines): { readonly Lines: (method?: ConsoleMethod) => string[] } {
  let lines: CapturedConsoleLine[] = [];
  beforeEach(() => {
    lines = [];
    for (const method of CONSOLE_METHODS) {
      vi.spyOn(console, method).mockImplementation((...args: Parameters<Console[ConsoleMethod]>) => {
        lines.push({ Method: method, Line: FormatConsoleArgs(args) });
      });
    }
  });
  afterEach(() => {
    expect(UnexpectedConsoleLines(lines, expected)).toEqual([]);
  });
  return { Lines: (method?: ConsoleMethod): string[] => lines.filter((l) => method === undefined || l.Method === method).map((l) => l.Line) };
}

/** The captured lines that match no pattern declared for their method. */
export function UnexpectedConsoleLines(lines: readonly CapturedConsoleLine[], expected: ExpectedConsoleLines): CapturedConsoleLine[] {
  return lines.filter((l) => !(expected[l.Method] ?? []).some((p) => p.test(l.Line)));
}

/** A console call's arguments as one line: strings as given, an Error as its stack (or name and message), others as JSON. */
export function FormatConsoleArgs(args: Parameters<Console[ConsoleMethod]>): string {
  return args.map((a) => {
    if (typeof a === 'string') return a;
    if (a instanceof Error) return a.stack || `${a.name}: ${a.message}`;
    try {
      return JSON.stringify(a) ?? String(a);
    } catch {
      return String(a);
    }
  }).join(' ');
}
