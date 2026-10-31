import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import type { ComponentFixture } from '@angular/core/testing';
import { renderComponentFixture, query, queryAll, text, capture } from '@memberjunction/ng-test-utils';
import { QueryRefreshExtractionOperation, UserInfoEngine } from '@memberjunction/core-entities';
import type { QueryRefreshExtractionInput, QueryRefreshExtractionOutput, QueryRefreshQueryReport } from '@memberjunction/core-entities';
import type { RemoteOpInvokeOptions, RemoteOpResult } from '@memberjunction/core';
import { QueryRefreshReportComponent } from './query-refresh-report.component';
import { QueryRefreshDialogComponent } from './query-refresh-dialog.component';
import { QueryDiagnosticsComponent } from '../query-diagnostics/query-diagnostics.component';
import { QUERY_REFRESH_SKIP_DRY_RUN_SETTING, QueryRefreshInputFor } from './query-refresh-model';

/**
 * DOM coverage for the query metadata refresh: the diagnostics list, the report (per-query
 * outcome, change counts, drill-in) and the dialog that always runs a dry run first, shows live
 * progress, and applies on request. The remote operation and the user-setting store are spied on;
 * everything else renders for real.
 */

const report = (over: Partial<QueryRefreshQueryReport> = {}): QueryRefreshQueryReport => ({
    queryID: 'q-1', queryName: 'Sales by Region', outcome: 'Refreshed', extractionStatus: 'Warning', queryColumns: ['ExtractionStatus'],
    added: [{ collection: 'Fields', name: 'Region', changedColumns: [] }],
    updated: [{ collection: 'Fields', name: 'Total', changedColumns: ['SQLFullType', 'IsNullable'] }],
    removed: [{ collection: 'Parameters', name: 'OldParam', changedColumns: [] }],
    flagged: ['Unused'],
    diagnostics: ['MJQ_UNFILTERED_VALUE at line 2, column 9: The value is written without a filter. Fix: Add | sqlString.'],
    ...over,
});
const output = (reports: QueryRefreshQueryReport[], dryRun = true): QueryRefreshExtractionOutput =>
    ({ dryRun, reports, cycles: [], summary: `${reports.length} queries checked` });

describe('QueryDiagnosticsComponent (DOM)', () => {
    const render = (inputs: Record<string, unknown>) => renderComponentFixture(QueryDiagnosticsComponent, { inputs });
    const finding = { Code: 'MJQ_TAG_IN_STRING_LITERAL', Line: 3, Column: 16, Message: 'A tag is inside a string literal.', FixHint: 'Use | sqlString.' };

    it('lists each finding with its code, location, message and fix', () => {
        const f = render({ Headline: 'Query "Q" was not saved:', Diagnostics: [finding] });
        expect(text(f, '.qd-headline')).toContain('was not saved');
        expect(text(f, '.qd-code')).toBe('MJQ_TAG_IN_STRING_LITERAL');
        expect(text(f, '.qd-location')).toBe('Line 3, column 16');
        expect(text(f, '.qd-message')).toBe('A tag is inside a string literal.');
        expect(text(f, '.qd-fix')).toContain('Use | sqlString.');
    });

    it('emits the finding when its location is clicked, if locations are clickable', () => {
        const f = render({ Diagnostics: [finding], LocationsClickable: true });
        const clicks = capture(f.componentInstance.LocationClick);
        (query(f, 'button.qd-location') as HTMLButtonElement).click();
        expect(clicks).toEqual([finding]);
    });

    it('renders nothing with no findings and no headline', () => {
        expect(query(render({ Diagnostics: [] }), '.mj-query-diagnostics')).toBeNull();
    });
});

describe('QueryRefreshReportComponent (DOM)', () => {
    const render = (inputs: Record<string, unknown>) => renderComponentFixture(QueryRefreshReportComponent, { inputs });

    it('shows one row per query with its outcome, status and change counts', () => {
        const f = render({ Output: output([report(), report({ queryID: 'q-2', queryName: 'Unchanged One', outcome: 'Unchanged', added: [], updated: [], removed: [], flagged: [], diagnostics: [], queryColumns: [] })]) });
        const rows = queryAll(f, 'tr.qrr-row');
        expect(rows).toHaveLength(2);
        const cells = Array.from(rows[0].querySelectorAll('td')).map(td => td.textContent?.trim());
        expect(cells.slice(1)).toEqual(['Sales by Region', 'Would change', 'Warning', '1', '1', '1', '1']);
        expect(rows[1].textContent).toContain('Unchanged');
    });

    it('drills into a query: each change by collection, flagged parameters and diagnostics', () => {
        const f = render({ Output: output([report(), report({ queryID: 'q-2' })]) });
        expect(query(f, '.qrr-detail')).toBeNull();
        (query(f, '.qrr-toggle') as HTMLButtonElement).click();
        f.detectChanges();
        const detail = query(f, '.qrr-detail') as HTMLElement;
        expect(detail.textContent).toContain('Region');
        expect(detail.textContent).toContain('SQLFullType, IsNullable');
        expect(detail.textContent).toContain('OldParam');
        expect(detail.textContent).toContain('Unused');
        expect(query(f, '.qrr-detail .qd-code')?.textContent).toBe('MJQ_UNFILTERED_VALUE');
    });

    it('starts a single-query report expanded and says "Refreshed" once applied', () => {
        const f = render({ Output: output([report()], false) });
        expect(query(f, '.qrr-detail')).not.toBeNull();
        expect(text(f, 'tr.qrr-row .qrr-pill')).toBe('Refreshed');
    });

    it('emits OpenQuery for a query name when allowed', () => {
        const f = render({ Output: output([report()]), AllowOpenQuery: true });
        const opened = capture(f.componentInstance.OpenQuery);
        (query(f, '.qrr-open') as HTMLButtonElement).click();
        expect(opened).toEqual(['q-1']);
    });
});

describe('QueryRefreshDialogComponent (DOM)', () => {
    type ExecuteFn = (input: QueryRefreshExtractionInput, options?: RemoteOpInvokeOptions) => Promise<RemoteOpResult<QueryRefreshExtractionOutput>>;
    let execute: ReturnType<typeof vi.fn<ExecuteFn>>;
    let settings: Map<string, string>;

    beforeEach(() => {
        settings = new Map();
        execute = vi.fn<ExecuteFn>(async (input, options) => {
            options?.onProgress?.({ OperationKey: 'Query.RefreshExtraction', Processed: 1, Total: 2, Message: 'Refreshed: Sales by Region' });
            return { Success: true, Output: output([report()], input.dryRun === true) };
        });
        vi.spyOn(QueryRefreshExtractionOperation.prototype, 'Execute').mockImplementation(execute);
        vi.spyOn(UserInfoEngine.Instance, 'GetSetting').mockImplementation((key: string) => settings.get(key));
        vi.spyOn(UserInfoEngine.Instance, 'SetSetting').mockImplementation(async (key: string, value: string) => { settings.set(key, value); return true; });
    });
    afterEach(() => vi.restoreAllMocks());

    const settle = async (f: ComponentFixture<QueryRefreshDialogComponent>) => { await f.whenStable(); f.detectChanges(); };
    const open = async (inputs: Record<string, unknown> = {}) => {
        const f = renderComponentFixture(QueryRefreshDialogComponent, {
            providers: [provideNoopAnimations()],
            inputs: { Scope: { Kind: 'Queries', QueryIDs: ['q-1'] }, AllowSkipDryRun: true, ...inputs },
        });
        f.componentRef.setInput('Visible', true);
        await settle(f);
        return f;
    };
    const button = (f: ComponentFixture<QueryRefreshDialogComponent>, label: string) =>
        queryAll(f, 'mj-dialog-actions button').find(b => b.textContent?.includes(label)) as HTMLButtonElement | undefined;

    it('opens with a dry run and shows the proposed changes for review, writing nothing', async () => {
        const f = await open();
        expect(execute).toHaveBeenCalledTimes(1);
        expect(execute.mock.calls[0][0]).toEqual({ queryIDs: ['q-1'], dryRun: true });
        expect(f.componentInstance.Phase).toBe('Review');
        expect(text(f, '.qrd-banner')).toContain('Nothing has been written yet');
        expect(query(f, 'mj-query-refresh-report')).not.toBeNull();
        expect(button(f, 'Apply changes')?.disabled).toBe(false);
    });

    it('applies on request and reports what was written', async () => {
        const f = await open();
        const applied = capture(f.componentInstance.Applied);
        button(f, 'Apply changes')?.click();
        await settle(f);
        expect(execute.mock.calls[1][0]).toEqual({ queryIDs: ['q-1'], dryRun: false });
        expect(f.componentInstance.Phase).toBe('Done');
        expect(text(f, '.qrd-banner')).toContain('applied');
        expect(applied).toHaveLength(1);
    });

    it('passes live progress through while running', async () => {
        let release: () => void = () => undefined;
        execute.mockImplementationOnce(async (input, options) => {
            options?.onProgress?.({ OperationKey: 'Query.RefreshExtraction', Processed: 1, Total: 4, Message: 'Refreshed: A' });
            await new Promise<void>(r => { release = r; });
            return { Success: true, Output: output([report()], input.dryRun === true) };
        });
        const f = renderComponentFixture(QueryRefreshDialogComponent, {
            providers: [provideNoopAnimations()],
            inputs: { Scope: { Kind: 'Category', CategoryPath: 'Reports' } },
        });
        f.componentRef.setInput('Visible', true);
        await Promise.resolve();
        f.detectChanges();
        expect(f.componentInstance.Phase).toBe('DryRunning');
        expect(text(f, '.qrd-progress-text')).toContain('1 of 4 queries');
        expect(f.componentInstance.Percent).toBe(25);
        release();
        await settle(f);
        expect(execute.mock.calls[0][0]).toEqual({ categoryPath: 'Reports', dryRun: true });
    });

    it('uses the scope a host sets in the same pass as opening, even when Visible is applied first', async () => {
        const f = renderComponentFixture(QueryRefreshDialogComponent, { providers: [provideNoopAnimations()], inputs: {} });
        f.componentRef.setInput('Visible', true);
        f.componentRef.setInput('Scope', { Kind: 'Category', CategoryPath: 'P9 Fixtures' });
        await settle(f);
        expect(f.componentInstance.Phase).toBe('Review');
        expect(execute.mock.calls[0][0]).toEqual({ categoryPath: 'P9 Fixtures', dryRun: true });
    });

    it('disables Apply when the dry run found nothing to change', async () => {
        execute.mockImplementationOnce(async () => ({ Success: true, Output: output([report({ outcome: 'Unchanged', added: [], updated: [], removed: [] })]) }));
        const f = await open();
        expect(button(f, 'Apply changes')?.disabled).toBe(true);
        expect(text(f, '.qrd-banner')).toContain('already matches');
    });

    it('shows the operation\'s error instead of a report', async () => {
        execute.mockImplementationOnce(async () => ({ Success: false, ErrorMessage: 'Query "q-1" does not exist or you may not refresh it.' }));
        const f = await open();
        expect(f.componentInstance.Phase).toBe('Failed');
        expect(text(f, '.qrd-banner--error')).toContain('does not exist or you may not refresh it');
    });

    it('stores "skip the dry run for future query refreshes", and then goes straight to applying', async () => {
        const f = await open();
        const box = query(f, '.qrd-setting input') as HTMLInputElement;
        box.checked = true;
        box.dispatchEvent(new Event('change'));
        await settle(f);
        expect(settings.get(QUERY_REFRESH_SKIP_DRY_RUN_SETTING)).toBe('true');

        execute.mockClear();
        button(f, 'Cancel')?.click();
        f.componentRef.setInput('Visible', false);
        f.componentRef.setInput('Visible', true);
        await settle(f);
        expect(execute).toHaveBeenCalledTimes(1);
        expect(execute.mock.calls[0][0].dryRun).toBe(false);
        expect(f.componentInstance.Phase).toBe('Done');
    });

    it('ignores the setting where skipping is not allowed (bulk refreshes)', async () => {
        settings.set(QUERY_REFRESH_SKIP_DRY_RUN_SETTING, 'true');
        const f = await open({ AllowSkipDryRun: false });
        expect(execute.mock.calls[0][0].dryRun).toBe(true);
        expect(query(f, '.qrd-setting')).toBeNull();
    });
});

describe('QueryRefreshInputFor', () => {
    it('maps each scope to the operation selectors', () => {
        expect(QueryRefreshInputFor({ Kind: 'All' }, true)).toEqual({ all: true, dryRun: true });
        expect(QueryRefreshInputFor({ Kind: 'Category', CategoryPath: 'A/B' }, false)).toEqual({ categoryPath: 'A/B', dryRun: false });
    });
});
