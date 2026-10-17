/**
 * @fileoverview Video Studio AI Configuration parameter parser and resolver (Plan §3.2, §6.2, VS-AGT-2).
 *
 * Reads the `VideoStudio.*` parameters defined in `metadata/ai-configurations/.video-studio-configurations.json`
 * (`Draft`, `Standard`, `High`) with safe fallback to the `Standard` preset defaults.
 *
 * @module @memberjunction/video-studio
 */

import { AIEngine } from '@memberjunction/aiengine';
import { LogError } from '@memberjunction/core';
import { VIDEO_RENDER_QUALITIES, type VideoRenderQuality } from '@memberjunction/video-studio-core';

/**
 * Format selection policy from `VideoStudio.Formats`.
 * `'First'` renders only `Deliverables.Formats[0]`; `'All'` renders every format in `Deliverables.Formats`.
 */
export type VideoStudioFormatSelection = 'First' | 'All';

/**
 * Resolved runtime settings for a `VideoStudioAgent` production run.
 */
export interface VideoStudioSettings {
    MaxRepairRounds: number;
    RenderQuality: VideoRenderQuality;
    Fps: number;
    Formats: VideoStudioFormatSelection;
    GenerationQuality: VideoRenderQuality;
    MaxGeneratedVideoSeconds: number;
    MaxRegenerations: number;
}

/**
 * Default settings matching the `Video Studio Standard` AI Configuration preset.
 */
export const DEFAULT_VIDEO_STUDIO_SETTINGS: Readonly<VideoStudioSettings> = Object.freeze({
    MaxRepairRounds: 2,
    RenderQuality: 'standard',
    Fps: 30,
    Formats: 'All',
    GenerationQuality: 'standard',
    MaxGeneratedVideoSeconds: 40,
    MaxRegenerations: 1,
});

function isRenderQuality(value: string): value is VideoRenderQuality {
    return (VIDEO_RENDER_QUALITIES as readonly string[]).includes(value);
}

function isFormatSelection(value: string): value is VideoStudioFormatSelection {
    return value === 'First' || value === 'All';
}

function warnInvalidSetting(message: string): void {
    console.warn(message);
    LogError(message);
}

function parseNonNegativeNumber(raw: string, paramName: string): number | null {
    const trimmed = raw.trim();
    if (!trimmed) {
        warnInvalidSetting(`[VideoStudioSettings] Invalid empty value for ${paramName}; keeping default.`);
        return null;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) {
        warnInvalidSetting(`[VideoStudioSettings] Invalid value "${raw}" for ${paramName} (expected number >= 0); keeping default.`);
        return null;
    }
    return parsed;
}

function parsePositiveNumber(raw: string, paramName: string): number | null {
    const trimmed = raw.trim();
    if (!trimmed) {
        warnInvalidSetting(`[VideoStudioSettings] Invalid empty value for ${paramName}; keeping default.`);
        return null;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        warnInvalidSetting(`[VideoStudioSettings] Invalid value "${raw}" for ${paramName} (expected number > 0); keeping default.`);
        return null;
    }
    return parsed;
}

/**
 * Pure parser that converts `MJ: AI Configuration Params` `{ Name, Value }` pairs into
 * a `VideoStudioSettings` object. Invalid values log an error and keep the Standard default.
 */
export function ParseVideoStudioSettings(
    params?: ReadonlyArray<{ Name: string; Value: string }> | null,
): VideoStudioSettings {
    const settings: VideoStudioSettings = { ...DEFAULT_VIDEO_STUDIO_SETTINGS };
    if (!Array.isArray(params)) {
        return settings;
    }

    for (const param of params) {
        if (!param || typeof param.Name !== 'string') {
            continue;
        }
        const name = param.Name.trim();
        const rawValue = typeof param.Value === 'string' ? param.Value : String(param.Value ?? '');

        switch (name) {
            case 'VideoStudio.MaxRepairRounds': {
                const n = parseNonNegativeNumber(rawValue, name);
                if (n !== null) {
                    settings.MaxRepairRounds = Math.floor(n);
                }
                break;
            }
            case 'VideoStudio.RenderQuality': {
                const trimmed = rawValue.trim();
                if (isRenderQuality(trimmed)) {
                    settings.RenderQuality = trimmed;
                } else {
                    warnInvalidSetting(
                        `[VideoStudioSettings] Invalid value "${rawValue}" for ${name} (expected draft | standard | high); keeping default.`,
                    );
                }
                break;
            }
            case 'VideoStudio.Fps': {
                const n = parsePositiveNumber(rawValue, name);
                if (n !== null) {
                    settings.Fps = Math.floor(n);
                }
                break;
            }
            case 'VideoStudio.Formats': {
                const trimmed = rawValue.trim();
                if (isFormatSelection(trimmed)) {
                    settings.Formats = trimmed;
                } else {
                    warnInvalidSetting(
                        `[VideoStudioSettings] Invalid value "${rawValue}" for ${name} (expected First | All); keeping default.`,
                    );
                }
                break;
            }
            case 'VideoStudio.GenerationQuality': {
                const trimmed = rawValue.trim();
                if (isRenderQuality(trimmed)) {
                    settings.GenerationQuality = trimmed;
                } else {
                    warnInvalidSetting(
                        `[VideoStudioSettings] Invalid value "${rawValue}" for ${name} (expected draft | standard | high); keeping default.`,
                    );
                }
                break;
            }
            case 'VideoStudio.MaxGeneratedVideoSeconds': {
                const n = parseNonNegativeNumber(rawValue, name);
                if (n !== null) {
                    settings.MaxGeneratedVideoSeconds = n;
                }
                break;
            }
            case 'VideoStudio.MaxRegenerations': {
                const n = parseNonNegativeNumber(rawValue, name);
                if (n !== null) {
                    settings.MaxRegenerations = Math.floor(n);
                }
                break;
            }
            default:
                break;
        }
    }

    return settings;
}

/**
 * Resolves `VideoStudioSettings` for an AI Configuration ID via
 * `AIEngine.Instance.GetConfigurationParamsWithInheritance(configurationId)`.
 * When `configurationId` is omitted or empty, returns the `Standard` defaults.
 */
export function ResolveVideoStudioSettings(configurationId?: string | null): VideoStudioSettings {
    const trimmed = typeof configurationId === 'string' ? configurationId.trim() : '';
    const engine = AIEngine.Instance as {
        GetConfigurationParamsWithInheritance?: (
            id: string,
        ) => Array<{ Name?: string; Value?: unknown }> | null | undefined;
    } | null | undefined;

    if (typeof engine?.GetConfigurationParamsWithInheritance !== 'function') {
        return { ...DEFAULT_VIDEO_STUDIO_SETTINGS };
    }

    try {
        const rawParams = engine.GetConfigurationParamsWithInheritance(trimmed) ?? [];
        if (!trimmed && rawParams.length === 0) {
            return { ...DEFAULT_VIDEO_STUDIO_SETTINGS };
        }
        const pairs = rawParams.map((p) => ({
            Name: String(p.Name ?? ''),
            Value: String(p.Value ?? ''),
        }));
        return ParseVideoStudioSettings(pairs);
    } catch (err: unknown) {
        if (trimmed) {
            const msg = err instanceof Error ? err.message : String(err);
            LogError(`[VideoStudioSettings] Failed to read configuration params for "${trimmed}": ${msg}`);
        }
        return { ...DEFAULT_VIDEO_STUDIO_SETTINGS };
    }
}
