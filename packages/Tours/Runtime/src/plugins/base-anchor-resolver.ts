/**
 * @fileoverview Abstract logic base class for anchor resolvers (`BaseTourAnchorResolver`)
 * and `{{Context...}}` template interpolation helper.
 * @module @memberjunction/tours-runtime
 */

import { RequiresSubclass } from '@memberjunction/global';
import type { TourCapabilityRequirement } from '../host-contracts';
import type {
    ITourAnchor,
    TourAnchorResolution,
    TourValidationIssue,
    TourValidationResult,
} from '../types';
import type { TourAnchorPlan } from './plugin-types';
import {
    ExtractDoubleBraceTokens,
    InterpolateDoubleBraceString,
    StripContextPrefix,
} from './template-utils';

/**
 * Interpolates `{{Context...}}` template placeholders in an anchor descriptor
 * (e.g. `"Entity": "{{Context.Record.EntityName}}"`).
 */
export function InterpolateAnchorTemplate(
    anchor: ITourAnchor,
    context: Record<string, unknown>,
): ITourAnchor {
    const resolveStr = (val?: string): string | undefined => {
        if (!val || !val.includes('{{')) {
            return val;
        }
        return InterpolateDoubleBraceString(val, (rawPath) => {
            const path = StripContextPrefix(rawPath);
            const value = readNestedPath(context, path) ?? readNestedPath(context, rawPath);
            return value == null ? '' : String(value);
        });
    };

    return {
        ...anchor,
        Key: resolveStr(anchor.Key),
        Entity: resolveStr(anchor.Entity),
        Field: resolveStr(anchor.Field),
        SectionKey: resolveStr(anchor.SectionKey),
        RailKey: resolveStr(anchor.RailKey),
        ActionKey: resolveStr(anchor.ActionKey),
        NavItemKey: resolveStr(anchor.NavItemKey),
        DriverClass: resolveStr(anchor.DriverClass),
        PageId: resolveStr(anchor.PageId),
        ColumnKey: resolveStr(anchor.ColumnKey),
        AppName: resolveStr(anchor.AppName),
        Role: resolveStr(anchor.Role),
        Name: resolveStr(anchor.Name),
        Selector: resolveStr(anchor.Selector),
        Fallbacks: anchor.Fallbacks?.map((fb) => InterpolateAnchorTemplate(fb, context)),
    };
}

function readNestedPath(obj: Record<string, unknown>, dottedPath: string): unknown {
    const parts = dottedPath.split('.');
    let current: unknown = obj;
    for (const part of parts) {
        if (current != null && typeof current === 'object') {
            const rec = current as Record<string, unknown>;
            if (part in rec) {
                current = rec[part];
                continue;
            }
            // Case-insensitive lookup fallback (e.g. Context.Record.EntityName vs record.EntityName)
            const lower = part.toLowerCase();
            const matchedKey = Object.keys(rec).find((k) => k.toLowerCase() === lower);
            if (matchedKey) {
                current = rec[matchedKey];
                continue;
            }
        }
        return undefined;
    }
    return current;
}

/** Extracts unresolved `{{...}}` template variables from a resolved anchor. */
export function FindUnresolvedTemplateVariables(anchor: ITourAnchor): string[] {
    const missing: string[] = [];
    const fields = [
        anchor.Key,
        anchor.Entity,
        anchor.Field,
        anchor.SectionKey,
        anchor.RailKey,
        anchor.ActionKey,
        anchor.NavItemKey,
        anchor.DriverClass,
        anchor.PageId,
        anchor.ColumnKey,
        anchor.AppName,
        anchor.Role,
        anchor.Name,
        anchor.Selector,
    ];
    for (const val of fields) {
        if (!val) {
            continue;
        }
        missing.push(...ExtractDoubleBraceTokens(val));
    }
    return missing;
}

/**
 * Logic half of an anchor resolver (`ITourAnchor.Strategy`).
 * Validates anchor descriptors and builds resolution plans without touching DOM globals.
 */
@RequiresSubclass()
export abstract class BaseTourAnchorResolver {
    public readonly RequiredCapabilities?: TourCapabilityRequirement;
    public abstract readonly ResolutionRung: TourAnchorResolution;

    public abstract ValidateAnchor(anchor: ITourAnchor): TourValidationResult;

    public BuildPlan(anchor: ITourAnchor, context: Record<string, unknown> = {}): TourAnchorPlan {
        const interpolated = InterpolateAnchorTemplate(anchor, context);
        return {
            Strategy: interpolated.Strategy,
            SelectorHints: this.GetSelectorHints(interpolated),
            RequiresContextResolution: hasTemplates(anchor),
            MissingTemplateVariables: FindUnresolvedTemplateVariables(interpolated),
        };
    }

    protected GetSelectorHints(_anchor: ITourAnchor): string[] {
        return [];
    }

    protected buildResult(
        errors: TourValidationIssue[],
        warnings: TourValidationIssue[] = [],
    ): TourValidationResult {
        return {
            Valid: errors.length === 0,
            Errors: errors,
            Warnings: warnings,
        };
    }
}

function hasTemplates(anchor: ITourAnchor): boolean {
    return Object.values(anchor).some((v) => typeof v === 'string' && v.includes('{{'));
}
