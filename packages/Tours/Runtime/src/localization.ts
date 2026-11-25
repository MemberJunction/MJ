/**
 * @fileoverview Locale resolution helpers reading `Configuration.localizations[locale]`.
 * Fallback chain: exact BCP-47 tag (case-insensitive) -> primary language subtag -> base fields.
 * @module @memberjunction/tours-runtime
 */

import type {
    ILearningPathLocalizationEntry,
    ITourLocalizationEntry,
    ITourStepLocalizationEntry,
    ITourStepPathLocalizationEntry,
    LearningPathDefinition,
    TourDefinition,
    TourStepDefinition,
    TourStepPathDefinition,
} from './types';

function findLocaleEntry<T>(
    localizations: Record<string, T> | undefined,
    locale: string | undefined,
): T | undefined {
    if (!localizations || !locale) {
        return undefined;
    }
    const trimmed = locale.trim();
    if (!trimmed) {
        return undefined;
    }

    // 1. Exact match (or case-insensitive normalized match)
    if (Object.prototype.hasOwnProperty.call(localizations, trimmed)) {
        return localizations[trimmed];
    }
    const lowerTarget = trimmed.toLowerCase();
    const entries = Object.entries(localizations);
    for (const [key, value] of entries) {
        if (key.trim().toLowerCase() === lowerTarget) {
            return value;
        }
    }

    // 2. Primary language subtag fallback (e.g. "es-MX" -> "es")
    const primary = lowerTarget.split('-')[0];
    if (primary && primary !== lowerTarget) {
        for (const [key, value] of entries) {
            if (key.trim().toLowerCase() === primary) {
                return value;
            }
        }
    }

    return undefined;
}

export interface LocalizedTourCopy {
    Name: string;
    Description: string;
}

export function ResolveLocalizedTourCopy(
    tour: Pick<TourDefinition, 'Name' | 'Description' | 'Configuration'>,
    locale?: string,
): LocalizedTourCopy {
    const entry: ITourLocalizationEntry | undefined = findLocaleEntry(
        tour.Configuration?.localizations,
        locale,
    );
    return {
        Name: entry?.Name ?? tour.Name,
        Description: entry?.Description ?? tour.Description ?? '',
    };
}

export interface LocalizedStepCopy {
    Title: string;
    Body: string;
    NextButtonText?: string;
    BackButtonText?: string;
    DismissButtonText?: string;
    ChoiceOptions?: Record<string, { Label?: string; Description?: string; Feedback?: string }>;
    GuideNotes?: string;
    VoiceScript?: string;
}

export function ResolveLocalizedStepCopy(
    step: Pick<TourStepDefinition, 'Title' | 'Body' | 'Configuration' | 'GuideNotes' | 'VoiceScript'>,
    locale?: string,
): LocalizedStepCopy {
    const entry: ITourStepLocalizationEntry | undefined = findLocaleEntry(
        step.Configuration?.localizations,
        locale,
    );
    const config = step.Configuration ?? {};
    const nextButtonText = typeof config['NextButtonText'] === 'string' ? config['NextButtonText'] : undefined;
    const backButtonText = typeof config['BackButtonText'] === 'string' ? config['BackButtonText'] : undefined;
    const dismissButtonText = typeof config['DismissButtonText'] === 'string' ? config['DismissButtonText'] : undefined;

    return {
        Title: entry?.Title ?? step.Title,
        Body: entry?.Body ?? step.Body ?? '',
        NextButtonText: entry?.NextButtonText ?? nextButtonText,
        BackButtonText: entry?.BackButtonText ?? backButtonText,
        DismissButtonText: entry?.DismissButtonText ?? dismissButtonText,
        ChoiceOptions: entry?.ChoiceOptions,
        GuideNotes: entry?.GuideNotes ?? step.GuideNotes,
        VoiceScript: entry?.VoiceScript ?? step.VoiceScript,
    };
}

export interface LocalizedPathCopy {
    Label: string;
}

export function ResolveLocalizedPathCopy(
    path: Pick<TourStepPathDefinition, 'Label' | 'Configuration'>,
    locale?: string,
): LocalizedPathCopy {
    const entry: ITourStepPathLocalizationEntry | undefined = findLocaleEntry(
        path.Configuration?.localizations,
        locale,
    );
    return {
        Label: entry?.Label ?? path.Label ?? '',
    };
}

export interface LocalizedLearningPathCopy {
    Name: string;
    Description: string;
}

export function ResolveLocalizedLearningPathCopy(
    learningPath: Pick<LearningPathDefinition, 'Name' | 'Description' | 'Configuration'>,
    locale?: string,
): LocalizedLearningPathCopy {
    const entry: ILearningPathLocalizationEntry | undefined = findLocaleEntry(
        learningPath.Configuration?.localizations,
        locale,
    );
    return {
        Name: entry?.Name ?? learningPath.Name,
        Description: entry?.Description ?? learningPath.Description ?? '',
    };
}
