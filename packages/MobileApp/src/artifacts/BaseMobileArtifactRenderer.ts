import type { ComponentType } from 'react';
import { MJGlobal } from '@memberjunction/global';

/**
 * @fileoverview How mobile decides which component renders an artifact.
 *
 * ## The contract, and why it matches the web's
 *
 * `ng-conversations` resolves artifact viewers through `MJGlobal.ClassFactory` over
 * `BaseArtifactViewerPluginComponent`: each plugin declares a static `CanHandle(typeName,
 * contentType)`, and the highest-priority match wins with the LAST registration breaking a tie.
 * This is the same contract with a React Native component on the other side — same inputs, same
 * ordering, same tie-break — so "which renderer handles a Data artifact" cannot be answered
 * differently on the two surfaces.
 *
 * It replaces a `classify()` heuristic that sniffed the type name and then the content, inventing a
 * `kind` the web has no concept of. Sniffing is a reasonable fallback and it remains as one, but it
 * is not a contract: an artifact type added to MJ metadata had no way to reach it.
 *
 * ## Registering
 *
 * ```ts
 * @RegisterClass(BaseMobileArtifactRenderer, 'Data')
 * export class DataArtifactRenderer extends BaseMobileArtifactRenderer {
 *     public static override CanHandle(typeName: string): boolean { return typeName === 'Data'; }
 *     public get Component() { return DataArtifactView; }
 * }
 * ```
 *
 * The registration key is the artifact TYPE NAME, which keeps `ResolveByTypeName` a direct lookup
 * for the common case; `CanHandle` exists for the rest (a content-type family such as `image/*`, or
 * a plugin that wants several types).
 */

/** What every renderer receives. */
export type MobileArtifactRendererProps = {
    /** The artifact's type name, e.g. `Data`, `Image`, `Markdown Document`. */
    TypeName: string;
    /** The version's MIME type, when the record carried one. */
    ContentType?: string | null;
    /** The raw version content. */
    Content: string;
    /** Display name, for renderers that title themselves. */
    Name?: string | null;
};

/**
 * Base class for a mobile artifact renderer.
 *
 * Subclasses register with `@RegisterClass(BaseMobileArtifactRenderer, '<Artifact Type Name>')` and
 * expose the component through {@link Component}.
 */
export abstract class BaseMobileArtifactRenderer {
    /**
     * Whether this renderer handles the given artifact.
     *
     * Static so resolution never constructs a renderer it will not use — the same reason the web
     * reads its contract off the constructor.
     *
     * @param _typeName The artifact type name.
     * @param _contentType The version MIME type, when known.
     */
    public static CanHandle(_typeName: string, _contentType?: string): boolean {
        return false;
    }

    /** The component that draws the artifact. */
    public abstract get Component(): ComponentType<MobileArtifactRendererProps>;
}

/**
 * Resolves the renderer for an artifact, or `null` when nothing claims it.
 *
 * Ordering mirrors the web's resolver: ascending priority with a `>=` comparison, so the highest
 * priority wins and a later registration at the same priority overrides an earlier one. That is
 * what lets a host override a shipped renderer by registering its own for the same type.
 *
 * @param typeName The artifact type name.
 * @param contentType The version MIME type, when known.
 */
export function ResolveMobileArtifactRenderer(
    typeName: string | null | undefined,
    contentType?: string | null,
): ComponentType<MobileArtifactRendererProps> | null {
    if (!typeName && !contentType) return null;

    const registrations = MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseMobileArtifactRenderer);
    if (!registrations || registrations.length === 0) return null;

    const ordered = [...registrations].sort((a, b) => a.Priority - b.Priority);
    let best: { priority: number; cls: typeof BaseMobileArtifactRenderer } | null = null;

    for (const reg of ordered) {
        const cls = reg.SubClass as unknown as typeof BaseMobileArtifactRenderer | undefined;
        if (!cls || typeof cls.CanHandle !== 'function') continue;
        if (!cls.CanHandle(typeName ?? '', contentType ?? undefined)) continue;
        if (!best || reg.Priority >= best.priority) best = { priority: reg.Priority, cls };
    }

    if (!best) return null;
    // Constructed only once a match is certain; the component itself is an instance member because
    // a renderer may want per-instance configuration later, exactly as `BaseMobileResource` does.
    const instance = new (best.cls as unknown as new () => BaseMobileArtifactRenderer)();
    return instance.Component;
}
