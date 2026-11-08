/**
 * @fileoverview Zod validation schema for `mj-extension-brand.json` White-Label Brand Profiles.
 */

import { z } from 'zod';
import type { ExtensionBrandProfile } from '@memberjunction/browser-extension-core';

const HexColorRegex = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const SemverRegex = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/**
 * Zod schema validating a white-label `mj-extension-brand.json` profile.
 */
export const ExtensionBrandProfileSchema = z.object({
    BrandSlug: z
        .string()
        .min(2)
        .max(40)
        .regex(/^[a-z0-9-]+$/, 'BrandSlug must be lowercase alphanumeric with hyphens'),
    BrandName: z
        .string()
        .min(2)
        .max(45, 'Chrome Web Store requires BrandName to be at most 45 characters'),
    ShortName: z
        .string()
        .min(2)
        .max(12, 'Chrome Web Store requires ShortName to be at most 12 characters'),
    Version: z
        .string()
        .regex(SemverRegex, 'Version must be a valid semantic version (e.g. 6.2.0)'),
    Description: z
        .string()
        .min(10)
        .max(132, 'Chrome Web Store requires Description to be at most 132 characters'),
    AssistantDisplayName: z.string().min(1).max(32),
    Tagline: z.string().min(2).max(96),
    DefaultControlBackend: z.enum(['content-script', 'debugger-cdp', 'auto']),
    IncludeDebuggerPermission: z.boolean(),
    HostPermissions: z.array(z.string().min(1)).min(1),
    ExternallyConnectableMatches: z.array(z.string().min(1)).min(1),
    BlockedDomains: z.array(z.string()),
    ThemeSeeds: z.object({
        primary: z.string().regex(HexColorRegex, 'primary seed must be a valid hex color (#RRGGBB)'),
        accent: z
            .string()
            .regex(HexColorRegex, 'accent seed must be a valid hex color (#RRGGBB)')
            .optional(),
        tertiary: z
            .string()
            .regex(HexColorRegex, 'tertiary seed must be a valid hex color (#RRGGBB)')
            .optional(),
        neutralChroma: z.number().min(0).max(1).optional(),
        vibrancy: z.number().min(0.5).max(2).optional(),
        radius: z.number().min(0).max(24).optional(),
        depth: z.number().min(0).max(3).optional(),
        fontFamily: z.string().optional(),
        fontFamilyMono: z.string().optional(),
    }),
    Icons: z.object({
        Icon16: z.string().min(1),
        Icon32: z.string().min(1),
        Icon48: z.string().min(1),
        Icon128: z.string().min(1),
    }),
    SuggestedPrompts: z.array(z.string()).optional(),
});

/**
 * Validate an unknown JSON payload against {@link ExtensionBrandProfileSchema} and return
 * the strongly-typed {@link ExtensionBrandProfile}.
 */
export function ValidateExtensionBrandProfile(input: unknown): ExtensionBrandProfile {
    return ExtensionBrandProfileSchema.parse(input) as ExtensionBrandProfile;
}
