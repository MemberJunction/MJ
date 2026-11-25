/**
 * @fileoverview How the content pipeline reads a setting from a source's configuration layers, in one precedence order
 * everywhere (Extract, Discover drivers, access, tuning):
 * 1. the run's `Configuration` (a Record Process run's options);
 * 2. the Content Source's `Configuration`;
 * 3. the source's settings (`Configuration.SourceSpecificConfiguration`);
 * 4. the Content Source Type's `Configuration`.
 * A setting comes from the first layer that sets it (not null, undefined or a blank string: a form that saves an empty
 * field leaves the setting to the layers below); an object is taken whole from that layer.
 *
 * @module @memberjunction/content-pipeline-base
 */

import { IsPlainObject } from '@memberjunction/global';
import { IsSetValue, ResolvedPipelineTuning, ResolveTuning } from './PipelineTuning.js';

/** A source's configuration layers; see the file header for their order. */
export interface SourceConfigurationLayers {
    /** The run's `Configuration`. */
    Run?: Readonly<Record<string, unknown>>;
    /** The Content Source's `Configuration`. */
    Source?: Readonly<Record<string, unknown>>;
    /** The source's settings (`SourceSpecificConfiguration`). */
    Settings?: Readonly<Record<string, unknown>>;
    /** The Content Source Type's `Configuration`. */
    Type?: Readonly<Record<string, unknown>>;
}

/** The layers in precedence order. */
function Ordered(layers: SourceConfigurationLayers): Readonly<Record<string, unknown>>[] {
    return [layers.Run, layers.Source, layers.Settings, layers.Type].filter((l): l is Readonly<Record<string, unknown>> => !!l);
}

/** The value at `path` (e.g. `['Website', 'UserAgent']`) in the first layer that sets it, else undefined. */
export function ConfiguredPath(layers: SourceConfigurationLayers, path: readonly string[]): unknown {
    for (const layer of Ordered(layers)) {
        let value: unknown = layer;
        for (const key of path) {
            value = IsPlainObject(value) && Object.hasOwn(value as object, key) ? (value as Record<string, unknown>)[key] : undefined;
        }
        if (IsSetValue(value)) {
            return value;
        }
    }
    return undefined;
}

/** A top-level setting from the first layer that sets it. */
export function ConfiguredValue(layers: SourceConfigurationLayers, key: string): unknown {
    return ConfiguredPath(layers, [key]);
}

/** A `Website.<key>` setting from the first layer whose `Website` sets it. */
export function WebsiteValue(layers: SourceConfigurationLayers, key: string): unknown {
    return ConfiguredPath(layers, ['Website', key]);
}

/** The `Website` settings across the layers, as one object: each key from the first layer that sets it. */
export function MergedWebsiteConfiguration(layers: SourceConfigurationLayers): Record<string, unknown> {
    const keys = new Set(Ordered(layers).flatMap((layer) => (IsPlainObject(layer.Website) ? Object.keys(layer.Website as object) : [])));
    return Object.fromEntries([...keys].map((key) => [key, WebsiteValue(layers, key)]).filter(([, value]) => value !== undefined));
}

/** `Tuning` resolved across the layers in the same order, key by key (`ResolveTuning` takes them lowest first; a null or blank value falls through). */
export function TuningFor(layers: SourceConfigurationLayers): ResolvedPipelineTuning {
    return ResolveTuning(layers.Type, layers.Settings, layers.Source, layers.Run);
}

/** A resolved source's layers (its `Configuration`, settings and type configuration) under a run's `Configuration`. */
export function SourceLayers(
    resolved: { Configuration: Readonly<Record<string, unknown>>; Settings: Readonly<Record<string, unknown>>; TypeConfiguration: Readonly<Record<string, unknown>> } | null | undefined,
    run?: Readonly<Record<string, unknown>>,
): SourceConfigurationLayers {
    return { Run: run, Source: resolved?.Configuration, Settings: resolved?.Settings, Type: resolved?.TypeConfiguration };
}

/** A Discover request's layers (the run's, the source's, its settings, the source type's). */
export function DiscoverConfigurationLayers(request: {
    Configuration: Readonly<Record<string, unknown>>;
    RunConfiguration?: Readonly<Record<string, unknown>>;
    TypeConfiguration?: Readonly<Record<string, unknown>>;
}): SourceConfigurationLayers {
    const settings = request.Configuration.SourceSpecificConfiguration;
    return {
        Run: request.RunConfiguration,
        Source: request.Configuration,
        Settings: IsPlainObject(settings) ? (settings as Record<string, unknown>) : undefined,
        Type: request.TypeConfiguration,
    };
}

/** A non-empty string (trimmed), else undefined. */
export function NonEmptyString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}
