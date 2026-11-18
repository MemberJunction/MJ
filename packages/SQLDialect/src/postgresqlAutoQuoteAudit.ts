import { BaseSingleton } from '@memberjunction/global';
import { AutoQuotePostgreSQLIdentifiers } from './postgresqlAutoQuote.js';

/**
 * Where an auto-quoted statement came from: the runtime data provider or CodeGen.
 */
export type PostgreSQLAutoQuoteSite = 'runtime' | 'codegen';

/**
 * Receives one audit line. Callers pass their own logger (MJ uses a verbose-only status log),
 * so this package stays free of a logging dependency.
 */
export type PostgreSQLAutoQuoteAuditLogger = (message: string) => void;

/**
 * Settings for {@link PostgreSQLAutoQuoteAuditor.Configure}.
 */
export interface PostgreSQLAutoQuoteAuditSettings {
    /** Log statements the shim changes. Defaults to {@link DefaultPostgreSQLAutoQuoteAuditEnabled}. */
    Enabled?: boolean;
    /** Most distinct statements logged per process; later ones are counted but not logged. Default 1000. */
    MaxDistinctStatements?: number;
}

/**
 * The audit default when no configuration names one: on outside production, off in production.
 * The audit exists to find stored SQL (RLS filters, views, queries) that still depends on the
 * shim, which is a dev / staging task.
 */
export function DefaultPostgreSQLAutoQuoteAuditEnabled(): boolean {
    const env = typeof process !== 'undefined' ? process.env?.NODE_ENV : undefined;
    return (env ?? '').toLowerCase() !== 'production';
}

const DEFAULT_MAX_DISTINCT = 1000;

/** Frames that belong to the shim or its two call sites, skipped when naming the caller. */
const INTERNAL_FRAME_MARKERS = [
    'postgresqlAutoQuote',
    'PostgreSQLDataProvider',
    'PostgreSQLCodeGenProvider',
    'node:internal',
    '/node_modules/pg/',
    '/node_modules/pg-pool/',
];

/**
 * Change-only audit of the PostgreSQL auto-quote shim (#4435, phase 1).
 *
 * `AutoQuotePostgreSQLIdentifiers` rewrites every PostgreSQL statement at run time and in CodeGen,
 * and when it guesses wrong the result is a silently wrong answer, not an error. Before the shim
 * can be removed, every statement that still depends on it has to be found. This auditor logs a
 * statement the first time the shim CHANGES it — the original text, the identifiers it quoted,
 * and the first caller frame outside the shim — and never logs an unchanged statement. Each
 * distinct statement is logged once (keyed by a hash), up to a cap, so a hot query does not
 * flood the log. Behavior of the shim itself is unchanged.
 */
export class PostgreSQLAutoQuoteAuditor extends BaseSingleton<PostgreSQLAutoQuoteAuditor> {
    private _enabled: boolean = DefaultPostgreSQLAutoQuoteAuditEnabled();
    private _maxDistinct: number = DEFAULT_MAX_DISTINCT;
    private readonly _seen: Set<string> = new Set();
    private _suppressed: number = 0;

    public constructor() {
        super();
    }

    public static get Instance(): PostgreSQLAutoQuoteAuditor {
        return PostgreSQLAutoQuoteAuditor.getInstance<PostgreSQLAutoQuoteAuditor>();
    }

    /** Whether changed statements are logged. */
    public get Enabled(): boolean {
        return this._enabled;
    }

    /** Distinct changed statements seen past the cap (counted, not logged). */
    public get SuppressedCount(): number {
        return this._suppressed;
    }

    /** Distinct changed statements logged so far. */
    public get LoggedCount(): number {
        return this._seen.size;
    }

    /**
     * Applies settings. An omitted `Enabled` keeps the environment default.
     */
    public Configure(settings: PostgreSQLAutoQuoteAuditSettings): void {
        this._enabled = settings.Enabled ?? DefaultPostgreSQLAutoQuoteAuditEnabled();
        if (settings.MaxDistinctStatements != null && settings.MaxDistinctStatements >= 0) {
            this._maxDistinct = settings.MaxDistinctStatements;
        }
    }

    /** Clears the seen-statement set and counters (tests, or a fresh audit window). */
    public Reset(): void {
        this._seen.clear();
        this._suppressed = 0;
    }

    /**
     * Records one shim pass. Logs only when the audit is on, the output differs from the input,
     * and this statement has not been logged before.
     */
    public Record(original: string, rewritten: string, site: PostgreSQLAutoQuoteSite, log: PostgreSQLAutoQuoteAuditLogger): void {
        if (!this._enabled || original === rewritten) {
            return;
        }
        const key = hashStatement(original);
        if (this._seen.has(key)) {
            return;
        }
        if (this._seen.size >= this._maxDistinct) {
            this._suppressed++;
            return;
        }
        this._seen.add(key);
        const tokens = ChangedIdentifiers(original, rewritten);
        const caller = FirstCallerFrame(new Error().stack);
        log(
            `[pgAutoQuoteAudit] ${site}: auto-quote changed a statement` +
            ` | quoted: ${tokens.length > 0 ? tokens.join(', ') : '(none detected)'}` +
            ` | caller: ${caller ?? '(unknown)'}` +
            ` | sql: ${original}`
        );
    }
}

/**
 * Runs the shim and records the pass with {@link PostgreSQLAutoQuoteAuditor}. Returns exactly what
 * {@link AutoQuotePostgreSQLIdentifiers} returns.
 */
export function AutoQuotePostgreSQLIdentifiersAudited(
    sql: string,
    site: PostgreSQLAutoQuoteSite,
    log: PostgreSQLAutoQuoteAuditLogger,
): string {
    const rewritten = AutoQuotePostgreSQLIdentifiers(sql);
    const auditor = PostgreSQLAutoQuoteAuditor.Instance;
    if (auditor.Enabled) {
        auditor.Record(sql, rewritten, site, log);
    }
    return rewritten;
}

/**
 * The identifiers the shim quoted: names that appear double-quoted more often in the output than in
 * the input. Sorted and de-duplicated so the log line is stable.
 */
export function ChangedIdentifiers(original: string, rewritten: string): string[] {
    const before = countQuoted(original);
    const after = countQuoted(rewritten);
    const changed: string[] = [];
    for (const [name, count] of after) {
        if (count > (before.get(name) ?? 0)) {
            changed.push(name);
        }
    }
    return changed.sort();
}

/**
 * The first stack frame outside the shim, its call sites and the pg driver, trimmed of the
 * leading `at `. Undefined when there is none.
 */
export function FirstCallerFrame(stack: string | undefined): string | undefined {
    if (!stack) {
        return undefined;
    }
    const frames = stack.split('\n').slice(1).map((f) => f.trim()).filter((f) => f.startsWith('at '));
    const frame = frames.find((f) => !INTERNAL_FRAME_MARKERS.some((m) => f.includes(m)));
    return frame ? frame.slice(3) : undefined;
}

function countQuoted(sql: string): Map<string, number> {
    const counts = new Map<string, number>();
    const re = /"([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) {
        counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
    }
    return counts;
}

/** 53-bit string hash (cyrb53): a set key only, not a security boundary. */
function hashStatement(text: string): string {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < text.length; i++) {
        const ch = text.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36) + ':' + text.length;
}
