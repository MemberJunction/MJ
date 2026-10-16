import type {
    CheckIssue,
    CheckIssueCategory,
    CheckIssueSeverity,
} from '@memberjunction/video-studio-core';

/** Check issue code emitted when `hyperframes check --json` output cannot be parsed. */
export const MJ_CHECK_CLI_UNREADABLE_CODE = 'MJ_CHECK_CLI_UNREADABLE';

/** Check issue code emitted when the `hyperframes check` CLI subprocess fails or crashes. */
export const MJ_CHECK_CLI_FAILED_CODE = 'MJ_CHECK_CLI_FAILED';

interface HyperFramesCliFinding {
    code?: unknown;
    severity?: unknown;
    message?: unknown;
    selector?: unknown;
    sourceFile?: unknown;
    file?: unknown;
    line?: unknown;
    time?: unknown;
    firstSeen?: unknown;
}

interface HyperFramesCliSection {
    findings?: unknown;
}

interface HyperFramesCliReport {
    ok?: unknown;
    layout?: HyperFramesCliSection;
    contrast?: HyperFramesCliSection;
    motion?: HyperFramesCliSection;
}

/**
 * Builds a single `MJ_CHECK_CLI_FAILED` Warning issue when the `hyperframes check` CLI subprocess
 * crashes, times out, or fails to execute.
 */
export function BuildCheckCliFailedIssue(reason: string): CheckIssue {
    const trimmed = reason.trim() || 'Unknown CLI failure';
    return {
        Code: MJ_CHECK_CLI_FAILED_CODE,
        Category: 'Lint',
        Severity: 'Warning',
        Message: `HyperFrames check CLI failed: ${trimmed}`,
    };
}

/**
 * Builds a single `MJ_CHECK_CLI_UNREADABLE` Warning issue when `hyperframes check --json` stdout
 * is empty, malformed JSON, or missing expected audit sections.
 */
export function BuildCheckCliUnreadableIssue(reason: string): CheckIssue {
    const trimmed = reason.trim() || 'Unparseable CLI JSON output';
    return {
        Code: MJ_CHECK_CLI_UNREADABLE_CODE,
        Category: 'Lint',
        Severity: 'Warning',
        Message: `HyperFrames check CLI output was unreadable: ${trimmed}`,
    };
}

/**
 * Maps `hyperframes check --json` output into `CheckIssue[]` (VS-RND-5 Step 7):
 * - `layout.findings` → `Layout`
 * - `contrast.findings` → `Contrast`
 * - `motion.findings` → `Lint`
 * - `severity === 'error'` → `'Error'`, anything else → `'Warning'`
 * - Unparseable output → one `MJ_CHECK_CLI_UNREADABLE` Warning with the reason.
 */
export function MapHyperFramesCheckOutput(json: string | unknown): CheckIssue[] {
    const parsed = parseCliReport(json);
    if (!parsed.report) {
        return [BuildCheckCliUnreadableIssue(parsed.reason ?? 'Unparseable CLI JSON output')];
    }

    const report = parsed.report;
    const issues: CheckIssue[] = [];

    appendSectionFindings(report.layout, 'Layout', issues);
    appendSectionFindings(report.contrast, 'Contrast', issues);
    appendSectionFindings(report.motion, 'Lint', issues);

    return issues;
}

function parseCliReport(
    input: string | unknown,
): { report?: HyperFramesCliReport; reason?: string } {
    let value: unknown = input;
    if (typeof input === 'string') {
        const trimmed = input.trim();
        if (!trimmed) {
            return { reason: 'CLI stdout was empty.' };
        }
        try {
            value = JSON.parse(trimmed);
        } catch (error) {
            return {
                reason: error instanceof Error ? error.message : String(error),
            };
        }
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { reason: 'CLI output root is not a JSON object.' };
    }

    const candidate = value as HyperFramesCliReport;
    const hasSection =
        isSectionObject(candidate.layout) ||
        isSectionObject(candidate.contrast) ||
        isSectionObject(candidate.motion);
    if (!hasSection) {
        return {
            reason: 'CLI JSON object does not contain layout, contrast, or motion sections.',
        };
    }

    return { report: candidate };
}

function isSectionObject(section: unknown): section is HyperFramesCliSection {
    return (
        Boolean(section) &&
        typeof section === 'object' &&
        !Array.isArray(section) &&
        Array.isArray((section as HyperFramesCliSection).findings)
    );
}

function appendSectionFindings(
    section: HyperFramesCliSection | undefined,
    category: CheckIssueCategory,
    out: CheckIssue[],
): void {
    if (!isSectionObject(section) || !Array.isArray(section.findings)) {
        return;
    }

    for (const raw of section.findings) {
        if (!raw || typeof raw !== 'object') {
            continue;
        }
        const finding = raw as HyperFramesCliFinding;
        const code =
            typeof finding.code === 'string' && finding.code.trim()
                ? finding.code.trim()
                : `hyperframes_${category.toLowerCase()}_finding`;
        const severity: CheckIssueSeverity =
            typeof finding.severity === 'string' && finding.severity.toLowerCase() === 'error'
                ? 'Error'
                : 'Warning';
        const message =
            typeof finding.message === 'string' && finding.message.trim()
                ? finding.message.trim()
                : `HyperFrames ${category.toLowerCase()} check reported ${code}.`;
        const selector =
            typeof finding.selector === 'string' && finding.selector.trim()
                ? finding.selector.trim()
                : undefined;
        const file =
            typeof finding.sourceFile === 'string' && finding.sourceFile.trim()
                ? finding.sourceFile.trim()
                : typeof finding.file === 'string' && finding.file.trim()
                  ? finding.file.trim()
                  : undefined;
        const line =
            typeof finding.line === 'number' && Number.isFinite(finding.line)
                ? finding.line
                : undefined;
        const time =
            typeof finding.time === 'number' && Number.isFinite(finding.time)
                ? finding.time
                : typeof finding.firstSeen === 'number' && Number.isFinite(finding.firstSeen)
                  ? finding.firstSeen
                  : undefined;

        out.push({
            Code: code,
            Category: category,
            Severity: severity,
            Message: message,
            ...(file !== undefined ? { File: file } : {}),
            ...(line !== undefined ? { Line: line } : {}),
            ...(time !== undefined ? { TimestampSeconds: time } : {}),
            ...(selector !== undefined ? { Selector: selector } : {}),
        });
    }
}
