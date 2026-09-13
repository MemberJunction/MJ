/**
 * `GetIntegrationObjectByID` must answer for a per-connection object id as well as a shared one.
 *
 * THE INCIDENT (sandbox, 2026-09-12). The fields lookup was made id-polymorphic, and the reasoning
 * written into it was that object ids are UUIDs from two disjoint tables and cannot collide, so the
 * id itself says which catalog the caller meant and no call site needs changing. The OBJECT lookup
 * by id was left shared-only, which put a hole exactly where the two sides meet.
 *
 * A connector's nested fetch resolves a child's parent through the per-connection FK edge
 * (`RelatedCompanyIntegrationObjectID`, surfaced on the field as `RelatedIntegrationObjectID`) and
 * then asks for that object by id. The shared-only lookup returned undefined and the connector
 * threw `Parent IntegrationObject not found: <id>` for EVERY child object — twenty of PheedLoop's
 * twenty-seven — so each fetched nothing while the run still reported Success. The three objects
 * with no parent (Members 312, Tickets 21, Events 5) synced; the total was 338 where the same
 * connector had previously synced about sixteen hundred, and each dead object carried only
 * INCOMPLETE/persistent-error rather than a failure anyone had to look at.
 *
 * A parent id is the one case with no safe fallback: it is not in the shared table at all, so an
 * over-broad shared answer is not available and the lookup simply has to reach the other catalog.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { IntegrationEngineBase } from '../IntegrationEngineBase';
import { CATALOG_OBJECT_COLUMNS } from '../CompanyIntegrationCatalog';
import type { BaseEntity } from '@memberjunction/core';

const INTEGRATION = 'AAAAAAAA-1111-2222-3333-444444444444';
const SHARED_EVENTS = '2ECE575C-9443-4627-B03D-23429DA3EC24';
const CIO_EVENTS = 'BBBBBBBB-1111-2222-3333-444444444444';
const CONNECTION = 'CCCCCCCC-1111-2222-3333-444444444444';

/** A stand-in for a loaded per-connection row: `Get` answers for the real view columns. */
function catalogRow(values: Record<string, unknown>): BaseEntity {
    const all: Record<string, unknown> = {};
    for (const c of CATALOG_OBJECT_COLUMNS) all[c] = null;
    Object.assign(all, values);
    return {
        Fields: Object.keys(all).map(Name => ({ Name })),
        Get: (c: string) => all[c],
    } as unknown as BaseEntity;
}

describe('GetIntegrationObjectByID spans both catalogs', () => {
    let engine: IntegrationEngineBase;

    beforeEach(() => {
        engine = IntegrationEngineBase.Instance;
        engine.SeedForTesting({
            IntegrationObjects: [
                { ID: SHARED_EVENTS, IntegrationID: INTEGRATION, Name: 'Events', Status: 'Active' },
            ] as never,
            CompanyIntegrationObjects: [
                catalogRow({
                    ID: CIO_EVENTS,
                    CompanyIntegrationID: CONNECTION,
                    IntegrationID: INTEGRATION,
                    Name: 'Events',
                    Status: 'Active',
                    Sequence: 1,
                }),
            ],
        });
    });

    it('resolves a per-connection object id — the parent edge that threw', () => {
        const parent = engine.GetIntegrationObjectByID(CIO_EVENTS);
        expect(parent).toBeDefined();
        expect(parent?.Name).toBe('Events');
    });

    it('still resolves a shared object id', () => {
        expect(engine.GetIntegrationObjectByID(SHARED_EVENTS)?.Name).toBe('Events');
    });

    it('matches case-insensitively on either side, as UUIDsEqual does', () => {
        // SQL Server hands back uppercase ids, PostgreSQL lowercase.
        expect(engine.GetIntegrationObjectByID(CIO_EVENTS.toLowerCase())?.Name).toBe('Events');
        expect(engine.GetIntegrationObjectByID(SHARED_EVENTS.toLowerCase())?.Name).toBe('Events');
    });

    it('is still undefined for an id in neither catalog', () => {
        expect(engine.GetIntegrationObjectByID('99999999-9999-9999-9999-999999999999')).toBeUndefined();
    });

    it('prefers the shared row when an id somehow appears in both, so a shared id costs its old scan', () => {
        engine.SeedForTesting({
            IntegrationObjects: [
                { ID: SHARED_EVENTS, IntegrationID: INTEGRATION, Name: 'SharedEvents', Status: 'Active' },
            ] as never,
            CompanyIntegrationObjects: [
                catalogRow({
                    ID: SHARED_EVENTS,
                    CompanyIntegrationID: CONNECTION,
                    IntegrationID: INTEGRATION,
                    Name: 'PerConnectionEvents',
                    Status: 'Active',
                    Sequence: 1,
                }),
            ],
        });
        expect(engine.GetIntegrationObjectByID(SHARED_EVENTS)?.Name).toBe('SharedEvents');
    });
});
