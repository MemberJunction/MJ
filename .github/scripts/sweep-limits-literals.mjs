#!/usr/bin/env node
/**
 * Mechanical sweep & standards guard for numeric literals bounding work across MemberJunction.
 *
 * Scans TypeScript/JavaScript source outside tests and generated code for numeric literals
 * bounding work (`MAX_*`, `MIN_*`, `DEFAULT_*`, `LIMIT_*`, loop conditions, `MaxRows`, retry
 * counts, timeouts, iteration and turn limits, Briefing `ContributorTimeoutMs` and
 * `MaxContributorChars`), classifies every hit into:
 *   - `RunawayGuard`
 *   - `ResourceGuard`
 *   - `ProtocolLimit`
 *   - `UX`
 *   - `Tuning`
 *
 * Outputs a deterministic CSV (`file,line,name,value,enclosingFunction,label,disposition`)
 * and, when invoked with `--check-standards`, fails with exit code 1 if any unapproved
 * `RunawayGuard`-shaped literal exists outside `packages/MJCore/src/generic/limitsConfig.ts`.
 *
 * Usage:
 *   node .github/scripts/sweep-limits-literals.mjs --out docs/limits-sweep-inventory.csv
 *   node .github/scripts/sweep-limits-literals.mjs --check-standards
 *   node .github/scripts/sweep-limits-literals.mjs --root packages/AI/Agents --json
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const DEFAULT_REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CANONICAL_LIMITS_CONFIG_REL = 'packages/MJCore/src/generic/limitsConfig.ts';
export const CSV_HEADER = 'file,line,name,value,enclosingFunction,label,disposition';

export const VALID_LABELS = new Set([
    'RunawayGuard',
    'ResourceGuard',
    'ProtocolLimit',
    'UX',
    'Tuning',
]);

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

const WORK_BOUND_NAME_RE = /^(?:MAX_|MIN_|DEFAULT_|LIMIT_)|(?:^|_)(?:Max|Min|Default|Limit|Timeout|Retry|Retries|Attempts|Iterations|Turns|Wakes|MaxRows|ContributorTimeoutMs|MaxContributorChars|Consecutive|Concurrency|BatchSize|ChunkSize|WindowSize|BufferSize|CacheSize|PoolSize|PageSize|Depth|Hops|Rounds|TTL|Ttl)|(?:MaxIterations|ConsecutiveTurns|WakesPerHour|ContributorTimeoutMs|MaxContributorChars)/i;

const RUNAWAY_GUARD_NAME_RE = /^(?:(?:MAX|MIN|DEFAULT|LIMIT)_[A-Z0-9_]*(?:ITERATIONS?|CONSECUTIVE[A-Z0-9_]*TURNS?|HOURLY_WAKES?|WAKES_PER_HOUR|TASKS_PER_[A-Z0-9_]*GRAPH|CONTRIBUTOR_TIMEOUT(?:_MS)?|MAX_CONTRIBUTOR_CHARS|RUNAWAY)|(?:(?:max|min|default|limit)?(?:Agent|Loop|While|ForEach|Channel|Briefing|Graph)[A-Za-z0-9]*(?:MaxIterations|Iterations|ConsecutiveTurns|ConsecutiveAgentTurns|WakesPerHour|HourlyWakes|TasksPerAgentGraph|TasksPerGraph|ContributorTimeoutMs|MaxContributorChars))|AgentChannelConsecutiveTurns|AgentChannelWakesPerHour|AgentAbsoluteIterations|MaxTasksPerAgentGraph|WhileLoopMaxIterations|ForEachMaxIterations|MaxTasksPerGraph|BriefingContributorTimeoutMs|BriefingMaxContributorChars|MaxConsecutiveAgentTurns|MaxHourlyWakes|absoluteMaxIterations|whileMaxIterations|forEachMaxIterations|DEFAULT_ABSOLUTE_MAX_ITERATIONS|DEFAULT_WHILE_MAX_ITERATIONS|DEFAULT_FOREACH_MAX_ITERATIONS|MAX_TASKS_PER_AGENT_GRAPH|MAX_TASKS_PER_GRAPH|DEFAULT_BRIEFING_CONTRIBUTOR_TIMEOUT_MS|DEFAULT_BRIEFING_MAX_CONTRIBUTOR_CHARS|ContributorTimeoutMs|MaxContributorChars)$/i;

const RUNAWAY_FALLBACK_EXPR_RE = /(?:whileOp|forEach|op|params|channel)\.(?:maxIterations|absoluteMaxIterations|MaxConsecutiveAgentTurns|MaxHourlyWakes)/i;

const PROTOCOL_LIMIT_NAME_RE = /^(?:MAX_TOOL_NAME_LENGTH|MAX_TIMER_MS|MAX_EMAIL_LENGTH|CLOSE_[A-Z_]+|MAX_GRAPH_EDGE_RECORD_ID_LENGTH|MAX_TIME_ZONE_LENGTH)$/;

const RESOURCE_GUARD_NAME_RE = /(?:Retries|Retry|Attempts|Concurrency|Timeout|Depth|Hops|Rounds|RateLimit|MaxRows|Batch|Queue|Buffer|Settlement|Reinvoke|Preemption|ChainLength|DecisionRequestsPerTurn|DecisionCallsPerTurn|ConversationToolCallsPerTurn|PipelineStages|MapElements|MaxSize|MaxSessions|MaxTools|MaxDirectIn|MaxPending|MaxFrames|MaxBytes)/i;

const UX_PATH_RE = /^packages\/(?:Angular|React|Web|AngularElements)\//;
const UX_NAME_RE = /(?:Preview|Snippet|Label|NameLength|Title|Truncat|Display|Nav|Toast|Debounce|Animation|Tooltip|Viewport|ColumnWidth|Sidebar|Modal|Chart|Color|Font|Zoom|Scroll|Breadcrumb|ErrorMessage|Logged.*Chars|ARTIFACT_NAME_MAX_LENGTH|MAX_AUDIT_SUMMARY_LENGTH)/i;

const COMMENT_TAG_RE = /\/\/\s*(RunawayGuard|ResourceGuard|ProtocolLimit|UX|Tuning)\s*:\s*(.+)/;

const CANONICAL_RUNAWAY_KEYS = new Set([
    'AgentChannelConsecutiveTurns',
    'AgentChannelWakesPerHour',
    'AgentAbsoluteIterations',
    'MaxTasksPerAgentGraph',
    'WhileLoopMaxIterations',
    'ForEachMaxIterations',
    'MaxTasksPerGraph',
    'BriefingContributorTimeoutMs',
    'BriefingMaxContributorChars',
    'MaxWallClockMs',
]);

const CANONICAL_RESOURCE_GUARD_NAMES = new Set([
    'MaxValidationRetries',
    'MaxConsecutiveFailedSteps',
    'MaxConsecutiveUnproductiveRetries',
    'MaxRepeatedFailingStep',
    'MaxConsecutiveReadToolPreemptions',
    'FinalPayloadValidationMaxRetries',
    'MaxRunChainLength',
    'MaxAgentRunTreeDepth',
    'MaxHandoffHops',
    'MaxSubAgentConsultRounds',
    'MaxDecisionRequestsPerTurn',
    'MaxDecisionCallsPerTurn',
    'MaxConversationToolCallsPerTurn',
    'MaxSettlementRetryPasses',
    'MaxReinvokeDepth',
    'MaxProviderRaiseAttempts',
    'ClientToolTimeoutMs',
    'PipelineDeadlineMs',
    'MaxPipelineStages',
    'MaxMapElements',
    'MaxLoopConcurrency',
    'MaxRealtimeConsecutiveAgentTurns',
]);

function walkSourceFiles(dir, out = []) {
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

function evaluateNumericExpr(node) {
    if (ts.isNumericLiteral(node)) {
        return Number(node.text);
    }
    if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(node.operand)) {
        return -Number(node.operand.text);
    }
    if (ts.isParenthesizedExpression(node)) {
        return evaluateNumericExpr(node.expression);
    }
    if (ts.isBinaryExpression(node)) {
        const left = evaluateNumericExpr(node.left);
        const right = evaluateNumericExpr(node.right);
        if (left === null || right === null) return null;
        switch (node.operatorToken.kind) {
            case ts.SyntaxKind.AsteriskToken: return left * right;
            case ts.SyntaxKind.PlusToken: return left + right;
            case ts.SyntaxKind.MinusToken: return left - right;
            case ts.SyntaxKind.SlashToken: return right !== 0 ? left / right : null;
            default: return null;
        }
    }
    return null;
}

function readExplicitCommentTag(lines, lineIndexZeroBased) {
    const ownLine = lines[lineIndexZeroBased] ?? '';
    const ownMatch = COMMENT_TAG_RE.exec(ownLine);
    if (ownMatch) return { label: ownMatch[1], detail: ownMatch[2].trim() };

    for (let i = lineIndexZeroBased - 1; i >= 0 && i >= lineIndexZeroBased - 4; i--) {
        const trimmed = (lines[i] ?? '').trim();
        if (trimmed === '') break;
        const match = COMMENT_TAG_RE.exec(trimmed);
        if (match) return { label: match[1], detail: match[2].trim() };
        if (!trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*')) break;
    }
    return null;
}

function isInsideSkippedCallOrType(node) {
    for (let cur = node.parent; cur; cur = cur.parent) {
        if (ts.isTypeNode(cur) || ts.isInterfaceDeclaration(cur) || ts.isTypeAliasDeclaration(cur)) {
            return true;
        }
        // Skip Zod schema validators like z.number().min(1).max(100)
        if (ts.isCallExpression(cur)) {
            const calleeText = cur.expression.getText?.() ?? '';
            if (calleeText.startsWith('z.') || calleeText.includes('.min(') || calleeText.includes('.max(')) {
                return true;
            }
        }
    }
    return false;
}

function extractHitFromNode(node, sf, fnStack) {
    if (isInsideSkippedCallOrType(node)) return null;

    const p = node.parent;
    let name = null;
    let isFallbackExpr = false;
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
            p.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
            p.operatorToken.kind === ts.SyntaxKind.EqualsToken)
    ) {
        const leftText = p.left.getText(sf).trim();
        if (leftText.length <= 80 && !leftText.includes('\n')) {
            name = leftText;
            isFallbackExpr =
                p.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
                p.operatorToken.kind === ts.SyntaxKind.BarBarToken;
        }
    } else if (
        ts.isBinaryExpression(p) &&
        p.right === node &&
        (p.operatorToken.kind === ts.SyntaxKind.LessThanToken ||
            p.operatorToken.kind === ts.SyntaxKind.LessThanEqualsToken ||
            p.operatorToken.kind === ts.SyntaxKind.GreaterThanToken ||
            p.operatorToken.kind === ts.SyntaxKind.GreaterThanEqualsToken) &&
        p.parent &&
        (ts.isWhileStatement(p.parent) || ts.isForStatement(p.parent) || ts.isDoStatement(p.parent))
    ) {
        const leftText = p.left.getText(sf).trim();
        if (WORK_BOUND_NAME_RE.test(leftText)) {
            name = leftText;
            isLoopBound = true;
        }
    }

    if (!name) return null;
    if (!isLoopBound && !WORK_BOUND_NAME_RE.test(name) && !CANONICAL_RUNAWAY_KEYS.has(name) && !CANONICAL_RESOURCE_GUARD_NAMES.has(name) && !(isFallbackExpr && RUNAWAY_FALLBACK_EXPR_RE.test(name))) {
        return null;
    }

    const numericVal = evaluateNumericExpr(node);
    if (numericVal === null || !Number.isFinite(numericVal)) return null;
    // Ignore trivial sentinel numbers like -1, 0, 1 unless explicitly named MAX_/MIN_/LIMIT_/DEFAULT_
    if (Math.abs(numericVal) <= 1 && !/^(?:MAX_|MIN_|DEFAULT_|LIMIT_)/.test(name)) {
        return null;
    }

    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    return {
        line: line + 1,
        name,
        value: String(numericVal),
        numericValue: numericVal,
        enclosingFunction: fnStack.length > 0 ? fnStack.join('.') : '<module>',
        isFallbackExpr,
        isLoopBound,
    };
}

/**
 * Classifies a swept numeric literal hit into one of the 5 canonical categories and determines its disposition.
 */
export function ClassifyLimitHit(relFile, hit, explicitTag) {
    const normalizedFile = relFile.split('\\').join('/');

    if (normalizedFile === CANONICAL_LIMITS_CONFIG_REL) {
        if (CANONICAL_RUNAWAY_KEYS.has(hit.name)) {
            return { label: 'RunawayGuard', disposition: 'canonical-limits-resolver' };
        }
        if (CANONICAL_RESOURCE_GUARD_NAMES.has(hit.name)) {
            return { label: 'ResourceGuard', disposition: 'canonical-limits-resolver' };
        }
        return { label: 'Tuning', disposition: 'canonical-limits-resolver' };
    }

    if (explicitTag && VALID_LABELS.has(explicitTag.label)) {
        const label = explicitTag.label;
        const disposition =
            label === 'ProtocolLimit'
                ? 'retained-protocol-limit-documented'
                : label === 'UX'
                    ? 'retained-ux-local'
                    : label === 'RunawayGuard'
                        ? 'unapproved-runaway-guard'
                        : label === 'ResourceGuard'
                            ? 'annotated-resource-guard'
                            : 'annotated-tuning-local';
        return { label, disposition };
    }

    if (PROTOCOL_LIMIT_NAME_RE.test(hit.name)) {
        return { label: 'ProtocolLimit', disposition: 'retained-protocol-limit' };
    }

    if (UX_PATH_RE.test(normalizedFile) || UX_NAME_RE.test(hit.name)) {
        return { label: 'UX', disposition: 'retained-ux-local' };
    }

    if (
        (RUNAWAY_GUARD_NAME_RE.test(hit.name) || RUNAWAY_FALLBACK_EXPR_RE.test(hit.name)) &&
        !hit.isLoopBound
    ) {
        return { label: 'RunawayGuard', disposition: 'unapproved-runaway-guard' };
    }

    if (RESOURCE_GUARD_NAME_RE.test(hit.name)) {
        return { label: 'ResourceGuard', disposition: 'local-resource-guard' };
    }

    return { label: 'Tuning', disposition: 'local-tuning-default' };
}

function scanSingleFile(absPath, repoRoot) {
    const text = readFileSync(absPath, 'utf8');
    const lines = text.split(/\r?\n/);
    const relFile = relative(repoRoot, absPath).split('\\').join('/');
    const scriptKind = absPath.endsWith('.tsx') || absPath.endsWith('.jsx')
        ? ts.ScriptKind.TSX
        : absPath.endsWith('.js') || absPath.endsWith('.mjs') || absPath.endsWith('.cjs')
            ? ts.ScriptKind.JS
            : ts.ScriptKind.TS;
    const sf = ts.createSourceFile(absPath, text, ts.ScriptTarget.Latest, true, scriptKind);
    const records = [];
    const seenPositions = new Set();

    function visit(node, fnStack) {
        let nextStack = fnStack;
        if (
            ts.isFunctionDeclaration(node) ||
            ts.isMethodDeclaration(node) ||
            ts.isFunctionExpression(node) ||
            ts.isArrowFunction(node) ||
            ts.isGetAccessorDeclaration(node) ||
            ts.isSetAccessorDeclaration(node)
        ) {
            const fnName =
                node.name && ts.isIdentifier(node.name)
                    ? node.name.text
                    : ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)
                        ? node.parent.name.text
                        : '<anon>';
            nextStack = [...fnStack, fnName];
        } else if (ts.isClassDeclaration(node) && node.name) {
            nextStack = [...fnStack, node.name.text];
        }

        const isCandidateExpr =
            ts.isNumericLiteral(node) ||
            (ts.isBinaryExpression(node) &&
                node.parent &&
                (ts.isVariableDeclaration(node.parent) || ts.isPropertyDeclaration(node.parent) || ts.isPropertyAssignment(node.parent)));

        if (isCandidateExpr) {
            const hit = extractHitFromNode(node, sf, fnStack);
            if (hit) {
                const dedupKey = `${hit.line}:${hit.name}`;
                if (!seenPositions.has(dedupKey)) {
                    seenPositions.add(dedupKey);
                    const explicitTag = readExplicitCommentTag(lines, hit.line - 1);
                    const { label, disposition } = ClassifyLimitHit(relFile, hit, explicitTag);
                    records.push({
                        file: relFile,
                        line: hit.line,
                        name: hit.name,
                        value: hit.value,
                        enclosingFunction: hit.enclosingFunction,
                        label,
                        disposition,
                    });
                }
            }
            // Do not recurse into evaluated binary expression child literals to avoid duplicate hits
            if (ts.isBinaryExpression(node) && hit) {
                return;
            }
        }

        ts.forEachChild(node, (child) => visit(child, nextStack));
    }

    visit(sf, []);
    return records;
}

/**
 * Runs the mechanical numeric literal sweep across `roots` under `repoRoot`.
 */
export function SweepLimitsLiterals(options = {}) {
    const repoRoot = options.repoRoot ?? DEFAULT_REPO_ROOT;
    const roots = options.roots && options.roots.length > 0 ? options.roots : ['packages'];
    const files = [];
    for (const root of roots) {
        const absRoot = resolve(repoRoot, root);
        walkSourceFiles(absRoot, files);
    }
    const records = [];
    for (const absFile of files) {
        records.push(...scanSingleFile(absFile, repoRoot));
    }
    records.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.name.localeCompare(b.name));
    return {
        filesScanned: files.length,
        records,
    };
}

/**
 * Returns unapproved `RunawayGuard` violations outside `packages/MJCore/src/generic/limitsConfig.ts`.
 */
export function FindUnapprovedRunawayGuards(records) {
    return records.filter(
        (r) => r.label === 'RunawayGuard' && r.file !== CANONICAL_LIMITS_CONFIG_REL,
    );
}

function escapeCsvField(value) {
    const str = String(value ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

/**
 * Formats swept inventory records as RFC-4180 CSV with the exact required columns:
 * `file,line,name,value,enclosingFunction,label,disposition`.
 */
export function FormatInventoryCsv(records) {
    const rows = [CSV_HEADER];
    for (const r of records) {
        rows.push(
            [
                escapeCsvField(r.file),
                escapeCsvField(r.line),
                escapeCsvField(r.name),
                escapeCsvField(r.value),
                escapeCsvField(r.enclosingFunction),
                escapeCsvField(r.label),
                escapeCsvField(r.disposition),
            ].join(','),
        );
    }
    return `${rows.join('\n')}\n`;
}

function parseCliArgs(argv) {
    const opts = {
        repoRoot: DEFAULT_REPO_ROOT,
        roots: [],
        outPath: null,
        checkStandards: false,
        json: false,
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--root' && argv[i + 1]) {
            opts.roots.push(argv[++i]);
        } else if (arg === '--repo-root' && argv[i + 1]) {
            opts.repoRoot = resolve(argv[++i]);
        } else if (arg === '--out' && argv[i + 1]) {
            opts.outPath = argv[++i];
        } else if (arg === '--check-standards') {
            opts.checkStandards = true;
        } else if (arg === '--json') {
            opts.json = true;
        }
    }
    if (opts.roots.length === 0) {
        opts.roots.push('packages');
    }
    return opts;
}

function main() {
    const opts = parseCliArgs(process.argv.slice(2));
    const { filesScanned, records } = SweepLimitsLiterals({
        repoRoot: opts.repoRoot,
        roots: opts.roots,
    });

    if (opts.outPath) {
        const absOut = resolve(opts.repoRoot, opts.outPath);
        mkdirSync(dirname(absOut), { recursive: true });
        writeFileSync(absOut, FormatInventoryCsv(records), 'utf8');
        if (!opts.json) {
            console.log(`Wrote ${records.length} inventory rows across ${filesScanned} files to ${opts.outPath}`);
        }
    }

    const unapproved = FindUnapprovedRunawayGuards(records);
    if (opts.json) {
        console.log(
            JSON.stringify(
                {
                    filesScanned,
                    totalHits: records.length,
                    unapprovedRunawayGuards: unapproved,
                },
                null,
                2,
            ),
        );
    } else if (!opts.outPath && !opts.checkStandards) {
        process.stdout.write(FormatInventoryCsv(records));
    }

    if (opts.checkStandards) {
        if (unapproved.length > 0) {
            console.error(`✗ limits-literals check failed: ${unapproved.length} unapproved RunawayGuard literal(s) found outside ${CANONICAL_LIMITS_CONFIG_REL}:`);
            for (const v of unapproved) {
                console.error(`  ${v.file}:${v.line}  ${v.name} = ${v.value} (${v.enclosingFunction}) — move into LimitsConfigResolver (${CANONICAL_LIMITS_CONFIG_REL})`);
            }
            process.exit(1);
        }
        console.log(`✓ limits-literals check passed (${filesScanned} files scanned, ${records.length} classified literals, 0 unapproved RunawayGuard literals outside ${CANONICAL_LIMITS_CONFIG_REL}).`);
    }
}

const isEntrypoint = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntrypoint) {
    main();
}
