/**
 * @fileoverview Brand kit generation policy and reference-asset resolution for Video Studio
 * Pre-Production (`VS-GEN-6`, Plan §3.4, §13.3).
 *
 * Reads `BrandKitEngine.Instance.GetEffectiveGenerationPolicy(kit)` when `spec.BrandKitID` is set
 * and falls back to the platform defaults (`AllowGeneratedImages: true`, `AllowGeneratedVideo: true`,
 * `AllowSyntheticPeople: false`, `AvoidSubjects: []`) when no brand kit is selected or its
 * `GenerationPolicy` is `NULL`.
 *
 * @module @memberjunction/video-studio
 */

import {
    BrandKitEngine,
    DEFAULT_BRAND_GENERATION_POLICY,
    type EffectiveBrandGenerationPolicy,
    type MJBrandKitAssetEntity,
    type MJBrandKitEntity,
} from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import type { VideoGenerationSpec } from '@memberjunction/video-studio-core';

/**
 * Effective media-generation policy applied during Pre-Production screening (`VS-GEN-6`).
 */
export interface ResolvedGenerationPolicy extends EffectiveBrandGenerationPolicy {
    /** Deduplicated union of `spec.Assets.NeverInvent` and `kit.NeverInventObject`. */
    NeverInvent: string[];
    /** Brand-kit assets marked `IsGenerationReference = true` for `spec.BrandKitID`. */
    ReferenceAssets: MJBrandKitAssetEntity[];
}

/**
 * Finds the active `MJBrandKitEntity` referenced by `spec.BrandKitID` within the company scope
 * (falling back to the cached `BrandKits` list when `GetKitsForCompany` is not populated in a test stub).
 */
export function FindBrandKitForSpec(
    spec: Partial<Pick<VideoGenerationSpec, 'BrandKitID' | 'CompanyID'>>,
    companyId?: string | null,
): MJBrandKitEntity | null {
    const brandKitId = spec.BrandKitID?.trim();
    if (!brandKitId) {
        return null;
    }

    const engine = BrandKitEngine.Instance;
    const effectiveCompanyId = companyId !== undefined ? companyId : (spec.CompanyID ?? null);
    const scopedKits =
        typeof engine.GetKitsForCompany === 'function'
            ? (engine.GetKitsForCompany(effectiveCompanyId) ?? [])
            : [];
    const fromScoped = scopedKits.find((kit) => kit && UUIDsEqual(kit.ID, brandKitId));
    if (fromScoped) {
        return fromScoped;
    }

    const allKits = Array.isArray(engine.BrandKits) ? engine.BrandKits : [];
    return (
        allKits.find(
            (kit) =>
                kit &&
                (kit.Status === 'Active' || kit.Status == null) &&
                UUIDsEqual(kit.ID, brandKitId) &&
                (kit.CompanyID == null ||
                    (effectiveCompanyId != null &&
                        effectiveCompanyId.trim().length > 0 &&
                        UUIDsEqual(kit.CompanyID, effectiveCompanyId))),
        ) ?? null
    );
}

/**
 * Resolves the effective generation policy for `spec` (`VS-GEN-6`).
 *
 * Finds the kit (`spec.BrandKitID`, through `BrandKitEngine.Instance`) and returns:
 * `{ ...GetEffectiveGenerationPolicy(kit), NeverInvent: spec.Assets.NeverInvent ∪ kit.NeverInventObject, ReferenceAssets: GetGenerationReferenceAssets(kit.ID) }`.
 */
export function ResolveGenerationPolicy(
    spec: Partial<Pick<VideoGenerationSpec, 'BrandKitID' | 'CompanyID' | 'Assets'>>,
    companyId?: string | null,
): ResolvedGenerationPolicy {
    const kit = FindBrandKitForSpec(spec, companyId);
    const engine = BrandKitEngine.Instance;

    const basePolicy: EffectiveBrandGenerationPolicy =
        typeof engine.GetEffectiveGenerationPolicy === 'function'
            ? engine.GetEffectiveGenerationPolicy(kit)
            : {
                  AllowGeneratedImages: DEFAULT_BRAND_GENERATION_POLICY.AllowGeneratedImages,
                  AllowGeneratedVideo: DEFAULT_BRAND_GENERATION_POLICY.AllowGeneratedVideo,
                  AllowSyntheticPeople: DEFAULT_BRAND_GENERATION_POLICY.AllowSyntheticPeople,
                  AvoidSubjects: [...DEFAULT_BRAND_GENERATION_POLICY.AvoidSubjects],
              };

    const neverInvent = mergeNeverInvent(spec.Assets?.NeverInvent, readKitNeverInvent(kit));
    const referenceAssets =
        kit && typeof engine.GetGenerationReferenceAssets === 'function'
            ? (engine.GetGenerationReferenceAssets(kit.ID) ?? [])
            : [];

    return {
        ...basePolicy,
        NeverInvent: neverInvent,
        ReferenceAssets: referenceAssets,
    };
}

/**
 * Returns the brand-kit assets marked `IsGenerationReference = true` for `spec.BrandKitID`.
 * Only these kit assets may be sent to an external image or video generator (§13.3).
 */
export function ResolveGenerationReferenceAssets(
    spec: Partial<Pick<VideoGenerationSpec, 'BrandKitID' | 'CompanyID' | 'Assets'>>,
    companyId?: string | null,
): MJBrandKitAssetEntity[] {
    return ResolveGenerationPolicy(spec, companyId).ReferenceAssets;
}

function readKitNeverInvent(kit: MJBrandKitEntity | null): string[] {
    if (!kit) {
        return [];
    }
    if (Array.isArray(kit.NeverInventObject)) {
        return kit.NeverInventObject.filter((entry): entry is string => typeof entry === 'string');
    }
    if (typeof kit.NeverInvent === 'string' && kit.NeverInvent.trim().length > 0) {
        try {
            const parsed: unknown = JSON.parse(kit.NeverInvent);
            if (Array.isArray(parsed)) {
                return parsed.filter((entry): entry is string => typeof entry === 'string');
            }
        } catch {
            // Ignore malformed JSON
        }
    }
    return [];
}

function mergeNeverInvent(
    specEntries: readonly string[] | undefined,
    kitEntries: readonly string[],
): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const raw of [...(specEntries ?? []), ...kitEntries]) {
        const trimmed = raw.trim();
        if (!trimmed) {
            continue;
        }
        const lower = trimmed.toLowerCase();
        if (!seen.has(lower)) {
            seen.add(lower);
            result.push(trimmed);
        }
    }
    return result;
}
