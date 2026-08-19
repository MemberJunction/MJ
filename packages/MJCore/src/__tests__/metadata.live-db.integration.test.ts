import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import sql from 'mssql';
import { SQLServerDataProvider, SQLServerProviderConfigData } from '@memberjunction/sqlserver-dataprovider';
import { Metadata, SetProvider } from '../generic/metadata';
import { EntityInfo, EntityFieldInfo, EntityRelationshipInfo } from '../generic/entityInfo';
import {
    ReadRelationshipInclusion,
    ReadRelationshipSortKey,
    ReadRelationshipJoinFields,
    ResolveFormLayout,
    type IEntityConfiguration,
    type IEntityFieldConfiguration,
    type IEntityRelationshipConfiguration,
} from '../generic/entityConfiguration';

describe('Live Database Metadata Integration Tests (bizapps_orders)', () => {
    let pool: sql.ConnectionPool | null = null;
    let provider: SQLServerDataProvider | null = null;

    beforeAll(async () => {
        const config: sql.config = {
            server: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '1433', 10),
            user: process.env.DB_USERNAME || 'sa',
            password: process.env.DB_PASSWORD || 'KRiUffvIjuP5GoLtxYvVkWIQ1BxHQEEMO7j4T684oPR7',
            database: process.env.DB_DATABASE || 'bizapps_orders',
            options: {
                trustServerCertificate: true,
                encrypt: false,
            },
        };

        try {
            pool = await new sql.ConnectionPool(config).connect();

            // Detect whether __mj or admin schema is used for core metadata
            const schemaCheck = await pool.request().query(`
                SELECT TABLE_SCHEMA 
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_NAME = 'Entity' AND TABLE_SCHEMA IN ('__mj', 'admin')
            `);
            const coreSchema = schemaCheck.recordset[0]?.TABLE_SCHEMA || '__mj';
            console.log(`[Live DB Test] Using core schema: ${coreSchema}`);

            provider = new SQLServerDataProvider();
            const configData = new SQLServerProviderConfigData(
                pool,
                coreSchema,
                0,
                undefined,
                undefined,
                true
            );
            await provider.Config(configData);
            Metadata.Provider = provider;
        } catch (err) {
            console.warn('[Live DB Integration Test] Could not connect to live database. Skipping live DB assertions.', err);
        }
    }, 30000);

    afterAll(async () => {
        if (pool && pool.connected) {
            await pool.close();
        }
    });

    it('loads live entities and verifies lazy strongly-typed Configuration across the entire live catalog', () => {
        if (!provider || !pool?.connected) {
            console.warn('Skipping live test: database not connected.');
            return;
        }

        const md = new Metadata();
        const entities = md.Entities;

        expect(entities.length).toBeGreaterThan(100);
        console.log(`[Live DB Test] Successfully loaded ${entities.length} entities from live database.`);

        // 1. Verify EntityInfo Configuration
        let entitiesWithConfigCount = 0;
        for (const entity of entities) {
            expect(entity.ID).toBeDefined();
            expect(entity.Name).toBeDefined();

            // Access lazy getter
            const config = entity.Configuration;
            const configObj = entity.ConfigurationObject;

            if (config !== null) {
                entitiesWithConfigCount++;
                expect(config).toBe(configObj);
                expect(typeof config).toBe('object');
                if (config.UI?.Form?.Layout) {
                    expect(['left-nav', 'accordion', 'tabs', 'auto']).toContain(config.UI.Form.Layout);
                }
            }
        }
        console.log(`[Live DB Test] Found ${entitiesWithConfigCount} entities with non-null Configuration.`);

        // 2. Verify EntityFieldInfo Configuration & Hierarchy
        let hierarchyFieldsCount = 0;
        let fieldsWithConfigCount = 0;
        for (const entity of entities) {
            for (const field of entity.Fields) {
                expect(field.ID).toBeDefined();
                expect(field.Name).toBeDefined();

                const fConfig = field.Configuration;
                const fConfigObj = field.ConfigurationObject;

                if (fConfig !== null) {
                    fieldsWithConfigCount++;
                    expect(fConfig).toBe(fConfigObj);
                    expect(typeof fConfig).toBe('object');
                }

                if (field.IsHierarchy) {
                    hierarchyFieldsCount++;
                    expect(field.HierarchyMaxDepth).toBeGreaterThan(0);
                    expect(field.Configuration?.Hierarchy?.IsHierarchy).toBe(true);
                    console.log(`[Live DB Test] Hierarchy field verified: ${entity.Name}.${field.Name} (MaxDepth: ${field.HierarchyMaxDepth})`);
                }
            }
        }
        console.log(`[Live DB Test] Found ${fieldsWithConfigCount} fields with Configuration, including ${hierarchyFieldsCount} active hierarchy fields.`);

        // 3. Verify EntityRelationshipInfo Configuration
        let relationshipsWithConfigCount = 0;
        for (const entity of entities) {
            for (const rel of entity.RelatedEntities) {
                expect(rel.ID).toBeDefined();

                const rConfig = rel.Configuration;
                const rConfigObj = rel.ConfigurationObject;

                if (rConfig !== null) {
                    relationshipsWithConfigCount++;
                    expect(rConfig).toBe(rConfigObj);
                    expect(typeof rConfig).toBe('object');

                    const inclusion = ReadRelationshipInclusion(rConfig);
                    if (inclusion !== null) {
                        expect(['Primary', 'More', 'None']).toContain(inclusion);
                    }
                }
            }
        }
        console.log(`[Live DB Test] Found ${relationshipsWithConfigCount} relationships with non-null Configuration.`);
    });

    it('verifies specific known core entities with hierarchy fields from live database', () => {
        if (!provider || !pool?.connected) {
            return;
        }

        const md = new Metadata();

        // Check MJ: Entities -> ParentID
        const entitiesEntity = md.Entities.find(e => e.Name === 'MJ: Entities' || e.Name === 'Entities');
        if (entitiesEntity) {
            const parentField = entitiesEntity.Fields.find(f => f.Name === 'ParentID');
            if (parentField && parentField.Configuration?.Hierarchy?.IsHierarchy) {
                expect(parentField.IsHierarchy).toBe(true);
                expect(parentField.HierarchyMaxDepth).toBeGreaterThanOrEqual(1);
                expect(parentField.Configuration).toEqual(parentField.ConfigurationObject);
            }
        }

        // Check MJ: User View Categories -> ParentID
        const uvcEntity = md.Entities.find(e => e.Name === 'MJ: User View Categories' || e.Name === 'User View Categories');
        if (uvcEntity) {
            const parentField = uvcEntity.Fields.find(f => f.Name === 'ParentID');
            if (parentField && parentField.Configuration?.Hierarchy?.IsHierarchy) {
                expect(parentField.IsHierarchy).toBe(true);
                expect(parentField.HierarchyMaxDepth).toBeGreaterThanOrEqual(1);
            }
        }
    });
});
