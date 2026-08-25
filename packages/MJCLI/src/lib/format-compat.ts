/**
 * Bridges the per-family output flags to the one canonical `--format` contract.
 *
 * Three command families grew their own spelling of the same idea:
 *
 * | family           | flag                | values                      |
 * |------------------|---------------------|-----------------------------|
 * | plugin commands  | `--format`          | `text` \| `json` \| `md`     |
 * | `mj test *`      | `--format`          | `console` \| `json` \| `markdown` |
 * | `mj ai *`        | `--output` / `-o`   | `compact` \| `json` \| `table`    |
 *
 * An agent that learned one spelling got a parse error — or worse, in the `mj ai`
 * case, silence — from the next. Worse still, `-o` means *output format* under
 * `mj ai` but *output file path* under `mj test`, `querygen export`, and
 * `sql-audit`, so `-o json` writes a file called `json` in half the CLI.
 *
 * {@link resolveLegacyFormat} keeps every existing value working while making all
 * three families accept the canonical spellings and honor the same TTY-detection
 * default. {@link CANONICAL_FORMAT_FLAG} is the shared flag definition to add
 * alongside a family's own.
 */
import { Flags } from '@oclif/core';
import { NormalizeFormatAlias, ResolveOutputFormat, type OutputFormat } from '@memberjunction/cli-core';

/**
 * The canonical `--format` flag for commands that are not yet `BaseCLIPlugin`
 * subclasses (which inherit it from `baseFlags`).
 *
 * Deliberately has **no `default`**: the absence of a value is the signal that
 * lets {@link resolveLegacyFormat} fall through to the family default or to
 * TTY detection. A default here would make every run look explicit.
 *
 * Note `char` is omitted — `-f` and `-o` already mean other things in these
 * families, and quietly rebinding a short flag is how the `-o` collision started.
 */
export const CANONICAL_FORMAT_FLAG = Flags.string({
  options: ['text', 'json', 'md', 'human', 'console', 'markdown', 'compact', 'table'],
  description:
    'Output format: text (human), json (machine-readable), md (Markdown). ' +
    'Defaults to human output on a terminal and json when stdout is piped. ' +
    'Legacy spellings (console/markdown/compact/table) are accepted.',
});

/** Inputs to {@link resolveLegacyFormat}. */
export interface LegacyFormatInput<TLegacy extends string> {
  /** The canonical `--format` value, if the caller passed one. */
  format?: string;
  /** The family's own flag value as oclif parsed it (its default included). */
  legacy: TLegacy;
  /** What that flag defaults to, so an explicit choice can be told from a default. */
  legacyDefault: TLegacy;
  /** How each canonical format maps onto this family's vocabulary. */
  map: Record<OutputFormat, TLegacy>;
  /** Defaults to `process.stdout.isTTY`. Injectable for tests. */
  stdoutIsTTY?: boolean;
  /** Defaults to `process.env`. Injectable for tests. */
  env?: NodeJS.ProcessEnv;
}

/**
 * Resolves which value of a family's own output flag to use, honoring — in order:
 *
 * 1. an explicit canonical `--format`,
 * 2. an explicit legacy value (anything other than the family default),
 * 3. `MJ_CLI_FORMAT`,
 * 4. a piped stdout → the family's json value,
 * 5. the family default.
 *
 * Rule 2 is what makes this backwards compatible: an existing script passing
 * `--format=markdown` or `-o table` keeps getting exactly what it always got.
 * Rule 4 only fires when the caller expressed no preference at all, so it can
 * never override an intentional choice.
 */
export function resolveLegacyFormat<TLegacy extends string>(input: LegacyFormatInput<TLegacy>): TLegacy {
  const explicitCanonical = NormalizeFormatAlias(input.format);
  if (explicitCanonical) return input.map[explicitCanonical];

  // The caller set the family's own flag to something other than its default —
  // that is an explicit choice and outranks any inference we could make.
  if (input.legacy !== input.legacyDefault) return input.legacy;

  const { format, reason } = ResolveOutputFormat({
    stdoutIsTTY: input.stdoutIsTTY,
    env: input.env,
  });

  // 'tty-default' means nothing at all asked for a format — keep the family's own
  // default rather than flattening every human rendering to a generic 'text'.
  return reason === 'tty-default' ? input.legacyDefault : input.map[format];
}

/** Canonical → `mj test *` vocabulary. */
export const TEST_FORMAT_MAP: Record<OutputFormat, 'console' | 'json' | 'markdown'> = {
  text: 'console',
  json: 'json',
  md: 'markdown',
};

/**
 * Canonical → `mj ai *` vocabulary.
 *
 * `md` maps to `json` because most `mj ai` commands have no Markdown renderer;
 * the ones that do (`mj ai audit agent-run`) pass their own map with `markdown`.
 */
export const AI_FORMAT_MAP: Record<OutputFormat, 'compact' | 'json' | 'table'> = {
  text: 'compact',
  json: 'json',
  md: 'json',
};
