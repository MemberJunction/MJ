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
async function renderPreview(details: DetailRow[], views: RunViewParams[] = [], output: Partial<RecordProcessRunNowOutput> = {}) {
    const operation = vi.spyOn(RecordProcessRunNowOperation.prototype, 'Execute').mockImplementation(
        async (_input: RecordProcessRunNowInput): Promise<RemoteOpResult<RecordProcessRunNowOutput>> => ({
            Success: true,
            Output: { processRunID: 'run-1', status: 'Completed', processed: details.length, success: details.length, error: 0, skipped: 0, ...output },
        }),
    );
    const provider = createFakeProvider({
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
    it('shows the values a write-back run would store, and offers to apply them', async () => {
        const { f } = await renderPreview([detail('id-1', writeBackPayload({ previewFields: { Tier: 'Gold', Summary: 'Loyal member' } }))]);

        const [row] = rowsText(f);
        expect(row).toContain('Tier');
        expect(row).toContain('Gold');
        expect(row).toContain('Loyal member');
        expect(f.componentInstance.ChangedRecordCount).toBe(1);
        expect(f.componentInstance.TotalChangeCount).toBe(2);
        expect(applyButton(f)).toBe('Apply 2 change(s)');
        expect(query(f, '.rp-empty')).toBeNull();
    });

    it('reads nothing but the run details', async () => {
        const views: RunViewParams[] = [];
        await renderPreview([detail('id-1', writeBackPayload({ previewFields: { Tier: 'b' } }))], views);

        expect(views.map((v) => v.EntityName)).toEqual(['MJ: Process Run Details']);
    });

    it('shows Nothing to change, with no Apply, when the preview proposes nothing', async () => {
        const { f } = await renderPreview([detail('id-1', writeBackPayload({}))]);

        expect(f.componentInstance.ChangedRecordCount).toBe(0);
        expect(query(f, '.rp-empty')).not.toBeNull();
        expect(applyButton(f)).toBeUndefined();
    });

    it('shows each child row and tag the write stores, leaving out the link to the parent', async () => {
        const { f } = await renderPreview([detail('id-1', writeBackPayload({
            previewChildren: [{ MemberID: 'id-1', Skill: 'Python', Level: 3 }, { MemberID: 'id-1', Skill: 'SQL' }],
            previewTags: [{ tagText: 'vip', resolvedTagName: 'VIP', matched: true, created: false, rootTagID: 'root' }],
        }))]);

        const [row] = rowsText(f);
        expect(row).toContain('Skill: Python; Level: 3');
        expect(row).toContain('Skill: SQL');
        expect(row).toContain('VIP');
        expect(row).not.toContain('MemberID');
        expect(queryAll(f, '.rp-change')).toHaveLength(3);
    });

    it('shows what the real write would fail on as the record\'s errors, counts none of its changes and offers no Apply', async () => {
        const { f } = await renderPreview([detail('id-1', writeBackPayload({
            PreviewErrors: ['Seniority "Chief" has no row', 'Level proposed twice'],
            previewFields: { Tier: 'b' },
        }), {
            Status: 'Failed', ErrorMessage: 'Dry run: the real write would fail: Seniority "Chief" has no row; Level proposed twice',
        })]);

        const errors = queryAll(f, '.rp-change--error').map((e) => e.textContent?.trim());
        expect(errors).toEqual(['Seniority "Chief" has no row', 'Level proposed twice']);
        expect(f.componentInstance.TotalChangeCount).toBe(0);
        expect(applyButton(f)).toBeUndefined();
    });

    it('still shows a FieldRules run\'s changes', async () => {
        const fieldRules = { DryRun: true, ChangedFields: ['Tier'], Changes: [
            { Field: 'Tier', OldValue: 'Silver', NewValue: 'Gold', Applied: true, Changed: true },
            { Field: 'Summary', OldValue: 'x', NewValue: 'x', Applied: true, Changed: false },
        ] };
        const { f } = await renderPreview([detail('id-1', fieldRules)]);

        const [row] = rowsText(f);
        expect(row).toContain('Silver');
        expect(row).toContain('Gold');
        expect(row).not.toContain('Summary');
        expect(applyButton(f)).toBe('Apply 1 change(s)');
    });

    it('shows a withheld output as a withheld line beside the values', async () => {
        const { f } = await renderPreview([detail('id-1', writeBackPayload({
            previewFields: { Tier: null }, withheldFields: ['Tier'], withheldChildEntities: ['Member Skills'],
        }))]);

        const [row] = rowsText(f);
        expect(row).toContain('Tier: withheld (below confidence)');
        expect(row).toContain('Member Skills: withheld (below confidence); rows unchanged');
        expect(queryAll(f, '.rp-change--withheld')).toHaveLength(2);
    });

    it('says a real run would be refused, and offers no Apply, when the previewed version is not activated', async () => {
        const refusal = 'Feature Pipeline version v6 is not activated: run its golden-set test (MJ: Tests ID T-1) to evaluate it against the threshold 0.9.';
        const { f } = await renderPreview([detail('id-1', writeBackPayload({ previewFields: { Tier: 'Gold' } }))], [], { wouldRefuse: refusal });

        const notice = query(f, '.rp-refusal');
        expect(notice?.textContent).toContain('Applying these changes would be refused');
        expect(notice?.textContent).toContain(refusal);
        expect(applyButton(f)).toBeUndefined();
    });

    it('does not run for real when Apply is called on a preview a real run would refuse', async () => {
        const { f, operation } = await renderPreview([detail('id-1', writeBackPayload({ previewFields: { Tier: 'Gold' } }))],
            [], { wouldRefuse: 'Feature Pipeline version v6 is not activated' });

        await f.componentInstance.Apply();

        expect(operation).toHaveBeenCalledTimes(1);
        expect(f.componentInstance.State).toBe('preview');
    });

    it('applies with a real run when Apply is chosen', async () => {
        const { f, operation } = await renderPreview([detail('id-1', writeBackPayload({ previewFields: { Tier: 'Gold' } }))]);

        await f.componentInstance.Apply();

        expect(operation).toHaveBeenCalledTimes(2);
        expect(operation.mock.calls[0][0].dryRun).toBe(true);
        expect(operation.mock.calls[1][0].dryRun).toBe(false);
        expect(f.componentInstance.State).toBe('done');
    });
});
