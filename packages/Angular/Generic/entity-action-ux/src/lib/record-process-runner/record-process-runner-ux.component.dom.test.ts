import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ComponentFixture } from '@angular/core/testing';
import { EntityInfo, type RemoteOpResult, type RunViewParams } from '@memberjunction/core';
import { RecordProcessRunNowOperation, type RecordProcessRunNowInput, type RecordProcessRunNowOutput } from '@memberjunction/core-entities';
import type { WriteBackResult, WriteBackRunPayload } from '@memberjunction/record-set-processor-base';
import { renderComponentFixture, queryAll, query, createFakeProvider } from '@memberjunction/ng-test-utils';
import { RecordProcessRunnerUXComponent } from './record-process-runner-ux.component';
import type { EntityActionUXContext } from '../runtime-ux-context';

/**
 * DOM coverage for the record-process runner dialog's dry-run preview. A FieldRules run stores
 * `{ Changes }` on each run detail; a write-back run (Infer / Action / Agent) stores `{ output, writeBack }`
 * whose `writeBack` carries the previews. Both must show their rows, and the Apply button must offer the count.
 */

const MEMBERS = new EntityInfo({
  ID: 'ent-members',
  Name: 'Members',
  DisplayName: 'Members',
  Fields: [
    { Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true },
    { Name: 'Tier', Type: 'nvarchar' },
    { Name: 'Summary', Type: 'nvarchar' },
  ],
});

type DetailRow = {
    RecordID: string;
    Status: string;
    ResultPayload?: string;
    ErrorMessage?: string;
};

const detail = (RecordID: string, payload: object | undefined, over: Partial<DetailRow> = {}): DetailRow => ({
    RecordID, Status: 'Succeeded', ResultPayload: payload ? JSON.stringify(payload) : undefined, ...over,
});

const writeBackPayload = (writeBack: Partial<WriteBackResult>): WriteBackRunPayload => ({
    output: { tier: 'Gold' },
    writeBack: { updatedRecord: false, changed: false, dryRun: true, ...writeBack },
});

/** Renders the dialog over a fake provider answering the run details, and runs the preview. */
/** The child entity the dialog labels fields from (metadata only, no read). */
const PERSON_JOB_FUNCTIONS = new EntityInfo({
    ID: 'ent-pjf', Name: 'Person Job Functions',
    Fields: [{ Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true }, { Name: 'JobFunctionID', Type: 'uniqueidentifier', DisplayName: 'Job Function' }],
});

async function renderPreview(details: DetailRow[], views: RunViewParams[] = [], output: Partial<RecordProcessRunNowOutput> = {}) {
    const operation = vi.spyOn(RecordProcessRunNowOperation.prototype, 'Execute').mockImplementation(
        async (_input: RecordProcessRunNowInput): Promise<RemoteOpResult<RecordProcessRunNowOutput>> => ({
            Success: true,
            Output: { processRunID: 'run-1', status: 'Completed', processed: details.length, success: details.length, error: 0, skipped: 0, ...output },
        }),
    );
    const provider = createFakeProvider({
        entityByName: (name: string) => (name === 'Person Job Functions' ? PERSON_JOB_FUNCTIONS : undefined),
        runViewResults: (params: RunViewParams) => {
            views.push(params);
            return params.EntityName === 'MJ: Process Run Details' ? details : [];
        },
    });
    const context: EntityActionUXContext = {
        EntityInfo: MEMBERS, ScopeKind: 'records', SelectedRecordIDs: details.map((d) => d.RecordID),
        Config: { RecordProcessID: 'rp-1' }, Provider: provider,
    };
    const f = renderComponentFixture(RecordProcessRunnerUXComponent, { inputs: { Context: context } });
    await f.componentInstance.Start();
    f.detectChanges();
    return { f, operation };
}

const rowsText = (f: ComponentFixture<RecordProcessRunnerUXComponent>): string[] =>
    queryAll(f, '.rp-diff-record').map((r) => (r.textContent ?? '').replace(/\s+/g, ' ').trim());
const applyButton = (f: ComponentFixture<RecordProcessRunnerUXComponent>): string | undefined =>
    Array.from((f.nativeElement as Element).ownerDocument.querySelectorAll('button')).map((b) => (b.textContent ?? '').trim()).find((t) => t.startsWith('Apply'));

afterEach(() => vi.restoreAllMocks());

describe('RecordProcessRunnerUXComponent dry-run preview (DOM)', () => {
    it('shows the engine\'s field changes of a write-back run, and offers to apply them', async () => {
        const { f } = await renderPreview([detail('id-1', writeBackPayload({
            previewFieldChanges: [{ Field: 'Tier', OldValue: 'Silver', NewValue: 'Gold' }, { Field: 'Summary', OldValue: null, NewValue: 'Loyal member' }],
        }))]);

        const [row] = rowsText(f);
        expect(row).toContain('Tier');
        expect(row).toContain('Silver');
        expect(row).toContain('Gold');
        expect(row).toContain('Loyal member');
        expect(f.componentInstance.ChangedRecordCount).toBe(1);
        expect(f.componentInstance.TotalChangeCount).toBe(2);
        expect(applyButton(f)).toBe('Apply 2 change(s)');
        expect(query(f, '.rp-empty')).toBeNull();
    });

    it('reads nothing but the run details: the engine\'s decision is not recomputed from the records', async () => {
        const views: RunViewParams[] = [];
        await renderPreview([detail('id-1', writeBackPayload({ previewFieldChanges: [{ Field: 'Tier', OldValue: 'a', NewValue: 'b' }] }))], views);

        expect(views.map((v) => v.EntityName)).toEqual(['MJ: Process Run Details']);
    });

    it('shows Nothing to change, with no Apply, for an idempotent re-run (fields held, children identical, tags linked)', async () => {
        const { f } = await renderPreview([detail('id-1', writeBackPayload({
            previewFields: { Tier: 'Gold' },
            previewFieldChanges: [],
            previewChildChanges: [{ Entity: 'Member Skills', Action: 'none', Values: { Skill: 'Python' } }],
            previewTags: [{ tagText: 'vip', resolvedTagName: 'VIP', matched: true, created: false, rootTagID: 'root', alreadyLinked: true }],
        }))]);

        expect(f.componentInstance.ChangedRecordCount).toBe(0);
        expect(f.componentInstance.TotalChangeCount).toBe(0);
        expect(query(f, '.rp-empty')).not.toBeNull();
        expect(applyButton(f)).toBeUndefined();
    });

    it('shows each child row the write inserts, updates or removes with its entity and values, leaving out the link to the parent', async () => {
        const { f } = await renderPreview([detail('id-1', writeBackPayload({
            previewChildChanges: [
                { Entity: 'Member Skills', Action: 'insert', Values: { MemberID: 'id-1', Skill: 'Python', Level: 3 } },
                { Entity: 'Member Skills', Action: 'update', Values: { Level: 5 } },
                { Entity: 'Member Skills', Action: 'delete', Values: { Skill: 'Perl' } },
                { Entity: 'Member Skills', Action: 'none', Values: { Skill: 'SQL' } },
            ],
        }))]);

        const [row] = rowsText(f);
        expect(row).toContain('New Member Skills');
        expect(row).toContain('Skill: Python');
        expect(row).toContain('Update Member Skills');
        expect(row).toContain('Level: 5');
        expect(row).toContain('Remove Member Skills');
        expect(row).not.toContain('MemberID');
        expect(row).not.toContain('SQL');
        expect(f.componentInstance.TotalChangeCount).toBe(3);
        expect(applyButton(f)).toBe('Apply 3 change(s)');
    });

    it('shows a tag link the record lacks and a new tag, and not a tag already linked', async () => {
        const { f } = await renderPreview([detail('id-1', writeBackPayload({
            previewTags: [
                { tagText: 'vip', resolvedTagName: 'VIP', matched: true, created: false, rootTagID: 'root' },
                { tagText: 'new-thing', matched: false, created: true, rootTagID: 'root' },
                { tagText: 'old', resolvedTagName: 'Old', matched: true, created: false, rootTagID: 'root', alreadyLinked: true },
            ],
        }))]);

        const [row] = rowsText(f);
        expect(row).toContain('VIP');
        expect(row).toContain('new-thing (new tag)');
        expect(row).not.toContain('Old');
        expect(f.componentInstance.TotalChangeCount).toBe(2);
    });

    it('shows what the real write would fail on as the record\'s errors, counts none of its changes and offers no Apply', async () => {
        const { f } = await renderPreview([detail('id-1', writeBackPayload({
            PreviewErrors: ['Seniority "Chief" has no row', 'Level proposed twice'],
            previewFieldChanges: [{ Field: 'Tier', OldValue: 'a', NewValue: 'b' }],
            previewChildChanges: [{ Entity: 'Member Skills', Action: 'insert', Values: { Skill: 'Go' } }],
        }), {
            Status: 'Failed', ErrorMessage: 'Dry run: the real write would fail: Seniority "Chief" has no row; Level proposed twice',
        })]);

        const errors = queryAll(f, '.rp-change--error').map((e) => e.textContent?.trim());
        expect(errors).toEqual(['Seniority "Chief" has no row', 'Level proposed twice']);
        expect(f.componentInstance.ChangedRecordCount).toBe(0);
        expect(f.componentInstance.TotalChangeCount).toBe(0);
        expect(applyButton(f)).toBeUndefined();
    });

    it('shows several rows of one kind without clashing keys (two new child rows, two tags)', async () => {
        const { f } = await renderPreview([detail('id-1', writeBackPayload({
            previewChildChanges: [
                { Entity: 'Member Skills', Action: 'insert', Values: { Skill: 'Python' } },
                { Entity: 'Member Skills', Action: 'insert', Values: { Skill: 'SQL' } },
            ],
        }))]);

        expect(queryAll(f, '.rp-change')).toHaveLength(2);
    });

    it('still shows a FieldRules run\'s changes, and reads no records for it', async () => {
        const views: RunViewParams[] = [];
        const fieldRules = { DryRun: true, ChangedFields: ['Tier'], Changes: [
            { Field: 'Tier', OldValue: 'Silver', NewValue: 'Gold', Applied: true, Changed: true },
            { Field: 'Summary', OldValue: 'x', NewValue: 'x', Applied: true, Changed: false },
        ] };
        const { f } = await renderPreview([detail('id-1', fieldRules)], views);

        const [row] = rowsText(f);
        expect(row).toContain('Silver');
        expect(row).toContain('Gold');
        expect(row).not.toContain('Summary');
        expect(f.componentInstance.TotalChangeCount).toBe(1);
        expect(applyButton(f)).toBe('Apply 1 change(s)');
        expect(views.map((v) => v.EntityName)).toEqual(['MJ: Process Run Details']);
    });

    it('shows a withheld output as withheld (below confidence), not as a change, and offers no Apply when nothing else changes', async () => {
        const { f } = await renderPreview([detail('id-1', writeBackPayload({
            previewFields: { Tier: null }, previewFieldChanges: [], withheldFields: ['Tier'], withheldChildEntities: ['Member Skills'],
        }))]);

        const [row] = rowsText(f);
        expect(row).toContain('Tier: withheld (below confidence)');
        expect(row).toContain('Member Skills: withheld (below confidence); rows unchanged');
        expect(queryAll(f, '.rp-change--withheld')).toHaveLength(2);
        expect(f.componentInstance.ChangedRecordCount).toBe(0);
        expect(f.componentInstance.TotalChangeCount).toBe(0);
        expect(applyButton(f)).toBeUndefined();
    });

    it('shows the clear of a pipeline-written withheld value as the change, with the withheld line beside it', async () => {
        const { f } = await renderPreview([detail('id-1', writeBackPayload({
            previewFields: { Tier: null }, previewFieldChanges: [{ Field: 'Tier', OldValue: 'Gold', NewValue: null }], withheldFields: ['Tier'],
        }))]);

        expect(rowsText(f)[0]).toContain('Tier: withheld (below confidence)');
        expect(f.componentInstance.TotalChangeCount).toBe(1);
        expect(applyButton(f)).toBe('Apply 1 change(s)');
    });

    it('shows the processed record and each foreign-key value by name, with the IDs on hover (F14)', async () => {
        const views: RunViewParams[] = [];
        const { f } = await renderPreview([detail('5A5A0001-0000-4000-8000-000000000001', writeBackPayload({
            RecordName: 'Alex Kim',
            previewFieldChanges: [{ Field: 'SeniorityLevelID', OldValue: 'lvl-1', NewValue: 'lvl-2', OldValueName: 'Senior', NewValueName: 'Director' }],
            previewChildChanges: [{ Entity: 'Person Job Functions', Action: 'insert',
                Values: { PersonID: '5A5A0001-0000-4000-8000-000000000001', JobFunctionID: '7E010001-A101-4B01-8C01-000000000007' },
                ValueNames: { PersonID: 'Alex Kim', JobFunctionID: 'Engineering' } }],
        }))], views);

        const key = query(f, '.rp-diff-key');
        expect(key?.textContent?.trim()).toBe('Alex Kim');
        expect(key?.getAttribute('title')).toBe('5A5A0001-0000-4000-8000-000000000001');
        const [row] = rowsText(f);
        expect(row).toContain('Senior');
        expect(row).toContain('Director');
        expect(row).toContain('Job Function: Engineering');
        expect(row).not.toContain('7E010001');
        expect(row).not.toContain('lvl-2');
        const titles = queryAll(f, '.rp-old, .rp-new').map((e) => e.getAttribute('title'));
        expect(titles).toEqual(['lvl-1', 'lvl-2', 'JobFunctionID: 7E010001-A101-4B01-8C01-000000000007']);
        expect(views.map((v) => v.EntityName)).toEqual(['MJ: Process Run Details']);
    });

    it('shows the record ID where the engine read no name', async () => {
        const { f } = await renderPreview([detail('id-9', writeBackPayload({ previewFieldChanges: [{ Field: 'Tier', OldValue: 'a', NewValue: 'b' }] }))]);

        expect(query(f, '.rp-diff-key')?.textContent?.trim()).toBe('id-9');
        expect(queryAll(f, '.rp-new').map((e) => e.getAttribute('title'))).toEqual([null]);
    });

    it('names a FieldRules run\'s record and foreign-key values too (F14 sweep)', async () => {
        const fieldRules = { DryRun: true, ChangedFields: ['SeniorityLevelID'], RecordName: 'Alex Kim', Changes: [
            { Field: 'SeniorityLevelID', OldValue: 'lvl-1', NewValue: 'lvl-2', Applied: true, Changed: true, OldValueName: 'Senior', NewValueName: 'Director' },
        ] };
        const { f } = await renderPreview([detail('id-1', fieldRules)]);

        expect(query(f, '.rp-diff-key')?.textContent?.trim()).toBe('Alex Kim');
        expect(rowsText(f)[0]).toContain('Senior');
        expect(rowsText(f)[0]).toContain('Director');
    });

    it('says a real run would be refused, and offers no Apply, when the previewed version is not activated (F16)', async () => {
        const refusal = 'Feature Pipeline version v6 is not activated: run its golden-set test (MJ: Tests ID T-1) to evaluate it against the threshold 0.9.';
        const { f } = await renderPreview([detail('id-1', writeBackPayload({ previewFieldChanges: [{ Field: 'Tier', OldValue: 'Silver', NewValue: 'Gold' }] }))],
            [], { wouldRefuse: refusal });

        const notice = query(f, '.rp-refusal');
        expect(notice?.textContent).toContain('Applying these changes would be refused');
        expect(notice?.textContent).toContain(refusal);
        expect(f.componentInstance.TotalChangeCount).toBe(1);
        expect(applyButton(f)).toBeUndefined();
    });

    it('does not run for real when Apply is called on a preview a real run would refuse (F16)', async () => {
        const { f, operation } = await renderPreview([detail('id-1', writeBackPayload({ previewFieldChanges: [{ Field: 'Tier', OldValue: 'Silver', NewValue: 'Gold' }] }))],
            [], { wouldRefuse: 'Feature Pipeline version v6 is not activated' });

        await f.componentInstance.Apply();

        expect(operation).toHaveBeenCalledTimes(1);
        expect(f.componentInstance.State).toBe('preview');
    });

    it('shows no refusal notice when the real run would go ahead', async () => {
        const { f } = await renderPreview([detail('id-1', writeBackPayload({ previewFieldChanges: [{ Field: 'Tier', OldValue: 'Silver', NewValue: 'Gold' }] }))]);

        expect(query(f, '.rp-refusal')).toBeNull();
        expect(applyButton(f)).toBe('Apply 1 change(s)');
    });

    it('applies with a real run when Apply is chosen', async () => {
        const { f, operation } = await renderPreview([detail('id-1', writeBackPayload({ previewFieldChanges: [{ Field: 'Tier', OldValue: 'Silver', NewValue: 'Gold' }] }))]);

        await f.componentInstance.Apply();

        expect(operation).toHaveBeenCalledTimes(2);
        expect(operation.mock.calls[0][0].dryRun).toBe(true);
        expect(operation.mock.calls[1][0].dryRun).toBe(false);
        expect(f.componentInstance.State).toBe('done');
    });
});
