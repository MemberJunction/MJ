/**
 * @fileoverview The type model for MJ standards.
 *
 * The whole design turns on one requirement: **a new standard must never break an older repo's
 * build.** Everything below exists to make that structurally true rather than a promise.
 *
 * @module @memberjunction/standards
 */

/**
 * How loudly a check reports.
 *
 * - `off`   — registered but not run. The state every check is in until a repo opts in.
 * - `warn`  — reported, exit code stays 0. What a newly-adopted check should be for one cycle.
 * - `error` — reported, exit code 1.
 */
export type Severity = 'off' | 'warn' | 'error';

/** One thing a check found wrong. */
export interface Violation {
    /** Repo-relative path of the offending file. */
    File: string;
    /** 1-based line, or 0 for a whole-file / manifest finding. */
    Line: number;
    /** What is wrong, and — always — what to do instead. */
    Message: string;
    /** The package the file belongs to, when the check knows it. */
    Package?: string;
}

/** Everything a check is given to do its work. */
export interface CheckContext {
    /** Absolute path to the repository root. */
    RepoRoot: string;
    /** Roots to scan, repo-relative. Comes from the check's own config, falling back to the repo's. */
    Roots: string[];
    /** The check's own options block from `.mj-standards.json`, verbatim. */
    Options: Readonly<Record<string, unknown>>;
}

/** What a check returns. */
export interface CheckResult {
    Violations: Violation[];
    /**
     * Things the check wants said that are not violations — "12 packages scanned, 3 skipped".
     * Printed under the check's heading; never affects exit code.
     */
    Notes?: string[];
}

/**
 * A standard, as registered.
 *
 * ## The version contract
 *
 * `Since` is the MJ version that introduced the check. A repo records the version it adopted
 * against (`standardsVersion` in its config). Checks introduced *after* that version are reported
 * as **available**, never enabled — so upgrading `@memberjunction/standards` can add rules without
 * changing any repo's result until a human runs `mj standards adopt --upgrade`.
 *
 * `DefaultSeverity` is what `adopt` writes into a repo's config when it first enables the check.
 * It is a starting point for new adopters, **not** a live value: changing it here never changes
 * an already-adopted repo, because the repo's config holds its own severity.
 *
 * That asymmetry is the whole point. Severity can decay forward (`warn` → `error` on a major, by
 * the repo's own choice) and never backward into a repo that has already shipped.
 */
export interface StandardCheck {
    /** Stable, kebab-case identifier. Used as the config key — renaming one is a breaking change. */
    Id: string;
    /** One line, imperative: what the check enforces. */
    Title: string;
    /** MJ version that introduced this check, e.g. `'6.0.0'`. */
    Since: string;
    /** Severity `adopt` writes for a NEW adopter. Never applied to an already-configured repo. */
    DefaultSeverity: Exclude<Severity, 'off'>;
    /** Where the reasoning lives. Printed with every failure — a rule without a why gets ignored. */
    DocsUrl: string;
    /** Longer explanation, shown by `mj standards list`. */
    Description: string;
    /** Default roots to scan when the repo doesn't name any. */
    DefaultRoots: string[];
    /** Options `adopt` writes for a new adopter. */
    DefaultOptions?: Record<string, unknown>;
    /** Do the work. Must not throw for ordinary findings — return them as violations. */
    Run(context: CheckContext): Promise<CheckResult> | CheckResult;
}

/** A single check's entry in `.mj-standards.json`. */
export interface CheckConfig {
    Severity: Severity;
    /** Overrides the check's `DefaultRoots`. */
    Roots?: string[];
    /** Check-specific options. */
    Options?: Record<string, unknown>;
}

/**
 * `.mj-standards.json` — a repo's adoption record.
 *
 * Deliberately explicit rather than convention-driven: reading this file should tell you exactly
 * which standards this repo has agreed to and how strictly, without knowing anything about the
 * version of the tool that will read it.
 */
export interface StandardsConfig {
    /** JSON-schema pointer, for editor completion. */
    $schema?: string;
    /**
     * The MJ version this repo adopted standards against.
     *
     * Checks with a `Since` greater than this are reported as available and are NOT run. Bumping
     * this is a deliberate act (`mj standards adopt --upgrade`), never a side effect of upgrading
     * the package.
     */
    StandardsVersion: string;
    /** Default roots for checks that don't name their own. */
    Roots?: string[];
    /** Per-check configuration. A check absent from this map does not run. */
    Checks: Record<string, CheckConfig>;
}

/** One check's outcome, after severity is applied. */
export interface CheckOutcome {
    Check: StandardCheck;
    Severity: Exclude<Severity, 'off'>;
    Violations: Violation[];
    Notes: string[];
}

/** The whole run. */
export interface RunSummary {
    Outcomes: CheckOutcome[];
    /** Registered checks the repo has not adopted, and whether they postdate its adoption. */
    Available: Array<{ Check: StandardCheck; PostdatesAdoption: boolean }>;
    /** Config keys that match no registered check — usually a typo or a removed standard. */
    UnknownCheckIds: string[];
    ErrorCount: number;
    WarningCount: number;
}
