import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, UserInfo, RegisterForStartup } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import type {
    MJIntegrationEntity,
    MJIntegrationSourceTypeEntity,
    MJCompanyIntegrationEntity,
    MJCompanyIntegrationEntityMapEntity,
    MJCompanyIntegrationFieldMapEntity,
    MJCompanyIntegrationSyncWatermarkEntity,
} from '@memberjunction/core-entities';

/**
 * IntegrationEngineBase provides cached metadata for the MJ integration subsystem.
 *
 * It extends BaseEngine to load and auto-refresh all integration-related entities
 * (Integrations, CompanyIntegrations, EntityMaps, FieldMaps, Watermarks, SourceTypes).
 *
 * This class is safe to use in both client (Angular) and server contexts.
 * For server-side orchestration (sync execution), use the full IntegrationEngine
 * from @memberjunction/integration-engine which wraps this base via composition.
 */
@RegisterForStartup()
export class IntegrationEngineBase extends BaseEngine<IntegrationEngineBase> {
    // ── Cached entity arrays ──────────────────────────────────────────
    private _integrations: MJIntegrationEntity[] = [];
    private _sourceTypes: MJIntegrationSourceTypeEntity[] = [];
    private _companyIntegrations: MJCompanyIntegrationEntity[] = [];
    private _entityMaps: MJCompanyIntegrationEntityMapEntity[] = [];
    private _fieldMaps: MJCompanyIntegrationFieldMapEntity[] = [];
    private _watermarks: MJCompanyIntegrationSyncWatermarkEntity[] = [];

    // ── BaseEngine Config ─────────────────────────────────────────────

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider) {
        const params: Array<Partial<BaseEnginePropertyConfig>> = [
            {
                PropertyName: '_integrations',
                EntityName: 'MJ: Integrations',
                CacheLocal: true,
            },
            {
                PropertyName: '_sourceTypes',
                EntityName: 'MJ: Integration Source Types',
                CacheLocal: true,
            },
            {
                PropertyName: '_companyIntegrations',
                EntityName: 'MJ: Company Integrations',
                CacheLocal: true,
            },
            {
                PropertyName: '_entityMaps',
                EntityName: 'MJ: Company Integration Entity Maps',
                CacheLocal: true,
            },
            {
                PropertyName: '_fieldMaps',
                EntityName: 'MJ: Company Integration Field Maps',
                CacheLocal: true,
            },
            {
                PropertyName: '_watermarks',
                EntityName: 'MJ: Company Integration Sync Watermarks',
                CacheLocal: true,
            },
        ];

        return await this.Load(params, provider, forceRefresh, contextUser);
    }

    /**
     * After all entities are loaded, wire up cross-references so callers
     * can navigate the object graph without extra lookups.
     */
    protected override async AdditionalLoading(contextUser?: UserInfo): Promise<void> {
        // Nothing to wire up yet — the getter helpers below handle
        // filtering on-demand. If we add extended entity classes with
        // child arrays (like AIEngineBase does with agent.Actions), we
        // would populate them here.
    }

    // ── Public Accessors ──────────────────────────────────────────────

    /** All Integration definitions (e.g. YourMembership, HubSpot). */
    public get Integrations(): MJIntegrationEntity[] {
        return this._integrations;
    }

    /** All Integration Source Type definitions. */
    public get SourceTypes(): MJIntegrationSourceTypeEntity[] {
        return this._sourceTypes;
    }

    /** All CompanyIntegration records (company + integration + credentials). */
    public get CompanyIntegrations(): MJCompanyIntegrationEntity[] {
        return this._companyIntegrations;
    }

    /** All entity-level mapping configurations. */
    public get EntityMaps(): MJCompanyIntegrationEntityMapEntity[] {
        return this._entityMaps;
    }

    /** All field-level mapping configurations. */
    public get FieldMaps(): MJCompanyIntegrationFieldMapEntity[] {
        return this._fieldMaps;
    }

    /** All sync watermark records. */
    public get Watermarks(): MJCompanyIntegrationSyncWatermarkEntity[] {
        return this._watermarks;
    }

    // ── Convenience Lookup Methods ────────────────────────────────────

    /** Get a specific Integration by ID. */
    public GetIntegrationByID(integrationID: string): MJIntegrationEntity | undefined {
        return this._integrations.find(i => UUIDsEqual(i.ID, integrationID));
    }

    /** Get a specific Integration by name (case-insensitive). */
    public GetIntegrationByName(name: string): MJIntegrationEntity | undefined {
        const lower = name.trim().toLowerCase();
        return this._integrations.find(i => i.Name.trim().toLowerCase() === lower);
    }

    /** Get a specific CompanyIntegration by ID. */
    public GetCompanyIntegrationByID(companyIntegrationID: string): MJCompanyIntegrationEntity | undefined {
        return this._companyIntegrations.find(ci => UUIDsEqual(ci.ID, companyIntegrationID));
    }

    /** Get all CompanyIntegrations for a given Integration ID. */
    public GetCompanyIntegrationsByIntegrationID(integrationID: string): MJCompanyIntegrationEntity[] {
        return this._companyIntegrations.filter(ci => UUIDsEqual(ci.IntegrationID, integrationID));
    }

    /** Get all entity maps for a given CompanyIntegration ID. */
    public GetEntityMapsForCompanyIntegration(companyIntegrationID: string): MJCompanyIntegrationEntityMapEntity[] {
        return this._entityMaps.filter(em => UUIDsEqual(em.CompanyIntegrationID, companyIntegrationID));
    }

    /** Get all field maps for a given EntityMap ID. */
    public GetFieldMapsForEntityMap(entityMapID: string): MJCompanyIntegrationFieldMapEntity[] {
        return this._fieldMaps.filter(fm => UUIDsEqual(fm.EntityMapID, entityMapID));
    }

    /** Get the watermark for a given EntityMap ID and direction. */
    public GetWatermark(entityMapID: string, direction: 'Pull' | 'Push'): MJCompanyIntegrationSyncWatermarkEntity | undefined {
        return this._watermarks.find(
            w => UUIDsEqual(w.EntityMapID, entityMapID) && w.Direction === direction
        );
    }

    /** Get all enabled entity maps for a CompanyIntegration, sorted by Priority. */
    public GetEnabledEntityMaps(companyIntegrationID: string): MJCompanyIntegrationEntityMapEntity[] {
        return this.GetEntityMapsForCompanyIntegration(companyIntegrationID)
            .filter(em => em.SyncEnabled && em.Status === 'Active')
            .sort((a, b) => a.Priority - b.Priority);
    }

    /**
     * Get the Integration record associated with a CompanyIntegration.
     * Useful for resolving the connector class name, etc.
     */
    public GetIntegrationForCompanyIntegration(companyIntegrationID: string): MJIntegrationEntity | undefined {
        const ci = this.GetCompanyIntegrationByID(companyIntegrationID);
        if (!ci) return undefined;
        return this.GetIntegrationByID(ci.IntegrationID);
    }

    // ── Singleton ─────────────────────────────────────────────────────

    public static get Instance(): IntegrationEngineBase {
        return super.getInstance<IntegrationEngineBase>();
    }
}
