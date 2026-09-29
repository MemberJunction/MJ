import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DuplicateEntryCandidate, DuplicateEntryCheckResult } from '@memberjunction/graphql-dataprovider';
import {
    DUPLICATE_ENTRY_CHECK_BUDGET_MS,
    DUPLICATE_ENTRY_CHECK_DEBOUNCE_MS,
    DuplicateEntryCheckController,
    DuplicateEntryCheckSession,
    DuplicateEntryCheckValues,
    type DuplicateEntryCheckField,
    type DuplicateEntryCheckFunction,
    type DuplicateEntryCheckRecord,
    type DuplicateEntryCheckSessionState,
} from '../duplicate-entry-check/duplicate-entry-check';

/**
 * The form side of the entry-time duplicate check: when it calls, how long it waits, which answer
 * wins, and when the notice goes away. Timers are faked, and the server is a function the test
 * answers by hand.
 */

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** A record being entered: the parts of a BaseEntity the check reads. */
class FakeRecord implements DuplicateEntryCheckRecord {
    public IsSaved = false;
    public readonly EntityInfo: { Name: string };
    public readonly Fields: DuplicateEntryCheckField[];

    constructor(entityName: string, values: Record<string, unknown>) {
        this.EntityInfo = { Name: entityName };
        this.Fields = [
            { Name: 'ID', Value: 'new-id-1', EntityFieldInfo: { IsPrimaryKey: true } },
            { Name: '__mj_CreatedAt', Value: new Date('2026-09-29T00:00:00Z'), EntityFieldInfo: { IsPrimaryKey: false } },
            ...Object.entries(values).map(([Name, Value]) => ({ Name, Value, EntityFieldInfo: { IsPrimaryKey: false } })),
        ];
    }

    /** A person types into a field. */
    public Edit(fieldName: string, value: unknown): void {
        const index = this.Fields.findIndex(f => f.Name === fieldName);
        this.Fields[index] = { ...this.Fields[index], Value: value };
    }
}

/** A session of its own for each test, so NotConfigured answers do not leak between tests. */
class FakeSession implements DuplicateEntryCheckSessionState {
    private readonly entities = new Set<string>();
    public IsNotConfigured(entityName: string): boolean {
        return this.entities.has(entityName.toLowerCase());
    }
    public MarkNotConfigured(entityName: string): void {
        this.entities.add(entityName.toLowerCase());
    }
}

/** A promise the test settles by hand. */
function deferred<T>(): { Promise: Promise<T>; Resolve: (value: T) => void } {
    let resolve: (value: T) => void = () => undefined;
    const promise = new Promise<T>(r => { resolve = r; });
    return { Promise: promise, Resolve: resolve };
}

const candidate = (recordID: string, probability: number | null = 0.8): DuplicateEntryCandidate => ({
    RecordID: recordID, DisplayName: `Account ${recordID}`, VectorScore: 0.9, Probability: probability,
});

const checked = (...candidates: DuplicateEntryCandidate[]): DuplicateEntryCheckResult => ({ Status: 'Checked', Candidates: candidates, ElapsedMs: 200 });

let check: ReturnType<typeof vi.fn<DuplicateEntryCheckFunction>>;
let session: FakeSession;
let controller: DuplicateEntryCheckController;
let record: FakeRecord;

/** Lets every due timer fire and every settled promise run its continuations. */
const settle = () => vi.advanceTimersByTimeAsync(0);

/** An edit, then the full debounce, so the check has started. */
async function editAndWait(fieldName = 'Name', value: unknown = 'Acme'): Promise<void> {
    record.Edit(fieldName, value);
    controller.RecordEdited(record);
    await vi.advanceTimersByTimeAsync(DUPLICATE_ENTRY_CHECK_DEBOUNCE_MS);
}

beforeEach(() => {
    vi.useFakeTimers();
    check = vi.fn<DuplicateEntryCheckFunction>().mockResolvedValue(checked());
    session = new FakeSession();
    controller = new DuplicateEntryCheckController(check, session);
    record = new FakeRecord('Accounts', { Name: '', City: 'Boston', Notes: null });
});

afterEach(() => {
    controller.Dispose();
    vi.useRealTimers();
});

// ─── When it calls ───────────────────────────────────────────────────────────

describe('DuplicateEntryCheckController: when it calls', () => {
    it('makes no call for a saved record', async () => {
        record.IsSaved = true;

        await editAndWait();
        await vi.advanceTimersByTimeAsync(10_000);

        expect(check).not.toHaveBeenCalled();
    });

    it('debounces: one call, after the last edit plus the debounce, with the values at that moment', async () => {
        record.Edit('Name', 'Ac');
        controller.RecordEdited(record);
        await vi.advanceTimersByTimeAsync(DUPLICATE_ENTRY_CHECK_DEBOUNCE_MS - 100);
        record.Edit('Name', 'Acme');
        controller.RecordEdited(record);
        await vi.advanceTimersByTimeAsync(DUPLICATE_ENTRY_CHECK_DEBOUNCE_MS - 1);

        expect(check).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(1);

        expect(check).toHaveBeenCalledTimes(1);
        expect(check).toHaveBeenCalledWith('Accounts', { Name: 'Acme', City: 'Boston' });
    });

    it('sends no key, no system field and no empty value', () => {
        record.Edit('Name', '   ');

        expect(DuplicateEntryCheckValues(record)).toEqual({ City: 'Boston' });
    });

    it('makes no call while no field holds a value', async () => {
        record = new FakeRecord('Accounts', { Name: '' });

        await editAndWait('Name', '');

        expect(check).not.toHaveBeenCalled();
    });
});

// ─── The budget ──────────────────────────────────────────────────────────────

describe('DuplicateEntryCheckController: the budget', () => {
    it('abandons a call that misses the budget, and shows nothing for it', async () => {
        await editAndWait();
        expect(controller.IsNoticeVisible).toBe(false);
        check.mockResolvedValueOnce(checked(candidate('acct-1')));
        await editAndWait('Name', 'Acme Corp');
        expect(controller.Candidates.map(c => c.RecordID)).toEqual(['acct-1']);

        const slow = deferred<DuplicateEntryCheckResult>();
        check.mockReturnValueOnce(slow.Promise);
        await editAndWait('Name', 'Acme Corporation');
        await vi.advanceTimersByTimeAsync(DUPLICATE_ENTRY_CHECK_BUDGET_MS - 1);
        expect(controller.Candidates.map(c => c.RecordID)).toEqual(['acct-1']);

        await vi.advanceTimersByTimeAsync(1);
        expect(controller.Candidates).toEqual([]);
        expect(controller.IsNoticeVisible).toBe(false);

        slow.Resolve(checked(candidate('acct-2')));
        await settle();
        expect(controller.Candidates).toEqual([]);
    });

    it('shows an answer that arrives within the budget', async () => {
        const answer = deferred<DuplicateEntryCheckResult>();
        check.mockReturnValueOnce(answer.Promise);
        await editAndWait();

        await vi.advanceTimersByTimeAsync(DUPLICATE_ENTRY_CHECK_BUDGET_MS - 1);
        answer.Resolve(checked(candidate('acct-1')));
        await settle();

        expect(controller.IsNoticeVisible).toBe(true);
        expect(controller.Candidates.map(c => c.RecordID)).toEqual(['acct-1']);
    });
});

// ─── Which answer wins ───────────────────────────────────────────────────────

describe('DuplicateEntryCheckController: which answer wins', () => {
    it('ignores a stale answer that arrives after a newer call has started', async () => {
        const older = deferred<DuplicateEntryCheckResult>();
        const newer = deferred<DuplicateEntryCheckResult>();
        check.mockReturnValueOnce(older.Promise).mockReturnValueOnce(newer.Promise);
        await editAndWait('Name', 'Acme');
        await editAndWait('Name', 'Acme Inc');

        older.Resolve(checked(candidate('acct-old')));
        await settle();
        expect(controller.Candidates).toEqual([]);

        newer.Resolve(checked(candidate('acct-new')));
        await settle();
        expect(controller.Candidates.map(c => c.RecordID)).toEqual(['acct-new']);
    });

    it('never lets a stale answer overwrite a fresh one', async () => {
        const older = deferred<DuplicateEntryCheckResult>();
        const newer = deferred<DuplicateEntryCheckResult>();
        check.mockReturnValueOnce(older.Promise).mockReturnValueOnce(newer.Promise);
        await editAndWait('Name', 'Acme');
        await editAndWait('Name', 'Acme Inc');

        newer.Resolve(checked(candidate('acct-new')));
        await settle();
        older.Resolve(checked(candidate('acct-old')));
        await settle();

        expect(controller.Candidates.map(c => c.RecordID)).toEqual(['acct-new']);
    });

    it('shows nothing for a Failed answer or a check that throws', async () => {
        check.mockResolvedValueOnce(checked(candidate('acct-1')));
        await editAndWait();
        check.mockResolvedValueOnce({ Status: 'Failed', ErrorMessage: 'Decision failed: overloaded', Candidates: [] });
        await editAndWait('Name', 'Acme Co');
        expect(controller.Candidates).toEqual([]);

        check.mockRejectedValueOnce(new Error('socket hang up'));
        await editAndWait('Name', 'Acme Corp');
        expect(controller.Candidates).toEqual([]);
    });
});

// ─── NotConfigured ───────────────────────────────────────────────────────────

describe('DuplicateEntryCheckController: NotConfigured', () => {
    it('stops later calls for that entity, on this form and on any other', async () => {
        check.mockResolvedValueOnce({ Status: 'NotConfigured', Candidates: [] });
        await editAndWait();
        expect(check).toHaveBeenCalledTimes(1);

        await editAndWait('Name', 'Acme Corp');
        const otherForm = new DuplicateEntryCheckController(check, session);
        otherForm.RecordEdited(new FakeRecord('accounts', { Name: 'Beta' }));
        await vi.advanceTimersByTimeAsync(DUPLICATE_ENTRY_CHECK_DEBOUNCE_MS);

        expect(check).toHaveBeenCalledTimes(1);
        otherForm.Dispose();
    });

    it('still checks other entities', async () => {
        check.mockResolvedValueOnce({ Status: 'NotConfigured', Candidates: [] });
        await editAndWait();
        record = new FakeRecord('Contacts', { Name: 'Ada' });

        await editAndWait('Name', 'Ada Lovelace');

        expect(check).toHaveBeenLastCalledWith('Contacts', { Name: 'Ada Lovelace' });
    });

    it('is remembered for the session, in memory, by entity name', () => {
        const entityName = `Entry Check Session Spec ${Math.random()}`;
        expect(DuplicateEntryCheckSession.Instance.IsNotConfigured(entityName)).toBe(false);

        DuplicateEntryCheckSession.Instance.MarkNotConfigured(entityName);

        expect(DuplicateEntryCheckSession.Instance.IsNotConfigured(` ${entityName.toUpperCase()} `)).toBe(true);
    });
});

// ─── The notice ──────────────────────────────────────────────────────────────

describe('DuplicateEntryCheckController: the notice', () => {
    it('shows the flagged candidates and announces the change', async () => {
        const changes: number[] = [];
        controller.Changed$.subscribe(() => changes.push(changes.length));
        check.mockResolvedValueOnce(checked(candidate('acct-1', 0.9), candidate('acct-2', null)));

        await editAndWait();

        expect(controller.IsNoticeVisible).toBe(true);
        expect(controller.Candidates.map(c => [c.RecordID, c.Probability])).toEqual([['acct-1', 0.9], ['acct-2', null]]);
        expect(changes.length).toBeGreaterThan(0);
    });

    it('goes away when the record is saved, and a late answer does not bring it back', async () => {
        check.mockResolvedValueOnce(checked(candidate('acct-1')));
        await editAndWait();
        const late = deferred<DuplicateEntryCheckResult>();
        check.mockReturnValueOnce(late.Promise);
        await editAndWait('Name', 'Acme Corp');

        record.IsSaved = true;
        controller.RecordSaved();
        expect(controller.IsNoticeVisible).toBe(false);
        expect(controller.Candidates).toEqual([]);

        late.Resolve(checked(candidate('acct-2')));
        await settle();
        expect(controller.Candidates).toEqual([]);
    });

    it('cancels a pending check when the record is saved', async () => {
        record.Edit('Name', 'Acme');
        controller.RecordEdited(record);

        controller.RecordSaved();
        await vi.advanceTimersByTimeAsync(DUPLICATE_ENTRY_CHECK_DEBOUNCE_MS);

        expect(check).not.toHaveBeenCalled();
    });

    it('hides on dismiss, and shows again only for a candidate not yet dismissed', async () => {
        check.mockResolvedValueOnce(checked(candidate('acct-1')));
        await editAndWait();
        controller.Dismiss();
        expect(controller.IsNoticeVisible).toBe(false);

        check.mockResolvedValueOnce(checked(candidate('acct-1')));
        await editAndWait('Name', 'Acme Co');
        expect(controller.IsNoticeVisible).toBe(false);

        check.mockResolvedValueOnce(checked(candidate('acct-1'), candidate('acct-3')));
        await editAndWait('Name', 'Acme Corp');
        expect(controller.IsNoticeVisible).toBe(true);
    });

    it('stops everything once disposed', async () => {
        record.Edit('Name', 'Acme');
        controller.RecordEdited(record);

        controller.Dispose();
        await vi.advanceTimersByTimeAsync(DUPLICATE_ENTRY_CHECK_DEBOUNCE_MS);

        expect(check).not.toHaveBeenCalled();
    });
});
