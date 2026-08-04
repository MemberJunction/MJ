import { Injectable, Type } from '@angular/core';
import { MJGlobal } from '@memberjunction/global';
import { BaseArtifactViewerPluginComponent } from '../components/base-artifact-viewer.component';
import {
    IArtifactPreviewComponent,
    IArtifactViewerPluginPreviewStatics,
} from '../interfaces/artifact-viewer-plugin.interface';

/**
 * A registered artifact-viewer plugin **constructor** that MAY carry the static inline-preview
 * contract ({@link IArtifactViewerPluginPreviewStatics}). The resolver reads these statics off the
 * constructor directly — it never instantiates the plugin. Plugins that don't declare a preview
 * simply leave both members undefined.
 */
type PreviewCapableViewerClass = Type<BaseArtifactViewerPluginComponent> & IArtifactViewerPluginPreviewStatics;

/**
 * Resolves the inline-PREVIEW component for an artifact, INDEPENDENTLY of full-viewer resolution.
 *
 * The full viewer ({@link ArtifactTypePluginViewerComponent}) resolves by the artifact type's
 * `DriverClass`. The inline preview, by contrast, is resolved by enumerating every registered
 * artifact-viewer plugin CLASS and picking the highest-priority one that BOTH:
 *   1. exposes a static `PreviewComponentType`, AND
 *   2. returns `true` from its static `CanHandlePreview(typeName, contentType)`.
 *
 * The preview contract is read STATICALLY — the resolver NEVER instantiates a plugin. Plugins are
 * Angular components with DI constructors (and some use `inject()` in field initializers), so a
 * bare `new SubClass()` outside an Angular injection context throws ("inject() must be called from
 * an injection context"). Reading statics off the registered constructor sidesteps that entirely.
 *
 * Why independent: a downstream plugin can override the full VIEWER for a type without supplying a
 * `PreviewComponentType` — that must NOT suppress a base plugin's preview. Conversely a broad
 * viewer can coexist with a specialized preview. By resolving the preview slot on its own, neither
 * decision constrains the other.
 *
 * Ordering mirrors {@link ClassFactory.GetRegistration}: highest `Priority` wins, and on a tie the
 * LAST-registered plugin wins (later registrations auto-increment priority, so this is rarely a tie).
 */
@Injectable({
    providedIn: 'root',
})
export class ArtifactPreviewResolverService {
    /**
     * Returns the preview component type for the given artifact type/content, or `null` when no
     * registered plugin class exposes a matching static `PreviewComponentType` (caller falls back
     * to its box).
     *
     * @param artifactTypeName The artifact's type name (e.g. from `artifact.Type`).
     * @param contentType      The version MIME type (e.g. from `artifactVersion.MimeType`).
     */
    public resolvePreviewComponent(
        artifactTypeName: string | null | undefined,
        contentType: string | null | undefined,
    ): Type<IArtifactPreviewComponent> | null {
        if (!artifactTypeName && !contentType) {
            return null;
        }

        const registrations = MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseArtifactViewerPluginComponent);
        if (!registrations || registrations.length === 0) {
            return null;
        }

        // Highest priority first; on a tie, later array position (later registration) wins — so we
        // walk in ascending-priority order and let a `>=` comparison keep the LAST match at a given
        // priority.
        const ordered = [...registrations].sort((a, b) => a.Priority - b.Priority);

        let best: { priority: number; preview: Type<IArtifactPreviewComponent> } | null = null;

        for (const reg of ordered) {
            const cls = reg.SubClass as PreviewCapableViewerClass | undefined;
            if (!cls) {
                continue;
            }

            // Read the STATIC contract off the constructor — no instantiation.
            const preview = cls.PreviewComponentType;
            if (!preview || typeof cls.CanHandlePreview !== 'function') {
                continue;
            }

            if (!cls.CanHandlePreview(artifactTypeName ?? '', contentType ?? undefined)) {
                continue;
            }

            // `>=` so a later registration at the SAME priority overrides an earlier one.
            if (!best || reg.Priority >= best.priority) {
                best = { priority: reg.Priority, preview };
            }
        }

        return best?.preview ?? null;
    }
}
