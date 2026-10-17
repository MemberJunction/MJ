import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ComponentFixture } from '@angular/core/testing';
import { EntityInfo, type RemoteOpResult, type RunViewParams } from '@memberjunction/core';
import { RecordProcessRunNowOperation, type RecordProcessRunNowInput, type RecordProcessRunNowOutput } from '@memberjunction/core-entities';
import type { WriteBackResult, WriteBackRunPayload } from '@memberjunction/record-set-processor-base';
import { renderComponentFixture, queryAll, query, createFakeProvider } from '@memberjunction/ng-test-utils';
import { RecordProcessRunnerUXComponent } from './record-process-runner-ux.component';
import type { EntityActionUXContext } from '../runtime-ux-context';

/** The runner dialog's dry-run preview: a FieldRules run's `{ Changes }` and a write-back run's `{ output, writeBack }`. */

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

/** The RunView params the dialog sent for the run details, captured by {@link renderPreview}. */
const detailParams: RunViewParams[] = [];

/** Renders the dialog over a fake provider answering the run details, and runs the preview. */
async function renderPreview(details: DetailRow[], output: Partial<RecordProcessRunNowOutput> = {}) {
    detailParams.length = 0;
    const operation = vi.spyOn(RecordProcessRunNowOperation.prototype, 'Execute').mockImplementation(
        async (_input: RecordProcessRunNowInput): Promise<RemoteOpResult<RecordProcessRunNowOutput>> => ({
            Success: true,
            Output: { processRunID: 'run-1', status: 'Completed', processed: details.length, success: details.length, error: 0, skipped: 0, ...output },
        }),
    );
    const provider = createFakeProvider({
        runViewResults: (params: RunViewParams) => {
            if (params.EntityName !== 'MJ: Process Run Details') return [];
            detailParams.push(params);
            return details;
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

    it('shows Nothing to change, with no Apply, when the preview proposes nothing', async () => {
        const { f } = await renderPreview([detail('id-1', writeBackPayload({}))]);

        expect(f.componentInstance.ChangedRecordCount).toBe(0);
        expect(query(f, '.rp-empty')).not.toBeNull();
        expect(applyButton(f)).toBeUndefined();
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

    it('loads only the details that are not skipped, so a large scope spends its row budget on changed records', async () => {
        const { f } = await renderPreview([detail('id-1', writeBackPayload({ previewFields: { Tier: 'Gold' } }))], { processed: 1308, skipped: 1303 });

        expect(detailParams).toHaveLength(1);
        expect(detailParams[0].ExtraFilter).toContain("Status <> 'Skipped'");
        expect(f.componentInstance.Truncated).toBe(false);
        expect(f.componentInstance.ChangedRecordCount).toBe(1);
    });

    it('is truncated when the details load reaches the row limit', async () => {
        const rows = Array.from({ length: 500 }, (_, i) => detail(`id-${i}`, writeBackPayload({ previewFields: { Tier: 'Gold' } })));
        const { f } = await renderPreview(rows, { processed: 600, success: 600 });

        expect(f.componentInstance.Truncated).toBe(true);
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
        const { f, operation } = await renderPreview([detail('id-1', writeBackPayload({ previewFields: { Tier: 'Gold' } }))], { wouldRefuse: refusal });

        const notice = query(f, '.rp-refusal');
        expect(notice?.textContent).toContain('Applying these changes would be refused');
        expect(notice?.textContent).toContain(refusal);
        expect(applyButton(f)).toBeUndefined();
        await f.componentInstance.Apply();
        expect(operation).toHaveBeenCalledTimes(1);
    });
});
