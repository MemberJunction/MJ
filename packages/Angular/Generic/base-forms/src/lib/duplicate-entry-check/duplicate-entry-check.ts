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

/**
 * How long one check may keep the form from starting another, in milliseconds. A form has at most
 * one check in flight: edits made meanwhile wait for its answer, then run as one check on the latest
 * values. The server stops a check at its own budget, a little above
 * {@link DUPLICATE_ENTRY_CHECK_BUDGET_MS} (`DUPLICATE_ENTRY_CHECK_SERVER_BUDGET_MS` in
 * `@memberjunction/ai-vector-dupe`, 2000 ms), so a check still unanswered at this point was lost in
 * transport, and no longer holds the next one back.
 */
export const DUPLICATE_ENTRY_CHECK_IN_FLIGHT_LIMIT_MS = 3000;

/**
 * The most characters of one field's text a check sends. Longer text is cut, which keeps the request
 * under the server's size limit however long a note is. The server cuts to the same length before
 * the text reaches the template or the decision model.
 */
export const DUPLICATE_ENTRY_CHECK_MAX_FIELD_TEXT_LENGTH = 500;

/** Asks the server whether the values being entered for a new record duplicate existing records. */
export type DuplicateEntryCheckFunction = (
    entityName: string,
    values: Record<string, DuplicateEntryCheckValue>
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
 * The entities the entry-time check has stopped asking about this session: those that answered
 * `NotConfigured` (no entity document turns the check on) or `NotAuthorized` (the user may not run
 * it). Held in memory only: it resets when the app reloads and is never persisted.
 */
export class DuplicateEntryCheckSession extends BaseSingleton<DuplicateEntryCheckSession> {
    private readonly stopped = new Set<string>();

    protected constructor() {
        super();
    }

    /** The session-wide instance. */
    public static get Instance(): DuplicateEntryCheckSession {
        return super.getInstance<DuplicateEntryCheckSession>();
    }

    /** Whether the check stopped asking about the entity earlier this session. */
    public IsStopped(entityName: string): boolean {
        return this.stopped.has(this.keyOf(entityName));
    }

    /** Stops the check for the entity, so no form asks about it again this session. */
    public Stop(entityName: string): void {
        this.stopped.add(this.keyOf(entityName));
    }

    private keyOf(entityName: string): string {
        return entityName.trim().toLowerCase();
    }
}

/** The session state a controller reads and writes. {@link DuplicateEntryCheckSession} provides it. */
export type DuplicateEntryCheckSessionState = Pick<DuplicateEntryCheckSession, 'IsStopped' | 'Stop'>;

/** One value an entry-time check sends. */
export type DuplicateEntryCheckValue = string | number | boolean;

/**
 * The values an entry-time check sends for a record: every field except primary keys and MJ system
 * fields (`__mj_*`), and only those holding a value. Text is cut to
 * {@link DUPLICATE_ENTRY_CHECK_MAX_FIELD_TEXT_LENGTH} characters and a date is sent as its ISO
 * string; a value of any other kind is not sent, since the server accepts only scalars.
 */
export function DuplicateEntryCheckValues(record: DuplicateEntryCheckRecord): Record<string, DuplicateEntryCheckValue> {
    const values: Record<string, DuplicateEntryCheckValue> = {};
    for (const field of record.Fields) {
        if (field.EntityFieldInfo.IsPrimaryKey || field.Name.startsWith('__mj_')) {
            continue;
        }
        const value = toCheckValue(field.Value);
        if (value !== null) {
            values[field.Name] = value;
        }
    }
    return values;
}

/** A field's value as a check sends it, or null when it sends none: empty, or not a scalar. */
function toCheckValue(value: unknown): DuplicateEntryCheckValue | null {
    if (typeof value === 'string') {
        return value.trim().length === 0 ? null : value.slice(0, DUPLICATE_ENTRY_CHECK_MAX_FIELD_TEXT_LENGTH);
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value.toISOString();
    }
    return null;
}

/**
 * Runs the entry-time duplicate check for one form and holds the candidates to flag. Framework-free,
 * so the timing rules are testable without a DOM:
 *
 * - **New records only.** An edit to a saved record, or to an entity the check stopped asking about
 *   this session (it answered `NotConfigured` or `NotAuthorized`), starts nothing.
 * - **Debounced.** A check starts {@link DUPLICATE_ENTRY_CHECK_DEBOUNCE_MS} after the last edit, on
 *   the record's values at that moment.
 * - **One at a time.** A form has at most one check in flight. A check due meanwhile waits for it to
 *   answer (or for {@link DUPLICATE_ENTRY_CHECK_IN_FLIGHT_LIMIT_MS}), and however many edits came in
 *   between, runs once, on the latest values. Checks never pile up on the server.
 * - **Within budget.** A check that has not answered within {@link DUPLICATE_ENTRY_CHECK_BUDGET_MS} is
 *   abandoned and shows nothing.
 * - **Newest wins.** An answer to a check that newer edits have overtaken is never shown.
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
    /** Whether a check is in flight, so the next one must wait. */
    private inFlight = false;
    /** The record of the check waiting for the one in flight, if any. */
    private waiting: DuplicateEntryCheckRecord | null = null;

    /**
     * @param check asks the server about the values being entered
     * @param session where the entities the check stopped for are remembered; the session-wide
     *   instance by default
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
        this.waiting = null;
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
        this.waiting = null;
        this.clearDebounce();
        this.changed$.complete();
    }

    private canCheck(record: DuplicateEntryCheckRecord): boolean {
        return !this.disposed && !record.IsSaved && !this.session.IsStopped(record.EntityInfo.Name);
    }

    private async runCheck(record: DuplicateEntryCheckRecord): Promise<void> {
        this.debounceTimer = null;
        if (!this.canCheck(record)) {
            return;
        }
        if (this.inFlight) {
            // Wait for the check in flight; its answer is for older values, so it is void.
            this.waiting = record;
            this.sequence++;
            return;
        }
        const call = ++this.sequence;
        const values = DuplicateEntryCheckValues(record);
        if (Object.keys(values).length === 0) {
            this.show([]);
            return;
        }
        const entityName = record.EntityInfo.Name;
        const answered = this.ask(entityName, values);
        this.holdUntilAnswered(answered);
        const result = await this.withinBudget(answered);
        if (call !== this.sequence || this.disposed || record.IsSaved) {
            return;
        }
        this.apply(entityName, result);
    }

    /** The check's answer. A rejected check is a failure, so the promise never rejects. */
    private ask(entityName: string, values: Record<string, DuplicateEntryCheckValue>): Promise<DuplicateEntryCheckResult> {
        return this.check(entityName, values).catch((error: unknown): DuplicateEntryCheckResult => ({
            Status: 'Failed',
            ErrorMessage: error instanceof Error ? error.message : String(error),
            Candidates: [],
        }));
    }

    /**
     * Marks a check in flight until it answers, or until {@link DUPLICATE_ENTRY_CHECK_IN_FLIGHT_LIMIT_MS}
     * passes, then runs the check that waited for it, if any.
     */
    private holdUntilAnswered(answered: Promise<DuplicateEntryCheckResult>): void {
        this.inFlight = true;
        let limitTimer: ReturnType<typeof setTimeout> | undefined;
        const limit = new Promise<void>(resolve => {
            limitTimer = setTimeout(resolve, DUPLICATE_ENTRY_CHECK_IN_FLIGHT_LIMIT_MS);
        });
        void Promise.race([answered, limit]).then(() => {
            clearTimeout(limitTimer);
            this.inFlight = false;
            this.runWaiting();
        });
    }

    private runWaiting(): void {
        const record = this.waiting;
        this.waiting = null;
        if (record) {
            void this.runCheck(record);
        }
    }

    /** The answer, or null when it did not come within the budget. */
    private async withinBudget(answered: Promise<DuplicateEntryCheckResult>): Promise<DuplicateEntryCheckResult | null> {
        let budgetTimer: ReturnType<typeof setTimeout> | undefined;
        const overBudget = new Promise<null>(resolve => {
            budgetTimer = setTimeout(() => resolve(null), DUPLICATE_ENTRY_CHECK_BUDGET_MS);
        });
        try {
            return await Promise.race([answered, overBudget]);
        } finally {
            clearTimeout(budgetTimer);
        }
    }

    /**
     * Shows what an answer flags. Only `Checked` flags anything; `NotConfigured` and `NotAuthorized`
     * stop later checks of the entity for the session.
     */
    private apply(entityName: string, result: DuplicateEntryCheckResult | null): void {
        if (result?.Status === 'NotConfigured' || result?.Status === 'NotAuthorized') {
            this.session.Stop(entityName);
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
