import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import type { Observable } from 'rxjs';
import { MJVideoArchetypeEntity } from '../generated/entity_subclasses';
import { BrandKitEngine } from './BrandKitEngine';

/**
 * Caches `MJ: Video Archetypes` across browser and server tiers and coordinates
 * `BrandKitEngine.Instance.Config(...)` so configuring `VideoStudioEngine` warms
 * both archetypes and brand kits. Callers read brand kits directly from `BrandKitEngine`.
 */
export class VideoStudioEngine extends BaseEngine<VideoStudioEngine> {
    public static get Instance(): VideoStudioEngine {
        return super.getInstance<VideoStudioEngine>();
    }

    private _archetypes: MJVideoArchetypeEntity[] = [];

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        const configs: Partial<BaseEnginePropertyConfig>[] = [
            {
                Type: 'entity',
                EntityName: 'MJ: Video Archetypes',
                PropertyName: '_archetypes',
                CacheLocal: true,
            },
        ];
        await Promise.all([
            this.Load(configs, provider, forceRefresh, contextUser),
            BrandKitEngine.Instance.Config(forceRefresh, contextUser, provider),
        ]);
    }

    public get Archetypes(): MJVideoArchetypeEntity[] {
        return this.GetConfigData<MJVideoArchetypeEntity>('_archetypes');
    }

    public get Archetypes$(): Observable<MJVideoArchetypeEntity[]> {
        return this.ObserveProperty<MJVideoArchetypeEntity>('_archetypes');
    }

    /**
     * Returns `Active` archetypes available to `companyId` (org-wide `CompanyID == null`
     * plus the company's own archetypes). When a company archetype has the same `Name`
     * (trimmed, case-insensitive) as an org-wide archetype, the company archetype replaces
     * the org-wide one. Results are sorted alphabetically by `Name`.
     */
    public GetArchetypesForCompany(companyId: string | null): MJVideoArchetypeEntity[] {
        const hasCompany = companyId != null && companyId.trim().length > 0;
        const byNormalizedName = new Map<string, MJVideoArchetypeEntity>();

        for (const archetype of this.Archetypes) {
            if (archetype.Status !== 'Active') {
                continue;
            }
            const isOrgWide = archetype.CompanyID == null;
            const isCompanyMatch = hasCompany && archetype.CompanyID != null && UUIDsEqual(archetype.CompanyID, companyId);
            if (!isOrgWide && !isCompanyMatch) {
                continue;
            }

            const key = (archetype.Name ?? '').trim().toLowerCase();
            const existing = byNormalizedName.get(key);
            if (!existing || isCompanyMatch) {
                byNormalizedName.set(key, archetype);
            }
        }

        return Array.from(byNormalizedName.values()).sort((a, b) =>
            (a.Name ?? '').trim().localeCompare((b.Name ?? '').trim())
        );
    }

    /**
     * Looks up an `Active` archetype for `companyId` by `Name` (trimmed, case-insensitive)
     * from {@link GetArchetypesForCompany}, returning `null` when none matches.
     */
    public GetArchetypeByName(name: string, companyId: string | null): MJVideoArchetypeEntity | null {
        const normalized = name?.trim().toLowerCase();
        if (!normalized) {
            return null;
        }
        return (
            this.GetArchetypesForCompany(companyId).find(
                a => (a.Name ?? '').trim().toLowerCase() === normalized
            ) ?? null
        );
    }
}
