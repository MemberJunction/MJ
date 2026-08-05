import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The scope resolver reads two things: an entity's field metadata (to walk foreign keys) and the
 * `Metadata` catalog (to turn `ScopeEntityID` into an entity name for resolver lookup). Both are
 * mocked so the tests are pure and deterministic.
 */
const mockEntityByID = vi.fn();

vi.mock('@memberjunction/core', () => ({
    BaseEntity: class BaseEntity {},
    EntityInfo: class EntityInfo {},
    Metadata: class Metadata {
        public EntityByID(id: string): unknown {
            return mockEntityByID(id);
        }
    }
}));

import { EntityActionScopeResolver, IsEntityActionInScope } from '../EntityActionScopeResolver';
import { MJEntityActionEntityExtended } from '../MJEntityActionEntityExtended';
import { BaseEntity, EntityInfo } from '@memberjunction/core';

// ── Fixtures ─────────────────────────────────────────────────────────────────────────────────────

const DEAL_TYPES_ID = 'AAAAAAAA-0000-0000-0000-000000000001';
const COMPANIES_ID = 'BBBBBBBB-0000-0000-0000-000000000002';
const SCOPE_RECORD_ID = 'CCCCCCCC-0000-0000-0000-000000000003';

/** A subject record with the given FK fields and values. */
function subject(
    fields: { Name: string; RelatedEntityID?: string }[],
    values: Record<string, unknown>
): BaseEntity {
    return {
        EntityInfo: { Fields: fields } as unknown as EntityInfo,
        Get: (name: string) => values[name]
    } as unknown as BaseEntity;
}

function entityAction(scopeEntityID: string | null, scopeRecordID: string | null): MJEntityActionEntityExtended {
    return { ScopeEntityID: scopeEntityID, ScopeRecordID: scopeRecordID } as MJEntityActionEntityExtended;
}

/** The default resolver, used wherever a test isn't exercising a custom registration. */
const defaultResolverFactory = () => new EntityActionScopeResolver();

describe('EntityActionScopeResolver — default foreign-key walk', () => {
    const resolver = new EntityActionScopeResolver();

    it('matches when the single FK to the scope entity holds the scope record ID', async () => {
        const deal = subject([{ Name: 'DealTypeID', RelatedEntityID: DEAL_TYPES_ID }], { DealTypeID: SCOPE_RECORD_ID });
        await expect(resolver.IsInScope(deal, DEAL_TYPES_ID, SCOPE_RECORD_ID)).resolves.toBe(true);
    });

    it('rejects when the FK points at a different scope record', async () => {
        const deal = subject([{ Name: 'DealTypeID', RelatedEntityID: DEAL_TYPES_ID }], {
            DealTypeID: 'DDDDDDDD-0000-0000-0000-00000000000D'
        });
        await expect(resolver.IsInScope(deal, DEAL_TYPES_ID, SCOPE_RECORD_ID)).resolves.toBe(false);
    });

    it('compares UUIDs case-insensitively — SQL Server uppercases, PostgreSQL lowercases', async () => {
        const deal = subject([{ Name: 'DealTypeID', RelatedEntityID: DEAL_TYPES_ID }], {
            DealTypeID: SCOPE_RECORD_ID.toLowerCase()
        });
        await expect(resolver.IsInScope(deal, DEAL_TYPES_ID, SCOPE_RECORD_ID.toUpperCase())).resolves.toBe(true);
    });

    it('matches non-UUID (numeric/text) scope record keys', async () => {
        const deal = subject([{ Name: 'RegionID', RelatedEntityID: DEAL_TYPES_ID }], { RegionID: 42 });
        await expect(resolver.IsInScope(deal, DEAL_TYPES_ID, '42')).resolves.toBe(true);
        await expect(resolver.IsInScope(deal, DEAL_TYPES_ID, '43')).resolves.toBe(false);
    });

    it('rejects when the FK is null on this record', async () => {
        const deal = subject([{ Name: 'DealTypeID', RelatedEntityID: DEAL_TYPES_ID }], { DealTypeID: null });
        await expect(resolver.IsInScope(deal, DEAL_TYPES_ID, SCOPE_RECORD_ID)).resolves.toBe(false);
    });

    it('DECLINES (null) when the subject has no FK to the scope entity — the relationship is indirect', async () => {
        const deal = subject([{ Name: 'DealTypeID', RelatedEntityID: DEAL_TYPES_ID }], { DealTypeID: SCOPE_RECORD_ID });
        await expect(resolver.IsInScope(deal, COMPANIES_ID, SCOPE_RECORD_ID)).resolves.toBeNull();
    });

    it('DECLINES (null) on ambiguity — two FKs to the same entity have no defensible "the" one', async () => {
        const deal = subject(
            [
                { Name: 'OwnerCompanyID', RelatedEntityID: COMPANIES_ID },
                { Name: 'ClientCompanyID', RelatedEntityID: COMPANIES_ID }
            ],
            { OwnerCompanyID: SCOPE_RECORD_ID, ClientCompanyID: 'other' }
        );
        await expect(resolver.IsInScope(deal, COMPANIES_ID, SCOPE_RECORD_ID)).resolves.toBeNull();
    });

    it('ignores non-FK fields when looking for the scope relationship', async () => {
        const deal = subject(
            [{ Name: 'Amount' }, { Name: 'DealTypeID', RelatedEntityID: DEAL_TYPES_ID }],
            { Amount: 100, DealTypeID: SCOPE_RECORD_ID }
        );
        await expect(resolver.IsInScope(deal, DEAL_TYPES_ID, SCOPE_RECORD_ID)).resolves.toBe(true);
    });
});

describe('IsEntityActionInScope', () => {
    beforeEach(() => {
        mockEntityByID.mockReset();
        mockEntityByID.mockImplementation((id: string) => (id === DEAL_TYPES_ID ? { Name: 'Deal Types' } : undefined));
    });

    it('an unscoped binding always applies — the pre-existing behaviour', async () => {
        const deal = subject([], {});
        await expect(IsEntityActionInScope(entityAction(null, null), deal, defaultResolverFactory)).resolves.toBe(true);
    });

    it('a half-configured scope (entity but no record) is treated as unscoped', async () => {
        const deal = subject([], {});
        await expect(IsEntityActionInScope(entityAction(DEAL_TYPES_ID, null), deal, defaultResolverFactory)).resolves.toBe(true);
        await expect(IsEntityActionInScope(entityAction(null, SCOPE_RECORD_ID), deal, defaultResolverFactory)).resolves.toBe(true);
    });

    it('an unscoped binding applies even with no subject record in hand', async () => {
        await expect(IsEntityActionInScope(entityAction(null, null), undefined, defaultResolverFactory)).resolves.toBe(true);
    });

    it('a scoped binding applies when the default FK walk matches', async () => {
        const deal = subject([{ Name: 'DealTypeID', RelatedEntityID: DEAL_TYPES_ID }], { DealTypeID: SCOPE_RECORD_ID });
        await expect(
            IsEntityActionInScope(entityAction(DEAL_TYPES_ID, SCOPE_RECORD_ID), deal, defaultResolverFactory)
        ).resolves.toBe(true);
    });

    it('a scoped binding does NOT apply to a record under a different scope record', async () => {
        const deal = subject([{ Name: 'DealTypeID', RelatedEntityID: DEAL_TYPES_ID }], { DealTypeID: 'someone-else' });
        await expect(
            IsEntityActionInScope(entityAction(DEAL_TYPES_ID, SCOPE_RECORD_ID), deal, defaultResolverFactory)
        ).resolves.toBe(false);
    });

    it('a scoped binding does NOT fire when there is no subject record to evaluate', async () => {
        await expect(
            IsEntityActionInScope(entityAction(DEAL_TYPES_ID, SCOPE_RECORD_ID), null, defaultResolverFactory)
        ).resolves.toBe(false);
    });

    it('a scoped binding does NOT fire when the scope entity is unknown to metadata', async () => {
        const deal = subject([{ Name: 'CompanyID', RelatedEntityID: COMPANIES_ID }], { CompanyID: SCOPE_RECORD_ID });
        await expect(
            IsEntityActionInScope(entityAction(COMPANIES_ID, SCOPE_RECORD_ID), deal, defaultResolverFactory)
        ).resolves.toBe(false);
    });

    it('a scoped binding does NOT fire when no resolver can be produced', async () => {
        const deal = subject([{ Name: 'DealTypeID', RelatedEntityID: DEAL_TYPES_ID }], { DealTypeID: SCOPE_RECORD_ID });
        await expect(
            IsEntityActionInScope(entityAction(DEAL_TYPES_ID, SCOPE_RECORD_ID), deal, () => null)
        ).resolves.toBe(false);
    });

    it('a resolver that DECLINES (null) leaves the binding not-applicable — declining is not approval', async () => {
        class DecliningResolver extends EntityActionScopeResolver {
            public override async IsInScope(): Promise<boolean | null> {
                return null;
            }
        }
        const deal = subject([{ Name: 'DealTypeID', RelatedEntityID: DEAL_TYPES_ID }], { DealTypeID: SCOPE_RECORD_ID });
        await expect(
            IsEntityActionInScope(entityAction(DEAL_TYPES_ID, SCOPE_RECORD_ID), deal, () => new DecliningResolver())
        ).resolves.toBe(false);
    });

    it('an app-specific resolver overrides the default FK walk in both directions', async () => {
        class AlwaysInScope extends EntityActionScopeResolver {
            public override async IsInScope(): Promise<boolean | null> {
                return true;
            }
        }
        class NeverInScope extends EntityActionScopeResolver {
            public override async IsInScope(): Promise<boolean | null> {
                return false;
            }
        }
        // No FK at all — the default walk would decline, but the app resolver says yes.
        const orphan = subject([], {});
        await expect(
            IsEntityActionInScope(entityAction(DEAL_TYPES_ID, SCOPE_RECORD_ID), orphan, () => new AlwaysInScope())
        ).resolves.toBe(true);

        // FK matches — the default walk would say yes, but the app resolver says no.
        const matching = subject([{ Name: 'DealTypeID', RelatedEntityID: DEAL_TYPES_ID }], { DealTypeID: SCOPE_RECORD_ID });
        await expect(
            IsEntityActionInScope(entityAction(DEAL_TYPES_ID, SCOPE_RECORD_ID), matching, () => new NeverInScope())
        ).resolves.toBe(false);
    });

    it('looks the resolver up by the scope entity NAME', async () => {
        const lookup = vi.fn().mockReturnValue(new EntityActionScopeResolver());
        const deal = subject([{ Name: 'DealTypeID', RelatedEntityID: DEAL_TYPES_ID }], { DealTypeID: SCOPE_RECORD_ID });
        await IsEntityActionInScope(entityAction(DEAL_TYPES_ID, SCOPE_RECORD_ID), deal, lookup);
        expect(lookup).toHaveBeenCalledWith('Deal Types');
    });
});
