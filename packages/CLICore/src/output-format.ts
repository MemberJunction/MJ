/**
 * Dual-output resolution: a human at a terminal gets text, a pipe gets JSON.
 *
 * The agent-facing failure this fixes is mundane and constant — `mj codegen | jq`
 * used to hand `jq` a figlet banner and a spinner, because the machine format was
 * only reachable by remembering `--format=json`. A caller that redirects stdout has
 * already told us it is a machine; nothing further should be required of it.
 *
 * {@link ResolveOutputFormat} is a pure function over injected state so every
 * precedence rule is testable without a real TTY.
 */
import type { OutputFormat } from './types';

/** Env var that pins the output format for a whole shell session. */
export const FORMAT_ENV = 'MJ_CLI_FORMAT';

/** Inputs to {@link ResolveOutputFormat}. Every field is injectable for tests. */
export interface FormatResolutionInput {
  /** Raw `--format` value, if the caller passed one. Accepts the aliases below. */
  formatFlag?: string;
  /** Legacy `--json` boolean, still declared by a few commands. */
  jsonFlag?: boolean;
  /** Defaults to `process.stdout.isTTY`. */
  stdoutIsTTY?: boolean;
  /** Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
}

/** The resolved format plus the rule that produced it (machine-stable, for tests and `--verbose`). */
export interface FormatResolution {
  format: OutputFormat;
  reason: 'format-flag' | 'json-flag' | 'env' | 'piped' | 'tty-default';
}

/**
 * Canonicalizes the spellings different MJ command families grew independently.
 *
 * `mj test *` shipped `console|json|markdown`, `mj ai *` shipped `compact|json|table`,
 * and the plugin commands shipped `text|json|md`. All three keep working; they just
 * mean the same three things now. Returns `undefined` for an unrecognized value so
 * the caller can fall through rather than silently picking a format.
 */
export function NormalizeFormatAlias(value: string | undefined): OutputFormat | undefined {
  if (!value) return undefined;
  switch (value.trim().toLowerCase()) {
    case 'text':
    case 'human':
    case 'pretty':
    case 'console':
    case 'compact':
    case 'table':
      return 'text';
    case 'json':
      return 'json';
    case 'md':
    case 'markdown':
      return 'md';
    default:
      return undefined;
  }
}

/**
 * Resolves the output format, most explicit signal first:
 *
 * 1. `--format` (any recognized alias)
 * 2. `--json`
 * 3. {@link FORMAT_ENV}
 * 4. stdout is not a TTY → `json` — the pipe *is* the request
 * 5. otherwise `text`
 */
export function ResolveOutputFormat(input: FormatResolutionInput = {}): FormatResolution {
  const env = input.env ?? process.env;

  const explicit = NormalizeFormatAlias(input.formatFlag);
  if (explicit) return { format: explicit, reason: 'format-flag' };

  if (input.jsonFlag === true) return { format: 'json', reason: 'json-flag' };

  const fromEnv = NormalizeFormatAlias(env[FORMAT_ENV]);
  if (fromEnv) return { format: fromEnv, reason: 'env' };

  const stdoutIsTTY = input.stdoutIsTTY ?? process.stdout.isTTY === true;
  if (!stdoutIsTTY) return { format: 'json', reason: 'piped' };

  return { format: 'text', reason: 'tty-default' };
}

/**
 * True when decorative chrome (banner, spinners, color) should be suppressed:
 * any machine format, or a non-TTY stdout even in text mode.
 *
 * Kept separate from format resolution because a command can legitimately be in
 * text mode while piped (`--format=text > file.txt`) and still want no spinner.
 */
export function ShouldSuppressChrome(format: OutputFormat, stdoutIsTTY?: boolean): boolean {
  if (format !== 'text') return true;
  return !(stdoutIsTTY ?? process.stdout.isTTY === true);
}
