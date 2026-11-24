/**
 * @fileoverview The limits-literals standard (`RunawayGuard` enforcement).
 *
 * Ensures no new unapproved `RunawayGuard`-shaped numeric literal (iteration backstops,
 * consecutive-turn caps, hourly wake caps, task-graph node ceilings, briefing contributor
 * limits, etc.) is introduced outside the central `LimitsConfigResolver`
 * (`packages/MJCore/src/generic/limitsConfig.ts`).
 *
 * Mirrors `.github/scripts/sweep-limits-literals.mjs --check-standards`.
 *
 * @module @memberjunction/standards
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import type * as TSApi from 'typescript';
import type { CheckContext, CheckResult, StandardCheck, Violation } from '../types.js';

type TypeScriptApi = typeof TSApi;

let typeScriptLoad: Promise<TypeScriptApi | null> | undefined;

/**
 * Resolve `typescript` as an optional peer dependency (category 2 of the repo's
 * dynamic-import rule — see `naming-conventions.ts` for full rationale).
 */
function loadTypeScript(): Promise<TypeScriptApi | null> {
    // dynamic-import: optional peer dependency (typescript) loaded lazily so client repos without tsc degrade cleanly
    typeScriptLoad ??= import('typescript')
        .then((mod) => ((mod as { default?: TypeScriptApi }).default ?? mod) as TypeScriptApi)
        .catch(() => null);
    return typeScriptLoad;
}

const DEFAULT_ALLOWED_FILES = ['packages/MJCore/src/generic/limitsConfig.ts'];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs']);
const SKIP_DIRS = new Set([
    'node_modules',
    'dist',
    'build',
    'coverage',
    '__tests__',
    '__mocks__',
    'generated',
    'bundled-libs',
    'vendor',
    '.angular',
    '.turbo',
    '.git',
    'unit-testing',
]);
const SKIP_FILE_RE = /\.(?:test|spec|dom\.test|d)\.(?:ts|tsx|mts|cts|js|mjs|cjs)$|^(?:vitest|vite)\.config\./;

const RUNAWAY_GUARD_NAME_RE =
    /^(?:(?:MAX|MIN|DEFAULT|LIMIT)_[A-Z0-9_]*(?:ITERATIONS?|CONSECUTIVE[A-Z0-9_]*TURNS?|HOURLY_WAKES?|WAKES_PER_HOUR|TASKS_PER_[A-Z0-9_]*GRAPH|CONTRIBUTOR_TIMEOUT(?:_MS)?|MAX_CONTRIBUTOR_CHARS|RUNAWAY)|(?:(?:max|min|default|limit)?(?:Agent|Loop|While|ForEach|Channel|Briefing|Graph)[A-Za-z0-9]*(?:MaxIterations|Iterations|ConsecutiveTurns|ConsecutiveAgentTurns|WakesPerHour|HourlyWakes|TasksPerAgentGraph|TasksPerGraph|ContributorTimeoutMs|MaxContributorChars))|AgentChannelConsecutiveTurns|AgentChannelWakesPerHour|AgentAbsoluteIterations|MaxTasksPerAgentGraph|WhileLoopMaxIterations|ForEachMaxIterations|MaxTasksPerGraph|BriefingContributorTimeoutMs|BriefingMaxContributorChars|MaxConsecutiveAgentTurns|MaxHourlyWakes|absoluteMaxIterations|whileMaxIterations|forEachMaxIterations|DEFAULT_ABSOLUTE_MAX_ITERATIONS|DEFAULT_WHILE_MAX_ITERATIONS|DEFAULT_FOREACH_MAX_ITERATIONS|MAX_TASKS_PER_AGENT_GRAPH|MAX_TASKS_PER_GRAPH|DEFAULT_BRIEFING_CONTRIBUTOR_TIMEOUT_MS|DEFAULT_BRIEFING_MAX_CONTRIBUTOR_CHARS|ContributorTimeoutMs|MaxContributorChars)$/i;

const RUNAWAY_FALLBACK_EXPR_RE =
    /(?:whileOp|forEach|op|params|channel)\.(?:maxIterations|absoluteMaxIterations|MaxConsecutiveAgentTurns|MaxHourlyWakes)/i;

const LOOP_GUARD_VAR_RE = /^(?:turn|turns|iteration|iterations)$/i;

const GENERIC_LOOP_COUNTER_RE = /^(?:i|j|k|idx|count|n)$/i;

const LARGE_LOOP_BOUND_THRESHOLD = 10_000;

const INTEGRATION_BENCHMARK_PATH_RE = /^packages\/TestingFramework\/integration-test-suite\//;

const COMMENT_EXEMPT_RE = /\/\/\s*(?:ProtocolLimit|UX|ResourceGuard|Tuning)\s*:/;

function walkSourceFiles(dir: string, out: string[] = []): string[] {
    if (!existsSync(dir)) return out;
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
        if (SKIP_DIRS.has(entry.name)) continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            walkSourceFiles(full, out);
        } else if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name)) && !SKIP_FILE_RE.test(entry.name)) {
            out.push(full);
        }
    }
    return out;
}

function hasNonRunawayAnnotation(lines: string[], lineIndexZeroBased: number): boolean {
    if (COMMENT_EXEMPT_RE.test(lines[lineIndexZeroBased] ?? '')) return true;
    for (let i = lineIndexZeroBased - 1; i >= 0 && i >= lineIndexZeroBased - 4; i--) {
        const trimmed = (lines[i] ?? '').trim();
        if (trimmed === '') break;
        if (COMMENT_EXEMPT_RE.test(trimmed)) return true;
        if (!trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*')) break;
    }
    return false;
}

function isInsideSkippedNode(ts: TypeScriptApi, node: TSApi.Node): boolean {
    for (let cur: TSApi.Node | undefined = node.parent; cur; cur = cur.parent) {
        if (ts.isTypeNode(cur) || ts.isInterfaceDeclaration(cur) || ts.isTypeAliasDeclaration(cur)) {
            return true;
        }
    }
    return false;
}

function isArithmeticOperator(ts: TypeScriptApi, kind: TSApi.SyntaxKind): boolean {
    return (
        kind === ts.SyntaxKind.AsteriskToken ||
        kind === ts.SyntaxKind.PlusToken ||
        kind === ts.SyntaxKind.MinusToken ||
        kind === ts.SyntaxKind.SlashToken ||
        kind === ts.SyntaxKind.PercentToken ||
        kind === ts.SyntaxKind.AsteriskAsteriskToken
    );
}

function isLoopComparisonOperator(ts: TypeScriptApi, kind: TSApi.SyntaxKind): boolean {
    return (
        kind === ts.SyntaxKind.LessThanToken ||
        kind === ts.SyntaxKind.LessThanEqualsToken ||
        kind === ts.SyntaxKind.GreaterThanToken ||
        kind === ts.SyntaxKind.GreaterThanEqualsToken
    );
}

function isInsideLoopCondition(ts: TypeScriptApi, comparisonNode: TSApi.BinaryExpression): boolean {
    let cur: TSApi.Node = comparisonNode;
    while (cur.parent) {
        const parent = cur.parent;
        if (ts.isWhileStatement(parent) || ts.isDoStatement(parent)) {
            return parent.expression === cur;
        }
        if (ts.isForStatement(parent)) {
            return parent.condition === cur;
        }
        if (ts.isParenthesizedExpression(parent) || ts.isBinaryExpression(parent)) {
            cur = parent;
            continue;
        }
        break;
    }
    return false;
}

function evaluateNumeric(ts: TypeScriptApi, node: TSApi.Node): number | null {
    if (ts.isNumericLiteral(node)) return Number(node.text);
    if (ts.isParenthesizedExpression(node)) return evaluateNumeric(ts, node.expression);
    if (ts.isPrefixUnaryExpression(node)) {
        const operandVal = evaluateNumeric(ts, node.operand);
        if (operandVal === null) return null;
        if (node.operator === ts.SyntaxKind.MinusToken) return -operandVal;
        if (node.operator === ts.SyntaxKind.PlusToken) return operandVal;
        return null;
    }
    if (ts.isBinaryExpression(node) && isArithmeticOperator(ts, node.operatorToken.kind)) {
        const l = evaluateNumeric(ts, node.left);
        const r = evaluateNumeric(ts, node.right);
        if (l === null || r === null) return null;
        switch (node.operatorToken.kind) {
            case ts.SyntaxKind.AsteriskToken:
                return l * r;
            case ts.SyntaxKind.PlusToken:
                return l + r;
            case ts.SyntaxKind.MinusToken:
                return l - r;
            case ts.SyntaxKind.SlashToken:
                return r !== 0 ? l / r : null;
            case ts.SyntaxKind.PercentToken:
                return r !== 0 ? l % r : null;
            case ts.SyntaxKind.AsteriskAsteriskToken:
                return l ** r;
            default:
                return null;
        }
    }
    return null;
}

function scanFileForRunawayLiterals(ts: TypeScriptApi, absPath: string, repoRoot: string): Violation[] {
    const text = readFileSync(absPath, 'utf8');
    const lines = text.split(/\r?\n/);
    const rel = relative(repoRoot, absPath).split('\\').join('/');
    const scriptKind = absPath.endsWith('.tsx') || absPath.endsWith('.jsx')
        ? ts.ScriptKind.TSX
        : absPath.endsWith('.js') || absPath.endsWith('.mjs') || absPath.endsWith('.cjs')
            ? ts.ScriptKind.JS
            : ts.ScriptKind.TS;
    const sf = ts.createSourceFile(absPath, text, ts.ScriptTarget.Latest, true, scriptKind);
    const violations: Violation[] = [];
    const seen = new Set<string>();

    const visit = (node: TSApi.Node): void => {
        const isCandidate =
            ts.isNumericLiteral(node) ||
            (ts.isBinaryExpression(node) && isArithmeticOperator(ts, node.operatorToken.kind)) ||
            (ts.isPrefixUnaryExpression(node) &&
                (node.operator === ts.SyntaxKind.MinusToken || node.operator === ts.SyntaxKind.PlusToken));

        if (isCandidate && !isInsideSkippedNode(ts, node)) {
            const p = node.parent;
            let name: string | null = null;
            let isFallback = false;
            let isLoopBound = false;
            if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name) && p.initializer === node) {
                name = p.name.text;
            } else if (ts.isPropertyDeclaration(p) && ts.isIdentifier(p.name) && p.initializer === node) {
                name = p.name.text;
            } else if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.initializer === node) {
                name = p.name.text;
            } else if (ts.isParameter(p) && ts.isIdentifier(p.name) && p.initializer === node) {
                name = p.name.text;
            } else if (
                ts.isBinaryExpression(p) &&
                p.right === node &&
                (p.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
                    p.operatorToken.kind === ts.SyntaxKind.BarBarToken)
            ) {
                name = p.left.getText(sf).trim();
                isFallback = true;
            } else if (
                ts.isBinaryExpression(p) &&
                p.right === node &&
                isLoopComparisonOperator(ts, p.operatorToken.kind) &&
                isInsideLoopCondition(ts, p)
            ) {
                name = p.left.getText(sf).trim();
                isLoopBound = true;
            }

            const val = evaluateNumeric(ts, node);
            const isTestBenchmarkPath = INTEGRATION_BENCHMARK_PATH_RE.test(rel);
            const matchesName =
                name !== null &&
                (RUNAWAY_GUARD_NAME_RE.test(name) ||
                    (isFallback && RUNAWAY_FALLBACK_EXPR_RE.test(name)) ||
                    (isLoopBound &&
                        !isTestBenchmarkPath &&
                        (LOOP_GUARD_VAR_RE.test(name) ||
                            (GENERIC_LOOP_COUNTER_RE.test(name) && val !== null && Math.abs(val) >= LARGE_LOOP_BOUND_THRESHOLD))));

            if (matchesName && name && val !== null && Number.isFinite(val)) {
                const qualifies = isLoopBound
                    ? Math.abs(val) > 1
                    : Math.abs(val) > 1 || /^(?:MAX_|MIN_|DEFAULT_|LIMIT_)/.test(name);
                if (qualifies) {
                    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
                    const key = `${line}:${name}`;
                    if (!seen.has(key) && !hasNonRunawayAnnotation(lines, line - 1)) {
                        seen.add(key);
                        violations.push({
                            File: rel,
                            Line: line,
                            Message:
                                `Unapproved RunawayGuard literal "${name} = ${val}" outside LimitsConfigResolver. ` +
                                `Resolve via LimitsConfigResolver.Instance in @memberjunction/core (CODE_FALLBACK_LIMITS).`,
                        });
                    }
                    // Skip descending into sub-literals of an already evaluated constant expression
                    if (!ts.isNumericLiteral(node)) {
                        return;
                    }
                }
            }
        }
        ts.forEachChild(node, visit);
    };

    visit(sf);
    return violations;
}

async function run(context: CheckContext): Promise<CheckResult> {
    const ts = await loadTypeScript();
    if (!ts) {
        return {
            Violations: [],
            Notes: ['typescript compiler not available — limits-literals scan skipped.'],
        };
    }

    const allowedFiles = new Set(
        ((context.Options['AllowedFiles'] as string[] | undefined) ?? DEFAULT_ALLOWED_FILES).map((f) =>
            f.split('\\').join('/'),
        ),
    );

    const files: string[] = [];
    for (const root of context.Roots) {
        walkSourceFiles(join(context.RepoRoot, root), files);
    }

    const violations: Violation[] = [];
    let scanned = 0;
    for (const file of files) {
        const rel = relative(context.RepoRoot, file).split('\\').join('/');
        if (allowedFiles.has(rel)) continue;
        scanned++;
        violations.push(...scanFileForRunawayLiterals(ts, file, context.RepoRoot));
    }

    return {
        Violations: violations,
        Notes: [`${scanned} source file(s) scanned for unapproved RunawayGuard literals.`],
    };
}

/** The registered limits-literals standard. */
export const LimitsLiteralsCheck: StandardCheck = {
    Id: 'limits-literals',
    Title: 'RunawayGuard numeric literals live only in LimitsConfigResolver',
    Since: '6.3.0',
    DefaultSeverity: 'error',
    DocsUrl: 'https://github.com/MemberJunction/MJ/blob/next/docs/limits-sweep-inventory.csv',
    Description:
        'Forbids unapproved RunawayGuard-shaped numeric literals (iteration caps, consecutive-turn caps, ' +
        'hourly wake limits, task-graph node limits, briefing contributor caps) outside ' +
        'packages/MJCore/src/generic/limitsConfig.ts. Resolve all runaway backstops through LimitsConfigResolver.Instance.',
    DefaultRoots: ['packages'],
    DefaultOptions: {
        AllowedFiles: DEFAULT_ALLOWED_FILES,
    },
    Run: run,
};
