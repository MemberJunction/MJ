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
 * Finds the active `MJBrandKitEntity` referenced by `spec.BrandKitID` within the company scope.
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
    const scopedKits = engine.GetKitsForCompany(effectiveCompanyId) ?? [];
    return scopedKits.find((kit) => kit && UUIDsEqual(kit.ID, brandKitId)) ?? null;
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

    const basePolicy: EffectiveBrandGenerationPolicy = engine.GetEffectiveGenerationPolicy(kit);
    const neverInvent = mergeNeverInvent(spec.Assets?.NeverInvent, readKitNeverInvent(kit));
    const referenceAssets = kit ? (engine.GetGenerationReferenceAssets(kit.ID) ?? []) : [];

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
    return (kit?.NeverInventObject ?? []).filter(
        (entry): entry is string => typeof entry === 'string',
    );
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
