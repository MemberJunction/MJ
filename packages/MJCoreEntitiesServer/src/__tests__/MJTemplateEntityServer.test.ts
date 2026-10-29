/**
 * Unit tests for `MJTemplateEntityServer.Delete` — a template delete first removes the template's
 * `MJ: Template Params` (which Template Content saves derive and nothing outside the server
 * knows about), then deletes the template, in one transaction.
 *
 * The generated base is mocked to a stub whose `Delete()` records the call order, and the
 * provider is a fake that records transaction begin/commit/rollback and the single view it is
 * asked to run.
 */
import { describe, it, expect, vi } from 'vitest';
import type { EntityTransactionScope } from '@memberjunction/core';

vi.mock('@memberjunction/global', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/global')>()),
    RegisterClass: () => (target: unknown) => target,
}));

vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    LogError: vi.fn(),
}));

interface StubResult { Success: boolean; Message?: string; CompleteMessage?: string }

// Declared inside the factory because `vi.mock` is hoisted above every top-level declaration.
vi.mock('@memberjunction/core-entities', () => {
    class StubTemplateEntity {
        public ID = '';
        public ContextCurrentUser: { ID: string } | null = { ID: 'user-1' };
        public ProviderToUse: unknown = null;
        public RunViewProviderToUse: unknown = null;
        public Log: string[] = [];
        public BaseDeleteResult = true;
        public History: StubResult[] = [];

        public get LatestResult(): StubResult | undefined {
            return this.History[this.History.length - 1];
        }

        public RegisterResultHistoryEntry(result: StubResult): void {
            this.History.push(result);
        }

        public async Delete(): Promise<boolean> {
            this.Log.push('template');
            if (!this.BaseDeleteResult) {
                this.History.push({ Success: false, CompleteMessage: 'blocked by FK_AIPrompt_TemplateID' });
            }
            return this.BaseDeleteResult;
        }
    }
    return {
        MJTemplateEntityExtended: StubTemplateEntity,
        MJTemplateParamEntity: class {},
    };
});

import { MJTemplateEntityServer } from '../custom/MJTemplateEntityServer.server';

const TEMPLATE_ID = 'aaaaaaaa-0000-0000-0000-000000000001';

interface Harness {
    template: MJTemplateEntityServer & { Log: string[]; BaseDeleteResult: boolean; History: StubResult[] };
    tx: string[];
    viewRequests: Array<{ EntityName: string; ExtraFilter: string }>;
}

/** Builds a template whose provider returns the given params, each with its own delete outcome. */
function harness(params: Array<{ Name: string; ok: boolean }>, viewSucceeds = true): Harness {
    const tx: string[] = [];
    const viewRequests: Array<{ EntityName: string; ExtraFilter: string }> = [];
    const template = new MJTemplateEntityServer(null as never) as Harness['template'];
    const paramRows = params.map((p) => ({
        Name: p.Name,
        LatestResult: p.ok ? undefined : { CompleteMessage: 'param delete refused' },
        Delete: async () => { template.Log.push(`param:${p.Name}`); return p.ok; },
    }));
    const provider = {
        SupportsEntityTransactions: true,
        BeginEntityTransaction: async (): Promise<EntityTransactionScope> => {
            tx.push('begin');
            return {
                IsNested: false,
                Commit: async () => { tx.push('commit'); },
                Rollback: async () => { tx.push('rollback'); },
            };
        },
    };
    const runViewProvider = {
        RunView: async (params: { EntityName: string; ExtraFilter: string }) => {
            viewRequests.push({ EntityName: params.EntityName, ExtraFilter: params.ExtraFilter });
            return viewSucceeds
                ? { Success: true, Results: paramRows }
                : { Success: false, Results: [], ErrorMessage: 'view failed' };
        },
    };
    Object.assign(template, { ID: TEMPLATE_ID, ProviderToUse: provider, RunViewProviderToUse: runViewProvider });
    return { template, tx, viewRequests };
}

describe('MJTemplateEntityServer.Delete', () => {
    it('deletes every param of the template before the template, in one committed transaction', async () => {
        const { template, tx, viewRequests } = harness([{ Name: 'FirstName', ok: true }, { Name: 'Code', ok: true }]);

        expect(await template.Delete()).toBe(true);
        expect(template.Log).toEqual(['param:FirstName', 'param:Code', 'template']);
        expect(tx).toEqual(['begin', 'commit']);
        // Only the template's own params are read, and no other entity is touched.
        expect(viewRequests).toEqual([{ EntityName: 'MJ: Template Params', ExtraFilter: `TemplateID='${TEMPLATE_ID}'` }]);
    });

    it('deletes the template when it has no params', async () => {
        const { template, tx } = harness([]);

        expect(await template.Delete()).toBe(true);
        expect(template.Log).toEqual(['template']);
        expect(tx).toEqual(['begin', 'commit']);
    });

    it('stops at a failed param delete, rolls back, never deletes the template, and reports why', async () => {
        const { template, tx } = harness([{ Name: 'FirstName', ok: true }, { Name: 'Code', ok: false }, { Name: 'Later', ok: true }]);

        expect(await template.Delete()).toBe(false);
        expect(template.Log).toEqual(['param:FirstName', 'param:Code']);
        expect(tx).toEqual(['begin', 'rollback']);
        expect(template.History.at(-1)?.Message).toContain("could not delete template param 'Code'");
    });

    it('rolls back the param deletes when the template delete itself fails (e.g. an AI Prompt still uses it)', async () => {
        const { template, tx } = harness([{ Name: 'FirstName', ok: true }]);
        template.BaseDeleteResult = false;

        expect(await template.Delete()).toBe(false);
        expect(template.Log).toEqual(['param:FirstName', 'template']);
        expect(tx).toEqual(['begin', 'rollback']);
        // The base delete's own result stays the latest one, so callers see the real reason.
        expect(template.History).toHaveLength(1);
        expect(template.LatestResult?.CompleteMessage).toContain('FK_AIPrompt_TemplateID');
    });

    it('fails without deleting anything when the params cannot be loaded', async () => {
        const { template, tx } = harness([{ Name: 'FirstName', ok: true }], false);

        expect(await template.Delete()).toBe(false);
        expect(template.Log).toEqual([]);
        expect(tx).toEqual(['begin', 'rollback']);
        expect(template.History.at(-1)?.Message).toContain('view failed');
    });
});
