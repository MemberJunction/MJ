import { MJ_CLI_RESULT_VERSION, type MJCLIResult, type OutputFormat } from './types';

/** Options for {@link SerializeResult}. */
export interface SerializeOptions {
  /**
   * Pretty-print with 2-space indent. Defaults to false.
   *
   * The caller passes `true` only when a human is looking at the output — i.e.
   * stdout is a TTY. A piped consumer gets one compact line instead: `jq` reads it
   * identically, it appends cleanly to an NDJSON log, and it costs an agent
   * meaningfully fewer tokens to carry in context.
   */
  pretty?: boolean;
}

/**
 * Single source of truth for serializing an {@link MJCLIResult} per format.
 * Both the runtime host's `Emit` and the usage commands call this so JSON/MD
 * envelopes are always rendered identically. Returns the empty string for
 * `text` — in text mode the plugin renders its own human output, not a result
 * blob. No trailing newline; callers add one.
 *
 * Always stamps {@link MJ_CLI_RESULT_VERSION} (respecting an explicit `version`
 * already on the result), so every machine-readable envelope on the wire carries
 * a contract version even though constructing one doesn't require it.
 */
export function SerializeResult(result: MJCLIResult, format: OutputFormat, options: SerializeOptions = {}): string {
  if (format === 'text') return '';

  // `version` is listed first so it leads the rendered envelope; the spread can carry
  // an explicit `version: undefined`, so re-assert the default after it.
  const versioned: MJCLIResult = { version: MJ_CLI_RESULT_VERSION, ...result };
  if (!versioned.version) versioned.version = MJ_CLI_RESULT_VERSION;
  // `md` is read by a human in a chat UI, so it is always pretty regardless.
  const indent = format === 'md' || options.pretty ? 2 : 0;
  const body = JSON.stringify(versioned, null, indent);

  return format === 'md' ? '```json\n' + body + '\n```' : body;
}
