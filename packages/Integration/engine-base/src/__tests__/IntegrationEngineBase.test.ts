import { describe, it, expect, beforeEach } from 'vitest';
import { IntegrationEngineBase } from '../IntegrationEngineBase';

describe('IntegrationEngineBase', () => {
    let engine: IntegrationEngineBase;

    beforeEach(() => {
        engine = IntegrationEngineBase.Instance;
    });

    it('should return a singleton instance', () => {
        const instance1 = IntegrationEngineBase.Instance;
        const instance2 = IntegrationEngineBase.Instance;
        expect(instance1).toBe(instance2);
    });

    it('should have empty arrays before Config is called', () => {
        expect(engine.Integrations).toEqual([]);
        expect(engine.SourceTypes).toEqual([]);
        expect(engine.CompanyIntegrations).toEqual([]);
        expect(engine.EntityMaps).toEqual([]);
        expect(engine.FieldMaps).toEqual([]);
        expect(engine.Watermarks).toEqual([]);
        expect(engine.IntegrationObjects).toEqual([]);
        expect(engine.IntegrationObjectFields).toEqual([]);
    });

    describe('lookup methods with no data', () => {
        it('GetIntegrationByID returns undefined when empty', () => {
            expect(engine.GetIntegrationByID('non-existent-id')).toBeUndefined();
        });

        it('GetIntegrationByName returns undefined when empty', () => {
            expect(engine.GetIntegrationByName('NonExistent')).toBeUndefined();
        });

        it('GetCompanyIntegrationByID returns undefined when empty', () => {
            expect(engine.GetCompanyIntegrationByID('non-existent-id')).toBeUndefined();
        });

        it('GetCompanyIntegrationsByIntegrationID returns empty array', () => {
            expect(engine.GetCompanyIntegrationsByIntegrationID('non-existent-id')).toEqual([]);
        });

        it('GetEntityMapsForCompanyIntegration returns empty array', () => {
            expect(engine.GetEntityMapsForCompanyIntegration('non-existent-id')).toEqual([]);
        });

        it('GetFieldMapsForEntityMap returns empty array', () => {
            expect(engine.GetFieldMapsForEntityMap('non-existent-id')).toEqual([]);
        });

        it('GetWatermark returns undefined when empty', () => {
            expect(engine.GetWatermark('non-existent-id', 'Pull')).toBeUndefined();
        });

        it('GetEnabledEntityMaps returns empty array', () => {
            expect(engine.GetEnabledEntityMaps('non-existent-id')).toEqual([]);
        });

        it('GetIntegrationForCompanyIntegration returns undefined when empty', () => {
            expect(engine.GetIntegrationForCompanyIntegration('non-existent-id')).toBeUndefined();
        });

        it('GetIntegrationObjectsByIntegrationID returns empty array', () => {
            expect(engine.GetIntegrationObjectsByIntegrationID('non-existent-id')).toEqual([]);
        });

        it('GetIntegrationObject returns undefined when empty', () => {
            expect(engine.GetIntegrationObject('non-existent-id', 'SomeObject')).toBeUndefined();
        });

        it('GetIntegrationObjectByID returns undefined when empty', () => {
            expect(engine.GetIntegrationObjectByID('non-existent-id')).toBeUndefined();
        });

        it('GetIntegrationObjectFields returns empty array', () => {
            expect(engine.GetIntegrationObjectFields('non-existent-id')).toEqual([]);
        });

        it('GetActiveIntegrationObjects returns empty array', () => {
            expect(engine.GetActiveIntegrationObjects('non-existent-id')).toEqual([]);
        });

        it('GetObjectsInDependencyOrder returns empty array', () => {
            expect(engine.GetObjectsInDependencyOrder('non-existent-id')).toEqual([]);
        });
    });
});
