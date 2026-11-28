/**
 * #4929 — the BizApps CRM, FormBuilders and LMS bases pick a company's connection through this resolver: a validated
 * company ID, the bindable Integration column, active rows only, and a refusal naming the candidates when there are
 * several, instead of the first row.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { runViewMock, loadMock } = vi.hoisted(() => ({ runViewMock: vi.fn(), loadMock: vi.fn() }));

vi.mock('@memberjunction/core', () => {
    class RunView {
        RunView = runViewMock;
        static FromMetadataProvider() {
            return new RunView();
        }
    }
    class Metadata {
        async GetEntityObject() {
            const record: Record<string, unknown> = {};
            record.Load = async (id: string) => loadMock(id, record);
            return record;
        }
    }
    return { RunView, Metadata, UserInfo: class {} };
});

import { CompanyIntegrationResolutionError, ResolveCompanyIntegration } from '../CompanyIntegrationResolver';
import type { UserInfo } from '@memberjunction/core';

const COMPANY = 'aaaaaaaa-0000-4000-8000-000000000001';
const OTHER_COMPANY = 'aaaaaaaa-0000-4000-8000-000000000002';
const CI_1 = 'cccccccc-0000-4000-8000-000000000001';
const CI_2 = 'cccccccc-0000-4000-8000-000000000002';
const user = { ID: 'u' } as UserInfo;

const row = (id: string, name: string, overrides: Record<string, unknown> = {}) => ({
    ID: id, Name: name, CompanyID: COMPANY, Integration: 'HubSpot', IsActive: true, ...overrides,
});

async function refusal(promise: Promise<unknown>): Promise<CompanyIntegrationResolutionError> {
    const err = await promise.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CompanyIntegrationResolutionError);
    return err as CompanyIntegrationResolutionError;
}

describe('ResolveCompanyIntegration', () => {
    beforeEach(() => {
        runViewMock.mockReset();
        loadMock.mockReset();
    });

    it('filters on the escaped company, active rows and the Integration column', async () => {
        runViewMock.mockResolvedValue({ Success: true, Results: [row(CI_1, 'Main')] });
        const ci = await ResolveCompanyIntegration({ CompanyID: COMPANY, IntegrationNames: ["Hub'Spot"], ContextUser: user });
        expect(ci.ID).toBe(CI_1);
        const filter = runViewMock.mock.calls[0][0].ExtraFilter as string;
        expect(filter).toBe(`CompanyID = '${COMPANY}' AND IsActive = 1 AND Integration IN ('Hub''Spot')`);
        expect(filter).not.toContain('Integration.Name');
    });

    it("refuses a CompanyID that is not a UUID before any query (a quote can't reach the filter)", async () => {
        const err = await refusal(ResolveCompanyIntegration({ CompanyID: "x' OR 1=1 --", IntegrationNames: ['HubSpot'], ContextUser: user }));
        expect(err.Code).toBe('VALIDATION_ERROR');
        expect(runViewMock).not.toHaveBeenCalled();
    });

    it('says when there is no connection', async () => {
        runViewMock.mockResolvedValue({ Success: true, Results: [] });
        const err = await refusal(ResolveCompanyIntegration({ CompanyID: COMPANY, IntegrationNames: ['HubSpot'], ContextUser: user }));
        expect(err.Code).toBe('NO_COMPANY_INTEGRATION');
    });

    it('refuses several matches, naming them, instead of taking the first', async () => {
        runViewMock.mockResolvedValue({ Success: true, Results: [row(CI_1, 'Prod'), row(CI_2, 'Sandbox')] });
        const err = await refusal(ResolveCompanyIntegration({ CompanyID: COMPANY, IntegrationNames: ['HubSpot'], ContextUser: user }));
        expect(err.Code).toBe('AMBIGUOUS_COMPANY_INTEGRATION');
        expect(err.message).toContain("'Prod'");
        expect(err.message).toContain("'Sandbox'");
        expect(err.message).toContain('CompanyIntegrationID');
    });

    it('uses an explicit CompanyIntegrationID of the same company', async () => {
        loadMock.mockImplementation(async (_id: string, rec: Record<string, unknown>) => { Object.assign(rec, row(CI_2, 'Sandbox')); return true; });
        const ci = await ResolveCompanyIntegration({ CompanyID: COMPANY, IntegrationNames: ['HubSpot'], CompanyIntegrationID: CI_2, ContextUser: user });
        expect(ci.ID).toBe(CI_2);
        expect(runViewMock).not.toHaveBeenCalled();
    });

    it("refuses an explicit CompanyIntegrationID of another company", async () => {
        loadMock.mockImplementation(async (_id: string, rec: Record<string, unknown>) => { Object.assign(rec, row(CI_2, 'Theirs', { CompanyID: OTHER_COMPANY })); return true; });
        const err = await refusal(ResolveCompanyIntegration({ CompanyID: COMPANY, IntegrationNames: ['HubSpot'], CompanyIntegrationID: CI_2, ContextUser: user }));
        expect(err.Code).toBe('COMPANY_INTEGRATION_WRONG_COMPANY');
    });

    it('refuses an explicit connection that is inactive or of another integration', async () => {
        loadMock.mockImplementation(async (_id: string, rec: Record<string, unknown>) => { Object.assign(rec, row(CI_2, 'Old', { IsActive: false })); return true; });
        expect((await refusal(ResolveCompanyIntegration({ CompanyID: COMPANY, IntegrationNames: ['HubSpot'], CompanyIntegrationID: CI_2, ContextUser: user }))).Code)
            .toBe('COMPANY_INTEGRATION_INACTIVE');
        loadMock.mockImplementation(async (_id: string, rec: Record<string, unknown>) => { Object.assign(rec, row(CI_2, 'Forms', { Integration: 'Typeform' })); return true; });
        expect((await refusal(ResolveCompanyIntegration({ CompanyID: COMPANY, IntegrationNames: ['HubSpot'], CompanyIntegrationID: CI_2, ContextUser: user }))).Code)
            .toBe('COMPANY_INTEGRATION_WRONG_INTEGRATION');
    });
});
