import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, LogError, UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import type { Observable } from 'rxjs';
import { MJBrandKitAssetEntity, MJBrandKitEntity } from '../generated/entity_subclasses';

/**
 * Resolved media-generation permissions and guardrails for a brand kit, with
 * defaults applied and malformed or non-boolean values failing closed.
 */
export interface EffectiveBrandGenerationPolicy {
    AllowGeneratedImages: boolean;
    AllowGeneratedVideo: boolean;
    AllowSyntheticPeople: boolean;
    AvoidSubjects: string[];
    StylePrompt?: string;
    MaxGenerationCostPerRun?: number;
}

/**
 * Default media-generation policy when no brand kit is selected or `GenerationPolicy` is NULL:
 * generated images and video are allowed, synthetic people are disallowed (§3.4 + D20),
 * and no subjects, style prompt, or spend cap are set.
 */
export const DEFAULT_BRAND_GENERATION_POLICY: Readonly<EffectiveBrandGenerationPolicy> = Object.freeze({
    AllowGeneratedImages: true,
    AllowGeneratedVideo: true,
    AllowSyntheticPeople: false,
    AvoidSubjects: [],
});

/**
 * Caches `MJ: Brand Kits` and `MJ: Brand Kit Assets` across both browser and server
 * tiers, providing company-aware kit lookup, default-kit resolution, asset ordering,
 * generation-reference filtering, and fail-closed generation policy evaluation.
 */
export class BrandKitEngine extends BaseEngine<BrandKitEngine> {
    public static get Instance(): BrandKitEngine {
        return super.getInstance<BrandKitEngine>();
    }

    private _brandKits: MJBrandKitEntity[] = [];
    private _brandKitAssets: MJBrandKitAssetEntity[] = [];

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        const configs: Partial<BaseEnginePropertyConfig>[] = [
            {
                Type: 'entity',
                EntityName: 'MJ: Brand Kits',
                PropertyName: '_brandKits',
                CacheLocal: true,
            },
            {
                Type: 'entity',
                EntityName: 'MJ: Brand Kit Assets',
                PropertyName: '_brandKitAssets',
                CacheLocal: true,
            },
        ];
        await this.Load(configs, provider, forceRefresh, contextUser);
    }

    public get BrandKits(): MJBrandKitEntity[] {
        return this.GetConfigData<MJBrandKitEntity>('_brandKits');
    }

    public get BrandKitAssets(): MJBrandKitAssetEntity[] {
        return this.GetConfigData<MJBrandKitAssetEntity>('_brandKitAssets');
    }

    public get BrandKits$(): Observable<MJBrandKitEntity[]> {
        return this.ObserveProperty<MJBrandKitEntity>('_brandKits');
    }

    public get BrandKitAssets$(): Observable<MJBrandKitAssetEntity[]> {
        return this.ObserveProperty<MJBrandKitAssetEntity>('_brandKitAssets');
    }

    /**
     * Returns `Active` brand kits whose `CompanyID` is NULL or matches `companyId`
     * (case-insensitive via `UUIDsEqual`), ordered with the company's own kits first,
     * then alphabetically by `Name`.
     */
    public GetKitsForCompany(companyId: string | null): MJBrandKitEntity[] {
        const hasCompany = companyId != null && companyId.trim().length > 0;
        return this.BrandKits
            .filter(k => {
                if (k.Status !== 'Active') {
                    return false;
                }
                if (k.CompanyID == null) {
                    return true;
                }
                return hasCompany && UUIDsEqual(k.CompanyID, companyId);
            })
            .sort((a, b) => {
                const aIsCompany = hasCompany && a.CompanyID != null && UUIDsEqual(a.CompanyID, companyId);
                const bIsCompany = hasCompany && b.CompanyID != null && UUIDsEqual(b.CompanyID, companyId);
                if (aIsCompany !== bIsCompany) {
                    return aIsCompany ? -1 : 1;
                }
                return (a.Name ?? '').localeCompare(b.Name ?? '');
            });
    }

    /**
     * Returns the company's `Active` default brand kit when `companyId` is provided and
     * one exists; otherwise falls back to the org-wide (`CompanyID == null`) `Active`
     * default brand kit, or `null` when none exists.
     */
    public GetDefaultKit(companyId: string | null): MJBrandKitEntity | null {
        const activeDefaults = this.BrandKits.filter(k => k.Status === 'Active' && k.IsDefault === true);
        if (companyId != null && companyId.trim().length > 0) {
            const companyDefault = activeDefaults.find(k => k.CompanyID != null && UUIDsEqual(k.CompanyID, companyId));
            if (companyDefault) {
                return companyDefault;
            }
        }
        return activeDefaults.find(k => k.CompanyID == null) ?? null;
    }

    /**
     * Returns all cached assets for `brandKitId`, ordered by `Sequence` ascending, then `Name`.
     */
    public GetAssets(brandKitId: string): MJBrandKitAssetEntity[] {
        if (!brandKitId) {
            return [];
        }
        return this.BrandKitAssets
            .filter(a => UUIDsEqual(a.BrandKitID, brandKitId))
            .sort((a, b) => {
                const seqDiff = (a.Sequence ?? 0) - (b.Sequence ?? 0);
                if (seqDiff !== 0) {
                    return seqDiff;
                }
                return (a.Name ?? '').localeCompare(b.Name ?? '');
            });
    }

    /**
     * Returns cached assets for `brandKitId` that have `IsGenerationReference` set,
     * ordered by `Sequence` ascending, then `Name`.
     *
     * These are the only kit files that may be sent to a generation vendor (§13.3).
     */
    public GetGenerationReferenceAssets(brandKitId: string): MJBrandKitAssetEntity[] {
        return this.GetAssets(brandKitId).filter(a => a.IsGenerationReference === true);
    }

    /**
     * Resolves the effective generation policy for `kit`:
     * - When `kit` is `null` or its `GenerationPolicy` is `NULL`, returns the defaults
     *   (`AllowGeneratedImages: true`, `AllowGeneratedVideo: true`, `AllowSyntheticPeople: false`,
     *   `AvoidSubjects: []`).
     * - Otherwise each boolean is the stored value when it is a boolean, the default when
     *   missing (`undefined`), and `false` when it is anything else.
     * - `AvoidSubjects` retains only string entries; `StylePrompt` is included only if a string;
     *   `MaxGenerationCostPerRun` is included only if a finite number ≥ 0.
     * - **Fails closed:** if `GenerationPolicyObject` throws (malformed JSON) or is not a plain
     *   object, logs once via `LogError` and returns everything disallowed (all three booleans `false`).
     *   Never throws.
     */
    public GetEffectiveGenerationPolicy(kit: MJBrandKitEntity | null): EffectiveBrandGenerationPolicy {
        if (!kit) {
            return BrandKitEngine.cloneDefaultPolicy();
        }

        let raw: unknown;
        try {
            const kitRecord = kit as unknown as {
                GenerationPolicyObject?: unknown;
                GenerationPolicy?: string | null;
            };
            if ('GenerationPolicyObject' in kit) {
                raw = kitRecord.GenerationPolicyObject;
            } else if (kitRecord.GenerationPolicy == null) {
                raw = null;
            } else {
                raw = JSON.parse(kitRecord.GenerationPolicy);
            }
        } catch (err) {
            LogError(
                `[BrandKitEngine] Failed to read GenerationPolicy for brand kit "${kit.Name ?? kit.ID}": ${err instanceof Error ? err.message : String(err)}`
            );
            return BrandKitEngine.failClosedPolicy();
        }

        if (raw === null || raw === undefined) {
            return BrandKitEngine.cloneDefaultPolicy();
        }

        if (typeof raw !== 'object' || Array.isArray(raw)) {
            LogError(
                `[BrandKitEngine] GenerationPolicy for brand kit "${kit.Name ?? kit.ID}" is not a JSON object; failing closed.`
            );
            return BrandKitEngine.failClosedPolicy();
        }

        const policyObj = raw as Record<string, unknown>;
        const effective: EffectiveBrandGenerationPolicy = {
            AllowGeneratedImages: BrandKitEngine.resolveBoolean(
                policyObj,
                'AllowGeneratedImages',
                DEFAULT_BRAND_GENERATION_POLICY.AllowGeneratedImages
            ),
            AllowGeneratedVideo: BrandKitEngine.resolveBoolean(
                policyObj,
                'AllowGeneratedVideo',
                DEFAULT_BRAND_GENERATION_POLICY.AllowGeneratedVideo
            ),
            AllowSyntheticPeople: BrandKitEngine.resolveBoolean(
                policyObj,
                'AllowSyntheticPeople',
                DEFAULT_BRAND_GENERATION_POLICY.AllowSyntheticPeople
            ),
            AvoidSubjects: Array.isArray(policyObj.AvoidSubjects)
                ? policyObj.AvoidSubjects.filter((item): item is string => typeof item === 'string')
                : [],
        };

        if (typeof policyObj.StylePrompt === 'string') {
            effective.StylePrompt = policyObj.StylePrompt;
        }
        if (
            typeof policyObj.MaxGenerationCostPerRun === 'number' &&
            Number.isFinite(policyObj.MaxGenerationCostPerRun) &&
            policyObj.MaxGenerationCostPerRun >= 0
        ) {
            effective.MaxGenerationCostPerRun = policyObj.MaxGenerationCostPerRun;
        }

        return effective;
    }

    private static resolveBoolean(
        obj: Record<string, unknown>,
        key: string,
        defaultValue: boolean
    ): boolean {
        if (!(key in obj) || obj[key] === undefined) {
            return defaultValue;
        }
        const val = obj[key];
        return typeof val === 'boolean' ? val : false;
    }

    private static cloneDefaultPolicy(): EffectiveBrandGenerationPolicy {
        return {
            AllowGeneratedImages: DEFAULT_BRAND_GENERATION_POLICY.AllowGeneratedImages,
            AllowGeneratedVideo: DEFAULT_BRAND_GENERATION_POLICY.AllowGeneratedVideo,
            AllowSyntheticPeople: DEFAULT_BRAND_GENERATION_POLICY.AllowSyntheticPeople,
            AvoidSubjects: [],
        };
    }

    private static failClosedPolicy(): EffectiveBrandGenerationPolicy {
        return {
            AllowGeneratedImages: false,
            AllowGeneratedVideo: false,
            AllowSyntheticPeople: false,
            AvoidSubjects: [],
        };
    }
}
