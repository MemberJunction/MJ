import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProviderBase } from '../generic/providerBase';
import { ProviderConfigDataBase, RunViewResult } from '../generic/interfaces';
import { RunViewParams } from '../views/runView';
import { UserInfo, TenantContext } from '../generic/securityInfo';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';

/**
 * Verifies that ProviderBase's RunView request deduplication (both in-flight and
 * DedupLingerMs linger hits) isolates callers sharing the same UserInfo.ID when they
 * carry different per-request tenant, magic-link, widget-guest, or API-key scopes.
 *
 * Why this matters: dedup runs BEFORE PreRunView hooks inject tenant ExtraFilters,
 * so keying solely on contextUser.ID would let Org B hit Org A's in-flight or
 * lingering RunView result whenever the same user (or elevated system principal)
 * serves multiple tenants within DedupLingerMs.
 */
interface ExtendedTenantContext extends TenantContext {
    organizationID?: string;
    knowledgeSetID?: string;
}

class TenantDedupTestProvider extends TestMetadataProvider {
    public CallCount = 0;
    public ObservedTenants: Array<string | undefined> = [];
    public DelayMs = 15;
    public CustomScopeSuffix = '';

    protected override ComputeRunViewDedupContextScope(contextUser?: UserInfo): string | null {
        const base = super.ComputeRunViewDedupContextScope(contextUser);
        if (base === null) return null;
        if (!this.CustomScopeSuffix) return base;
        return base ? `${base}|${this.CustomScopeSuffix}` : this.CustomScopeSuffix;
    }

    protected override async InternalRunViews<T = unknown>(
        params: RunViewParams[],
        contextUser?: UserInfo,
    ): Promise<RunViewResult<T>[]> {
        this.CallCount++;
        const tenantId = contextUser?.TenantContext?.TenantID;
        this.ObservedTenants.push(tenantId);
        if (this.DelayMs > 0) {
            await new Promise((r) => setTimeout(r, this.DelayMs));
        }
        return params.map(() => ({
            Success: true,
            Results: [{ tenant: tenantId ?? 'none', call: this.CallCount }] as unknown as T[],
            UserViewObject: null,
            RowCount: 1,
            TotalRowCount: 1,
            ExecutionTime: 1,
            ErrorMessage: '',
        }));
    }
}

function makeUser(id: string, configure?: (u: UserInfo) => void, roleIds: string[] = []): UserInfo {
    const user = new UserInfo(null, {
        ID: id,
        Name: 'Test User',
        Email: 'u@example.com',
        UserRoles: roleIds.map((RoleID) => ({ RoleID })),
    });
    configure?.(user);
    return user;
}

describe('ProviderBase RunView dedup — tenant & per-request security context isolation', () => {
    const SHARED_USER_ID = '11111111-1111-4111-8111-111111111111';
    const ORG_A = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';
    const ORG_B = 'BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB';

    let provider: TenantDedupTestProvider;
    const baseParams = (): RunViewParams => ({
        EntityName: 'Test Entity 1',
        ExtraFilter: 'IsActive=1',
        ResultType: 'simple',
    });

    beforeEach(async () => {
        provider = new TenantDedupTestProvider();
        await provider.Config(new ProviderConfigDataBase({}, '__mj', [], [], true));
        provider.CallCount = 0;
        provider.ObservedTenants = [];
        provider.DelayMs = 15;
        provider.CustomScopeSuffix = '';
        ProviderBase.DedupLingerMs = 5000;
        ProviderBase.CoalesceWindowMs = 0;
    });

    afterEach(() => {
        ProviderBase.DedupLingerMs = 5000;
        ProviderBase.CoalesceWindowMs = 10;
    });

    it('isolates concurrent in-flight RunViews for the SAME UserInfo.ID across different TenantContext.TenantIDs', async () => {
        const userOrgA = makeUser(SHARED_USER_ID, (u) => {
            u.TenantContext = { TenantID: ORG_A, Source: 'header' };
        });
        const userOrgB = makeUser(SHARED_USER_ID, (u) => {
            u.TenantContext = { TenantID: ORG_B, Source: 'header' };
        });

        const [resA, resB] = await Promise.all([
            provider.RunViews<{ tenant: string }>([baseParams()], userOrgA),
            provider.RunViews<{ tenant: string }>([baseParams()], userOrgB),
        ]);

        expect(provider.CallCount).toBe(2);
        expect(resA[0].Results[0].tenant).toBe(ORG_A);
        expect(resB[0].Results[0].tenant).toBe(ORG_B);
    });

    it('isolates lingering RunView dedup hits across different TenantContext.TenantIDs (and unscoped vs tenanted)', async () => {
        provider.DelayMs = 0;
        const userOrgA = makeUser(SHARED_USER_ID, (u) => {
            u.TenantContext = { TenantID: ORG_A, Source: 'header' };
        });
        const userOrgB = makeUser(SHARED_USER_ID, (u) => {
            u.TenantContext = { TenantID: ORG_B, Source: 'header' };
        });
        const userUnscoped = makeUser(SHARED_USER_ID);

        const resA = await provider.RunViews<{ tenant: string }>([baseParams()], userOrgA);
        const resB = await provider.RunViews<{ tenant: string }>([baseParams()], userOrgB);
        const resNone = await provider.RunViews<{ tenant: string }>([baseParams()], userUnscoped);

        expect(provider.CallCount).toBe(3);
        expect(resA[0].Results[0].tenant).toBe(ORG_A);
        expect(resB[0].Results[0].tenant).toBe(ORG_B);
        expect(resNone[0].Results[0].tenant).toBe('none');
    });

    it('still deduplicates requests for the SAME user and SAME tenant (case-insensitive UUID normalization)', async () => {
        const userUpper = makeUser(SHARED_USER_ID.toUpperCase(), (u) => {
            u.TenantContext = { TenantID: ORG_A.toUpperCase(), Source: 'header' };
        });
        const userLower = makeUser(SHARED_USER_ID.toLowerCase(), (u) => {
            u.TenantContext = { TenantID: ORG_A.toLowerCase(), Source: 'header' };
        });

        await Promise.all([
            provider.RunViews([baseParams()], userUpper),
            provider.RunViews([baseParams()], userLower),
        ]);

        expect(provider.CallCount).toBe(1);
    });

    it('isolates extended TenantContext scalar fields (e.g. organizationID / knowledgeSetID on SaaS subclasses)', async () => {
        provider.DelayMs = 0;
        const ctx1: ExtendedTenantContext = { TenantID: ORG_A, Source: 'header', organizationID: ORG_A, knowledgeSetID: 'ks-1' };
        const ctx2: ExtendedTenantContext = { TenantID: ORG_A, Source: 'header', organizationID: ORG_A, knowledgeSetID: 'ks-2' };
        const u1 = makeUser(SHARED_USER_ID, (u) => { u.TenantContext = ctx1; });
        const u2 = makeUser(SHARED_USER_ID, (u) => { u.TenantContext = ctx2; });

        await provider.RunViews([baseParams()], u1);
        await provider.RunViews([baseParams()], u2);

        expect(provider.CallCount).toBe(2);
    });

    it('isolates MagicLinkScope, APIKeyActingContext, APIKeyRowFilters, WidgetGuestContext, AnonymousVisitorID, and synthesized anonymous roles', async () => {
        provider.DelayMs = 0;

        const ml1 = makeUser(SHARED_USER_ID, (u) => { u.MagicLinkScope = { ResourceType: 'Conversation', ResourceID: 'r-1' }; });
        const ml2 = makeUser(SHARED_USER_ID, (u) => { u.MagicLinkScope = { ResourceType: 'Conversation', ResourceID: 'r-2' }; });
        await provider.RunViews([baseParams()], ml1);
        await provider.RunViews([baseParams()], ml2);
        expect(provider.CallCount).toBe(2);

        const ak1 = makeUser(SHARED_USER_ID, (u) => { u.APIKeyActingContext = { ActingOrganizationID: ORG_A, ActingCompanyIDs: ['c-1'] }; });
        const ak2 = makeUser(SHARED_USER_ID, (u) => { u.APIKeyActingContext = { ActingOrganizationID: ORG_B, ActingCompanyIDs: ['c-1'] }; });
        await provider.RunViews([baseParams()], ak1);
        await provider.RunViews([baseParams()], ak2);
        expect(provider.CallCount).toBe(4);

        const akf1 = makeUser(SHARED_USER_ID, (u) => { u.APIKeyRowFilters = [{ EntityID: 'e-1', PermissionType: 'Read', FilterID: 'f-1' }]; });
        const akf2 = makeUser(SHARED_USER_ID, (u) => { u.APIKeyRowFilters = [{ EntityID: 'e-1', PermissionType: 'Read', FilterID: 'f-2' }]; });
        await provider.RunViews([baseParams()], akf1);
        await provider.RunViews([baseParams()], akf2);
        expect(provider.CallCount).toBe(6);

        const wg1 = makeUser(SHARED_USER_ID, (u) => { u.WidgetGuestContext = { WidgetID: 'w-1' }; u.AnonymousVisitorID = 'v-1'; });
        const wg2 = makeUser(SHARED_USER_ID, (u) => { u.WidgetGuestContext = { WidgetID: 'w-2' }; u.AnonymousVisitorID = 'v-1'; });
        const wg3 = makeUser(SHARED_USER_ID, (u) => { u.WidgetGuestContext = { WidgetID: 'w-1' }; u.AnonymousVisitorID = 'v-2'; });
        await provider.RunViews([baseParams()], wg1);
        await provider.RunViews([baseParams()], wg2);
        await provider.RunViews([baseParams()], wg3);
        expect(provider.CallCount).toBe(9);

        const mla1 = makeUser(SHARED_USER_ID, (u) => {
            u.IsMagicLinkAnonymous = true;
        }, ['role-a']);
        const mla2 = makeUser(SHARED_USER_ID, (u) => {
            u.IsMagicLinkAnonymous = true;
        }, ['role-b']);
        await provider.RunViews([baseParams()], mla1);
        await provider.RunViews([baseParams()], mla2);
        expect(provider.CallCount).toBe(11);
    });

    it('preserves case sensitivity for non-UUID tenant IDs (e.g. PostgreSQL mixed-case TenantIDs)', async () => {
        provider.DelayMs = 0;
        const uUpper = makeUser(SHARED_USER_ID, (u) => { u.TenantContext = { TenantID: 'TenantA', Source: 'header' }; });
        const uLower = makeUser(SHARED_USER_ID, (u) => { u.TenantContext = { TenantID: 'tenanta', Source: 'header' }; });

        await provider.RunViews([baseParams()], uUpper);
        await provider.RunViews([baseParams()], uLower);

        expect(provider.CallCount).toBe(2);
    });

    it('bypasses dedup completely when TenantContext contains nested objects or object arrays', async () => {
        provider.DelayMs = 0;
        const uObj = makeUser(SHARED_USER_ID, (u) => {
            u.TenantContext = {
                TenantID: ORG_A,
                Source: 'header',
                nestedScope: { region: 'us-east' },
            } as unknown as TenantContext;
        });

        await provider.RunViews([baseParams()], uObj);
        await provider.RunViews([baseParams()], uObj);

        expect(provider.CallCount).toBe(2);

        const uObjArr = makeUser(SHARED_USER_ID, (u) => {
            u.TenantContext = {
                TenantID: ORG_A,
                Source: 'header',
                scopes: [{ id: 's-1' }],
            } as unknown as TenantContext;
        });

        await provider.RunViews([baseParams()], uObjArr);
        await provider.RunViews([baseParams()], uObjArr);

        expect(provider.CallCount).toBe(4);
    });

    it('allows provider subclasses to extend ComputeRunViewDedupContextScope for custom per-call isolation', async () => {
        provider.DelayMs = 0;
        const user = makeUser(SHARED_USER_ID);

        provider.CustomScopeSuffix = 'custom:alpha';
        await provider.RunViews([baseParams()], user);
        provider.CustomScopeSuffix = 'custom:beta';
        await provider.RunViews([baseParams()], user);

        expect(provider.CallCount).toBe(2);
    });
});
