import { describe, it, expect } from 'vitest';
import {
    EntityAlternateBaseViewInfo,
    EntityInfo,
} from '../generic/entityInfo';
import {
    ExtractAlternateBaseViewFromDisplayState,
    FindAlternateBaseViewByPhysicalName,
    GetEffectiveAlternateBaseViewName,
    GetPinnedAlternateBaseViewFromViewEntity,
    IsValidAlternateBaseViewName,
    IsValidSQLIdentifier,
    ResolveAlternateBaseView,
} from '../generic/alternateBaseViews';
import { NormalizeAlternateBaseViewName, RunViewParams } from '../views/runView';
import { LocalCacheManager } from '../generic/localCacheManager';
import { BaseEngine, BaseEnginePropertyConfig } from '../generic/baseEngine';
import { BaseEntity, BaseEntityEvent } from '../generic/baseEntity';
import { UserInfo } from '../generic/securityInfo';

const ENTITY_ID = '11111111-1111-4111-8111-111111111111';
const VIEW_ACTIVE_ID = '22222222-2222-4222-8222-222222222222';
const VIEW_DERIVED_ID = '33333333-3333-4333-8333-333333333333';
const VIEW_DISABLED_ID = '44444444-4444-4444-8444-444444444444';
const VIEW_BYPASS_ID = '55555555-5555-4555-8555-555555555555';
const VIEW_DEPRECATED_ID = '66666666-6666-4666-8666-666666666666';
const ROLE_READER_ID = '77777777-7777-4777-8777-777777777777';
const ROLE_DENIED_ID = '88888888-8888-4888-8888-888888888888';

function createTestEntity(): EntityInfo {
    return new EntityInfo({
        ID: ENTITY_ID,
        Name: 'Members',
        SchemaName: 'crm',
        BaseTable: 'Member',
        BaseView: 'vwMembers',
        AllowCaching: true,
        TrustServerCacheCompletely: true,
        Status: 'Active',
        EntityFields: [
            { ID: 'f1', EntityID: ENTITY_ID, Name: 'ID', CodeName: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, Sequence: 1, Status: 'Active' },
            { ID: 'f2', EntityID: ENTITY_ID, Name: 'Status', CodeName: 'Status', Type: 'nvarchar', Sequence: 2, Status: 'Active' },
        ],
        EntityPermissions: [
            { ID: 'p1', EntityID: ENTITY_ID, RoleID: ROLE_READER_ID, CanRead: true, CanCreate: false, CanUpdate: false, CanDelete: false },
            { ID: 'p2', EntityID: ENTITY_ID, RoleID: ROLE_DENIED_ID, CanRead: false, CanCreate: false, CanUpdate: false, CanDelete: false },
        ],
        EntityAlternateBaseViews: [
            {
                ID: VIEW_DERIVED_ID,
                EntityID: ENTITY_ID,
                ParentID: VIEW_ACTIVE_ID,
                Name: 'ActiveAutoRenew',
                DisplayName: 'Active Auto-Renew Members',
                ViewName: 'vwActiveAutoRenewMembers',
                SchemaName: null,
                CachePolicy: 'Default',
                Status: 'Active',
                Sequence: 20,
            },
            {
                ID: VIEW_ACTIVE_ID,
                EntityID: ENTITY_ID,
                ParentID: null,
                Name: 'Active',
                DisplayName: null,
                ViewName: 'vwActiveMembers',
                SchemaName: null,
                CachePolicy: 'Default',
                Status: 'Active',
                Sequence: 10,
            },
            {
                ID: VIEW_DISABLED_ID,
                EntityID: ENTITY_ID,
                ParentID: null,
                Name: 'Archived',
                DisplayName: 'Archived Members',
                ViewName: 'vwArchivedMembers',
                SchemaName: 'archive_crm',
                CachePolicy: 'Default',
                Status: 'Disabled',
                Sequence: 30,
            },
            {
                ID: VIEW_BYPASS_ID,
                EntityID: ENTITY_ID,
                ParentID: null,
                Name: 'LiveClock',
                DisplayName: 'Live Clock Members',
                ViewName: 'vwLiveClockMembers',
                SchemaName: null,
                CachePolicy: 'Bypass',
                Status: 'Active',
                Sequence: 40,
            },
            {
                ID: VIEW_DEPRECATED_ID,
                EntityID: ENTITY_ID,
                ParentID: null,
                Name: 'LegacyActive',
                DisplayName: 'Legacy Active',
                ViewName: 'vwLegacyActiveMembers',
                SchemaName: null,
                CachePolicy: 'Default',
                Status: 'Deprecated',
                Sequence: 50,
            },
        ],
    });
}

describe('Alternate Base Views — MJCore', () => {
    describe('IsValidSQLIdentifier and IsValidAlternateBaseViewName', () => {
        it('validates SQL identifiers strictly without external dependencies', () => {
            expect(IsValidSQLIdentifier('vwActiveMembers')).toBe(true);
            expect(IsValidSQLIdentifier('_vw_Active_123')).toBe(true);
            expect(IsValidSQLIdentifier('')).toBe(false);
            expect(IsValidSQLIdentifier('123View')).toBe(false);
            expect(IsValidSQLIdentifier('vwActive; DROP TABLE Member')).toBe(false);
            expect(IsValidSQLIdentifier('vwActive]--')).toBe(false);
            expect(IsValidSQLIdentifier('a'.repeat(129))).toBe(false);
        });

        it('forbids pipe and colon delimiters in semantic alternate base view names', () => {
            expect(IsValidAlternateBaseViewName('Active')).toBe(true);
            expect(IsValidAlternateBaseViewName('Active Members 2026')).toBe(true);
            expect(IsValidAlternateBaseViewName('')).toBe(false);
            expect(IsValidAlternateBaseViewName('   ')).toBe(false);
            expect(IsValidAlternateBaseViewName('Active|imr:1')).toBe(false);
            expect(IsValidAlternateBaseViewName('Active: Bypass')).toBe(false);
            expect(IsValidAlternateBaseViewName('x://host')).toBe(false);
            expect(IsValidAlternateBaseViewName('a'.repeat(101))).toBe(false);
        });
    });

    describe('EntityInfo & EntityAlternateBaseViewInfo hydration and ParentID hierarchy', () => {
        it('sorts AlternateBaseViews by Sequence, links ParentView/ChildViews, and computes EffectiveSchemaName/EffectiveDisplayName', () => {
            const entity = createTestEntity();
            expect(entity.AlternateBaseViews.map(v => v.Name)).toEqual([
                'Active',
                'ActiveAutoRenew',
                'Archived',
                'LiveClock',
                'LegacyActive',
            ]);

            const active = entity.GetAlternateBaseView('active');
            const derived = entity.GetAlternateBaseView('  ACTIVEAUTORENEW  ');
            const archived = entity.GetAlternateBaseView('Archived');

            expect(active).toBeDefined();
            expect(active!.EffectiveDisplayName).toBe('Active');
            expect(active!.EffectiveSchemaName).toBe('crm');
            expect(active!.ParentView).toBeUndefined();
            expect(active!.ChildViews.map(c => c.Name)).toEqual(['ActiveAutoRenew']);

            expect(derived).toBeDefined();
            expect(derived!.EffectiveDisplayName).toBe('Active Auto-Renew Members');
            expect(derived!.ParentView).toBe(active);
            expect(derived!.IsUsable).toBe(true);

            expect(archived!.EffectiveSchemaName).toBe('archive_crm');
            expect(archived!.IsUsable).toBe(false);
        });

        it('propagates disabled, deprecated, and cache-bypass status down the ParentID chain', () => {
            const parent = new EntityAlternateBaseViewInfo({
                ID: VIEW_ACTIVE_ID,
                EntityID: ENTITY_ID,
                Name: 'ParentView',
                ViewName: 'vwParent',
                CachePolicy: 'Bypass',
                Status: 'Deprecated',
            }, 'crm');
            const child = new EntityAlternateBaseViewInfo({
                ID: VIEW_DERIVED_ID,
                EntityID: ENTITY_ID,
                ParentID: VIEW_ACTIVE_ID,
                Name: 'ChildView',
                ViewName: 'vwChild',
                CachePolicy: 'Default',
                Status: 'Active',
            }, 'crm');

            EntityAlternateBaseViewInfo.LinkHierarchy([parent, child], 'crm');
            expect(child.IsUsable).toBe(true);
            expect(child.IsDeprecated).toBe(true);
            expect(child.IsBypassCache).toBe(true);

            parent.Status = 'Disabled';
            expect(child.IsUsable).toBe(false);
        });

        it('resolves physical SQL view names via GetAlternateBaseViewByViewName and FindAlternateBaseViewByPhysicalName', () => {
            const entity = createTestEntity();
            expect(entity.GetAlternateBaseViewByViewName('vwActiveMembers')?.Name).toBe('Active');
            expect(entity.GetAlternateBaseViewByViewName('vwActiveMembers', 'crm')?.Name).toBe('Active');
            expect(entity.GetAlternateBaseViewByViewName('vwActiveMembers', 'wrong_schema')).toBeUndefined();

            const match = FindAlternateBaseViewByPhysicalName([entity], 'vwActiveAutoRenewMembers', 'crm');
            expect(match?.entity).toBe(entity);
            expect(match?.alternateView.Name).toBe('ActiveAutoRenew');
        });
    });

    describe('ResolveAlternateBaseView', () => {
        it('resolves an active alternate base view and enforces entity CanRead when contextUser is supplied', () => {
            const entity = createTestEntity();
            const readerUser = {
                Email: 'reader@example.com',
                UserRoles: [{ RoleID: ROLE_READER_ID }],
            } as unknown as UserInfo;
            const deniedUser = {
                Email: 'denied@example.com',
                UserRoles: [{ RoleID: ROLE_DENIED_ID }],
            } as unknown as UserInfo;

            const resolved = ResolveAlternateBaseView({
                entity,
                alternateBaseViewName: 'Active',
                contextUser: readerUser,
            });
            expect(resolved.effectiveViewName).toBe('vwActiveMembers');
            expect(resolved.effectiveSchemaName).toBe('crm');

            expect(() =>
                ResolveAlternateBaseView({
                    entity,
                    alternateBaseViewName: 'Active',
                    contextUser: deniedUser,
                }),
            ).toThrow(/does not have permission to read entity 'Members'/);
        });

        it('throws on unknown or disabled alternate base views without falling back to BaseView', () => {
            const entity = createTestEntity();
            expect(() =>
                ResolveAlternateBaseView({ entity, alternateBaseViewName: 'DoesNotExist' }),
            ).toThrow(/is not registered on entity 'Members'/);

            expect(() =>
                ResolveAlternateBaseView({ entity, alternateBaseViewName: 'Archived' }),
            ).toThrow(/is disabled and cannot be used/);
        });

        it('allows deprecated views by default and throws when allowDeprecated is false', () => {
            const entity = createTestEntity();
            expect(
                ResolveAlternateBaseView({ entity, alternateBaseViewName: 'LegacyActive' }).effectiveViewName,
            ).toBe('vwLegacyActiveMembers');

            expect(() =>
                ResolveAlternateBaseView({
                    entity,
                    alternateBaseViewName: 'LegacyActive',
                    allowDeprecated: false,
                }),
            ).toThrow(/is deprecated and cannot be used/);
        });
    });

    describe('DisplayState extraction, RunViewParams.Equals, and LocalCacheManager fingerprint isolation', () => {
        it('prioritizes explicit params.AlternateBaseView over ViewEntity DisplayState', () => {
            const fakeViewEntity = {
                Get: (field: string) =>
                    field === 'DisplayState' ? JSON.stringify({ alternateBaseView: 'Active' }) : null,
            } as unknown as BaseEntity;

            expect(GetPinnedAlternateBaseViewFromViewEntity(fakeViewEntity)).toBe('Active');
            expect(GetEffectiveAlternateBaseViewName({ ViewEntity: fakeViewEntity })).toBe('Active');
            expect(
                GetEffectiveAlternateBaseViewName({
                    ViewEntity: fakeViewEntity,
                    AlternateBaseView: 'ActiveAutoRenew',
                }),
            ).toBe('ActiveAutoRenew');
            expect(ExtractAlternateBaseViewFromDisplayState({ AlternateBaseView: 'Active' })).toBe('Active');
        });

        it('compares AlternateBaseView case-insensitively in RunViewParams.Equals', () => {
            const a: RunViewParams = { EntityName: 'Members', AlternateBaseView: 'Active' };
            const b: RunViewParams = { EntityName: 'Members', AlternateBaseView: '  active ' };
            const c: RunViewParams = { EntityName: 'Members' };
            const d: RunViewParams = { EntityName: 'Members', AlternateBaseView: '' };

            expect(RunViewParams.Equals(a, b)).toBe(true);
            expect(RunViewParams.Equals(a, c)).toBe(false);
            expect(RunViewParams.Equals(c, d)).toBe(true);
            expect(NormalizeAlternateBaseViewName(' Active ')).toBe('active');
        });

        it('appends abv:<name> to RunView fingerprints and classifies abv: as a narrowing segment', () => {
            const lcm = LocalCacheManager.Instance;
            const canonicalFp = lcm.GenerateRunViewFingerprint(
                { EntityName: 'Members' },
                'mssql://localhost:1433/db',
            );
            const activeFp = lcm.GenerateRunViewFingerprint(
                { EntityName: 'Members', AlternateBaseView: 'Active' },
                'mssql://localhost:1433/db',
            );
            const otherFp = lcm.GenerateRunViewFingerprint(
                { EntityName: 'Members', AlternateBaseView: 'ActiveAutoRenew' },
                'mssql://localhost:1433/db',
            );

            expect(canonicalFp).not.toContain('abv:');
            expect(activeFp).toContain('|abv:active|');
            expect(activeFp).not.toBe(canonicalFp);
            expect(activeFp).not.toBe(otherFp);

            // Verify hasNarrowingSegment classifies abv: as narrowing (even if a crafted segment contained ://)
            const hasNarrowing = (lcm as unknown as { hasNarrowingSegment(parts: string[]): boolean })
                .hasNarrowingSegment.bind(lcm);
            expect(hasNarrowing(canonicalFp.split('|'))).toBe(false);
            expect(hasNarrowing(activeFp.split('|'))).toBe(true);
            expect(hasNarrowing(['Members', '_', '_', '-1', '0', '_', '_', 'abv:evil://segment'])).toBe(true);
        });
    });

    describe('BaseEngine AlternateBaseView support', () => {
        class TestAbvEngine extends BaseEngine<TestAbvEngine> {
            public ExposeClassify(config: BaseEnginePropertyConfig, event: BaseEntityEvent) {
                return this.classifyEventForConfig(config, event);
            }
            public ExposeCanUseImmediate(config: BaseEnginePropertyConfig): boolean {
                return this.canUseImmediateMutation(config);
            }
            public ExposeBuildParams(config: BaseEnginePropertyConfig): RunViewParams {
                return this.BuildRunViewParamsForConfig(config);
            }
        }

        it('forwards AlternateBaseView in BuildRunViewParamsForConfig, disables immediate mutation, and forces refresh on save', () => {
            const engine = new (TestAbvEngine as unknown as { new (): TestAbvEngine })();
            const record = {} as BaseEntity;
            (engine as unknown as Record<string, unknown>)['ActiveMembers'] = [record];

            const abvConfig = new BaseEnginePropertyConfig({
                PropertyName: 'ActiveMembers',
                EntityName: 'Members',
                AlternateBaseView: 'Active',
            });
            const regularConfig = new BaseEnginePropertyConfig({
                PropertyName: 'ActiveMembers',
                EntityName: 'Members',
            });

            expect(engine.ExposeBuildParams(abvConfig).AlternateBaseView).toBe('Active');
            expect(engine.ExposeBuildParams(regularConfig).AlternateBaseView).toBeUndefined();

            expect(engine.ExposeCanUseImmediate(abvConfig)).toBe(false);
            expect(engine.ExposeCanUseImmediate(regularConfig)).toBe(true);

            const saveEvent: BaseEntityEvent = {
                type: 'save',
                saveSubType: 'update',
                baseEntity: record,
                payload: null,
            };
            expect(engine.ExposeClassify(regularConfig, saveEvent)).toEqual({
                action: 'notify',
                changeType: 'update',
            });
            expect(engine.ExposeClassify(abvConfig, saveEvent)).toEqual({
                action: 'refresh',
            });
        });
    });
});
