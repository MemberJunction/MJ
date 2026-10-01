/**
 * Reading turbo's run summary.
 *
 * Both {@link DependencyPhase} and {@link CodeGenPhase} build the workspace and
 * then have to answer one question: *are the packages that failed ones we
 * expected to fail?* Getting that wrong in either direction is expensive — a
 * false "tolerate" ships a broken install as a successful one, a false "fail"
 * kills an install that was fine. This module is the single place that answers it.
 *
 * @module util/turboOutput
 * @see DependencyPhase — tolerates stale generated code before CodeGen has run.
 * @see CodeGenPhase — tolerates stale generated code during a pre-retry rebuild.
 */

/**
 * Matches an ANSI CSI escape sequence.
 *
 * turbo colourises its output whenever `FORCE_COLOR` is set in the environment,
 * and `ProcessRunner` forwards the operator's whole environment to the child.
 * The escapes sit between `Failed:` and the first package name, so a parser that
 * does not strip them silently reads zero failures. That is issue #4562: a
 * colourised summary turned the expected pre-CodeGen state of every distribution
 * install into `BUILD_FAILED`.
 */
const ANSI_ESCAPE_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]/g;

/**
 * Matches turbo's summary line and captures the task list that follows it.
 *
 * turbo prints ONE `Failed:` line naming every failed task, comma-separated:
 *
 * ```
 * Failed:    mj_generatedactions#build, mj_generatedentities#build
 * ```
 *
 * The regex this replaced required a literal `Failed:` before *each* name, so it
 * captured only the first — which made the tolerance decision depend on turbo's
 * task ordering and let a real failure ride along behind a tolerated one.
 */
const SUMMARY_LINE_PATTERN = /^[ \t]*Failed:[ \t]+(.+)$/gm;

/** Matches a single `package#task` entry from the summary list. */
const TASK_ENTRY_PATTERN = /^([@\w][^#\s]*)#\S+$/;

/**
 * What turbo's output says about a failed build.
 *
 * @see classifyTurboFailures
 */
export interface TurboFailureVerdict {
  /** Every package named on a `Failed:` line, deduplicated, in the order turbo listed them. */
  FailedPackages: string[];
  /**
   * Whether the failures could be attributed to specific packages at all.
   *
   * `false` means turbo reported a failure but printed no parseable summary,
   * OR a `Failed:` line named at least one entry that did not match the
   * expected `package#task` shape. Callers must treat that as a hard failure:
   * tolerating a failure you cannot name is how a broken install gets
   * reported as a working one.
   */
  Attributable: boolean;
  /** Whether every failed package matched `toleratedPatterns`. Always `false` when `Attributable` is `false`. */
  ToleratedOnly: boolean;
}

/**
 * Classify a failed turbo run against the set of packages the caller is willing
 * to tolerate failures in.
 *
 * @param output - Combined stdout + stderr from the turbo invocation. turbo
 *   writes the summary to **stdout**, so passing stderr alone finds nothing.
 * @param toleratedPatterns - Substrings; a failed package is tolerated when its
 *   name contains any of them. Callers pass their own set — `DependencyPhase`
 *   tolerates the generated packages before CodeGen has run, `CodeGenPhase`
 *   deliberately does not.
 * @returns The verdict. See {@link TurboFailureVerdict}.
 *
 * @example
 * ```typescript
 * const verdict = classifyTurboFailures(result.Stdout + '\n' + result.Stderr, TOLERATED);
 * if (verdict.ToleratedOnly) {
 *   // stale generated code — CodeGen will regenerate it
 * }
 * ```
 */
export function classifyTurboFailures(
  output: string,
  toleratedPatterns: readonly string[]
): TurboFailureVerdict {
  const clean = output.replace(ANSI_ESCAPE_PATTERN, '');

  const failed: string[] = [];
  let unparseable = false;
  SUMMARY_LINE_PATTERN.lastIndex = 0;
  let summary: RegExpExecArray | null;
  while ((summary = SUMMARY_LINE_PATTERN.exec(clean)) !== null) {
    for (const entry of summary[1].split(',')) {
      // trim() also clears the trailing \r on CRLF output.
      const trimmed = entry.trim();
      const task = trimmed.match(TASK_ENTRY_PATTERN);
      if (task) {
        failed.push(task[1]);
      } else if (trimmed.length > 0) {
        // A listed entry we cannot name is exactly as dangerous as no
        // summary at all — it could be hiding a real failure beside a
        // tolerated one. Never let it fall out of the count silently.
        unparseable = true;
      }
    }
  }

  const FailedPackages = [...new Set(failed)];
  const Attributable = FailedPackages.length > 0 && !unparseable;

  return {
    FailedPackages,
    Attributable,
    ToleratedOnly:
      Attributable && FailedPackages.every((pkg) => toleratedPatterns.some((pattern) => pkg.includes(pattern))),
  };
}
