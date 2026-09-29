import { Observable, Subject } from 'rxjs';
import { BaseSingleton } from '@memberjunction/global';
import type { DuplicateEntryCandidate, DuplicateEntryCheckResult } from '@memberjunction/graphql-dataprovider';

/**
 * How long the entry-time duplicate check waits after the last field edit before it asks the
 * server, in milliseconds. A newer edit restarts the wait. Calibration will set it from measured
 * typing pauses.
 */
export const DUPLICATE_ENTRY_CHECK_DEBOUNCE_MS = 600;

/**
 * How long the form waits for one entry-time duplicate check, in milliseconds. A check that takes
 * longer is abandoned and shows nothing, which is how the form behaves without the check.
 * Calibration will set it from the check's measured p95.
 */
export const DUPLICATE_ENTRY_CHECK_BUDGET_MS = 1500;

/** Asks the server whether the values being entered for a new record duplicate existing records. */
export type DuplicateEntryCheckFunction = (
    entityName: string,
    values: Record<string, unknown>
) => Promise<DuplicateEntryCheckResult>;

/** One field of a record, as the entry-time check reads it. A `BaseEntity`'s `EntityField` satisfies it. */
export interface DuplicateEntryCheckField {
    readonly Name: string;
    /** The field's current value, of whatever type the field holds. */
    readonly Value: unknown;
    readonly EntityFieldInfo: { readonly IsPrimaryKey: boolean };
}

/** The parts of a record the entry-time check reads. A `BaseEntity` satisfies it. */
export interface DuplicateEntryCheckRecord {
    readonly IsSaved: boolean;
    readonly EntityInfo: { readonly Name: string };
    readonly Fields: ReadonlyArray<DuplicateEntryCheckField>;
}

/**
 * The entities whose entry-time check answered `NotConfigured` this session, so forms stop asking
 * about them. Held in memory only: it resets when the app reloads and is never persisted.
 */
export class DuplicateEntryCheckSession extends BaseSingleton<DuplicateEntryCheckSession> {
    private readonly notConfigured = new Set<string>();

    protected constructor() {
        super();
    }

    /** The session-wide instance. */
    public static get Instance(): DuplicateEntryCheckSession {
        return super.getInstance<DuplicateEntryCheckSession>();
    }

    /** Whether the entity answered `NotConfigured` earlier this session. */
    public IsNotConfigured(entityName: string): boolean {
        return this.notConfigured.has(this.keyOf(entityName));
    }

    /** Records that the entity answered `NotConfigured`, so no form asks about it again this session. */
    public MarkNotConfigured(entityName: string): void {
        this.notConfigured.add(this.keyOf(entityName));
    }

    private keyOf(entityName: string): string {
        return entityName.trim().toLowerCase();
    }
}

/** The session state a controller reads and writes. {@link DuplicateEntryCheckSession} provides it. */
export type DuplicateEntryCheckSessionState = Pick<DuplicateEntryCheckSession, 'IsNotConfigured' | 'MarkNotConfigured'>;

/**
 * The values an entry-time check sends for a record: every field except primary keys and MJ system
 * fields (`__mj_*`), and only those holding a value.
 */
export function DuplicateEntryCheckValues(record: DuplicateEntryCheckRecord): Record<string, unknown> {
    const values: Record<string, unknown> = {};
    for (const field of record.Fields) {
        if (field.EntityFieldInfo.IsPrimaryKey || field.Name.startsWith('__mj_') || isEmptyValue(field.Value)) {
            continue;
        }
        values[field.Name] = field.Value;
    }
    return values;
}

function isEmptyValue(value: unknown): boolean {
    return value === null || value === undefined || (typeof value === 'string' && value.trim().length === 0);
}

/**
 * Runs the entry-time duplicate check for one form and holds the candidates to flag. Framework-free,
 * so the timing rules are testable without a DOM:
 *
 * - **New records only.** An edit to a saved record, or to an entity that answered `NotConfigured`
 *   this session, starts nothing.
 * - **Debounced.** A check starts {@link DUPLICATE_ENTRY_CHECK_DEBOUNCE_MS} after the last edit, on
 *   the record's values at that moment.
 * - **Within budget.** A check that has not answered within {@link DUPLICATE_ENTRY_CHECK_BUDGET_MS} is
 *   abandoned and shows nothing.
 * - **Newest wins.** An answer to an older check never replaces a newer one.
 * - **Flag only.** It never blocks a save; once the record is saved the notice goes away.
 */
export class DuplicateEntryCheckController {
    private readonly changed$ = new Subject<void>();

    /** Emits whenever the candidates or the notice's visibility change. */
    public readonly Changed$: Observable<void> = this.changed$.asObservable();

    private candidates: DuplicateEntryCandidate[] = [];
    private readonly dismissedIDs = new Set<string>();
    private debounceTimer: ReturnType<typeof setTimeout> | null = null;
    /** Incremented by every check that starts, and by anything that must void the checks in flight. */
    private sequence = 0;
    private disposed = false;

    /**
     * @param check asks the server about the values being entered
     * @param session where `NotConfigured` answers are remembered; the session-wide instance by default
     */
    constructor(
        private readonly check: DuplicateEntryCheckFunction,
        private readonly session: DuplicateEntryCheckSessionState = DuplicateEntryCheckSession.Instance
    ) {}

    /** The flagged candidates from the latest answer, most probable first. */
    public get Candidates(): readonly DuplicateEntryCandidate[] {
        return this.candidates;
    }

    /** Whether the notice shows: some flagged candidate has not been dismissed. */
    public get IsNoticeVisible(): boolean {
        return this.candidates.some(c => !this.dismissedIDs.has(c.RecordID));
    }

    /**
     * A person edited a field of `record`. For a new record this restarts the debounce, after which
     * the check runs on the record's values.
     */
    public RecordEdited(record: DuplicateEntryCheckRecord): void {
        if (!this.canCheck(record)) {
            return;
        }
        this.clearDebounce();
        this.debounceTimer = setTimeout(() => void this.runCheck(record), DUPLICATE_ENTRY_CHECK_DEBOUNCE_MS);
    }

    /** The record was saved: the notice goes away, and no pending or in-flight check brings it back. */
    public RecordSaved(): void {
        this.sequence++;
        this.clearDebounce();
        this.dismissedIDs.clear();
        this.show([]);
    }

    /** The person dismissed the notice. It shows again only for a candidate they have not dismissed. */
    public Dismiss(): void {
        this.candidates.forEach(c => this.dismissedIDs.add(c.RecordID));
        this.changed$.next();
    }

    /** Stops the debounce and ignores any answer still in flight. Call when the form is destroyed. */
    public Dispose(): void {
        this.disposed = true;
        this.sequence++;
        this.clearDebounce();
        this.changed$.complete();
    }

    private canCheck(record: DuplicateEntryCheckRecord): boolean {
        return !this.disposed && !record.IsSaved && !this.session.IsNotConfigured(record.EntityInfo.Name);
    }

    private async runCheck(record: DuplicateEntryCheckRecord): Promise<void> {
        this.debounceTimer = null;
        if (!this.canCheck(record)) {
            return;
        }
        const call = ++this.sequence;
        const values = DuplicateEntryCheckValues(record);
        if (Object.keys(values).length === 0) {
            this.show([]);
            return;
        }
        const entityName = record.EntityInfo.Name;
        const result = await this.withinBudget(entityName, values);
        if (call !== this.sequence || this.disposed || record.IsSaved) {
            return;
        }
        this.apply(entityName, result);
    }

    /** The check's answer, or null when it did not answer within the budget. A rejected check is a failure. */
    private async withinBudget(entityName: string, values: Record<string, unknown>): Promise<DuplicateEntryCheckResult | null> {
        let budgetTimer: ReturnType<typeof setTimeout> | undefined;
        const overBudget = new Promise<null>(resolve => {
            budgetTimer = setTimeout(() => resolve(null), DUPLICATE_ENTRY_CHECK_BUDGET_MS);
        });
        const answered = this.check(entityName, values).catch((error: unknown): DuplicateEntryCheckResult => ({
            Status: 'Failed',
            ErrorMessage: error instanceof Error ? error.message : String(error),
            Candidates: [],
        }));
        try {
            return await Promise.race([answered, overBudget]);
        } finally {
            clearTimeout(budgetTimer);
        }
    }

    /** Shows what an answer flags. Only `Checked` flags anything; `NotConfigured` stops later checks. */
    private apply(entityName: string, result: DuplicateEntryCheckResult | null): void {
        if (result?.Status === 'NotConfigured') {
            this.session.MarkNotConfigured(entityName);
        }
        this.show(result?.Status === 'Checked' ? result.Candidates : []);
    }

    private show(candidates: DuplicateEntryCandidate[]): void {
        this.candidates = candidates;
        this.changed$.next();
    }

    private clearDebounce(): void {
        if (this.debounceTimer !== null) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
    }
}
