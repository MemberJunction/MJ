/**
 * Regression tests for #3738 — saving a CompanyIntegration must not run a
 * live source introspection.
 *
 * The class used to override `Save()` and await the full
 * `IntegrationConnectorCreationPipeline` whenever `IsActive` transitioned
 * `false → true`. That made an unbounded scan of the customer's source a side
 * effect of writing a row: it fired for every writer of that transition (an
 * Explorer edit, a repair script, a sync), it ran inside the caller's HTTP
 * request, and on the create path it ran before the credential had been tested.
 *
 * These tests pin the shape of the fix rather than the mechanics of the
 * pipeline: the save path carries no override at all, and the pipeline is
 * reachable only by an explicit call.
 */
import { describe, it, expect } from 'vitest';
import { MJCompanyIntegrationEntityServer } from '../custom/MJCompanyIntegrationEntityServer.server';

describe('MJCompanyIntegrationEntityServer', () => {
    it('does not override Save — nothing implicit hangs off the save path', () => {
        // An own `Save` property on the prototype is exactly what the old hook
        // was. Its absence means a save is a save: `BaseEntity.Save()` runs and
        // no discovery is triggered, whoever the writer is.
        const own = Object.getOwnPropertyDescriptor(MJCompanyIntegrationEntityServer.prototype, 'Save');
        expect(own).toBeUndefined();
    });

    it('still inherits a working Save from the base entity', () => {
        // Guards against "fixing" the hook by deleting the capability: the
        // class must remain a saveable entity, just one that only saves.
        expect(typeof MJCompanyIntegrationEntityServer.prototype.Save).toBe('function');
    });

    it('exposes the schema-refresh pipeline as an explicit, callable method', () => {
        // The pipeline itself was never the problem — the implicit trigger was.
        // Callers that want a catalog ask for one through this method (or,
        // over GraphQL, through the resolvers' `runSchemaRefresh` argument).
        const own = Object.getOwnPropertyDescriptor(
            MJCompanyIntegrationEntityServer.prototype,
            'RunSchemaRefreshPipeline',
        );
        expect(own).toBeDefined();
        expect(typeof own?.value).toBe('function');
    });
});
