import { Type } from '@angular/core';
import { MJArtifactVersionEntity } from '@memberjunction/core-entities';

/**
 * Interface for artifact viewer plugins.
 * All artifact viewer plugins must implement this interface and be registered
 * with @RegisterClass decorator from @memberjunction/global.
 */
export interface IArtifactViewerPlugin {
  /**
   * The Angular component class that will be dynamically loaded to render the FULL artifact
   * (the right-side viewer panel — toolbar, tabs, feedback, etc.).
   * Must be a component type that accepts artifact input. REQUIRED.
   */
  readonly componentType: Type<IArtifactViewerComponent>;

  /**
   * Optional: Get display metadata for the artifact (title, icon, etc.)
   * @param artifactVersion The artifact version to get metadata for
   * @returns Display metadata object
   */
  getMetadata?(artifactVersion: MJArtifactVersionEntity): ArtifactMetadata;
}

/**
 * STATIC preview contract for an artifact-viewer plugin **class**.
 *
 * The inline-PREVIEW slot is resolved WITHOUT instantiating any plugin — the resolver reads these
 * STATIC members directly off the registered constructor. This is deliberate: plugins are Angular
 * components with DI constructors (and some use `inject()` in field initializers), so a bare
 * `new SubClass()` outside an Angular injection context throws. Reading statics sidesteps that
 * entirely.
 *
 * A plugin that wants to drive an inline preview declares both members as `static`:
 *   - `static readonly PreviewComponentType` — the lightweight {@link IArtifactPreviewComponent}.
 *   - `static CanHandlePreview(...)`        — type/content matcher for the preview slot.
 *
 * Preview resolution is INDEPENDENT of full-viewer resolution: the inline slot is filled by the
 * highest-priority registered plugin class whose `CanHandlePreview` matches AND that exposes a
 * `PreviewComponentType`. A downstream plugin overriding the full viewer for a type but NOT
 * declaring `PreviewComponentType` therefore does not suppress a base plugin's preview. When no
 * registered class exposes a matching `PreviewComponentType`, no inline preview is rendered and the
 * card falls back to its existing info-bar box.
 */
export interface IArtifactViewerPluginPreviewStatics {
  /**
   * The lightweight component used to render an inline PREVIEW of the artifact directly inside a
   * conversation message card (no toolbar / feedback / tabs). Optional — plugins without a preview
   * omit it and the card falls back to its info-bar box.
   */
  readonly PreviewComponentType?: Type<IArtifactPreviewComponent>;

  /**
   * Determines whether this plugin's {@link PreviewComponentType} applies to a given artifact.
   * Plugins that declare a `PreviewComponentType` MUST also declare this; plugins without a preview
   * can omit it (the resolver skips them).
   *
   * @param artifactTypeName The artifact type name (e.g., 'Image', 'Video', 'Audio').
   * @param contentType      The MIME type (e.g., 'image/png', 'video/mp4').
   * @returns true if this plugin's preview can render the artifact.
   */
  CanHandlePreview?(artifactTypeName: string, contentType?: string): boolean;
}

/**
 * Metadata about an artifact for display purposes
 */
export interface ArtifactMetadata {
  title?: string;
  icon?: string;
  description?: string;
  additionalInfo?: Record<string, any>;
}

/**
 * Base interface that all artifact viewer components must implement.
 * The component receives the artifact version as an input.
 */
export interface IArtifactViewerComponent {
  artifactVersion: MJArtifactVersionEntity;
}

/**
 * Base interface that all inline artifact PREVIEW components must implement.
 *
 * Previews are intentionally lightweight — they receive only the artifact version and render
 * a compact, read-only representation (e.g. a thumbnail `<img>`, a mini `<video>`/`<audio>`
 * player) suitable for embedding inside a conversation message card. Unlike full viewers,
 * previews have NO toolbar, feedback, tabs, or download chrome.
 */
export interface IArtifactPreviewComponent {
  artifactVersion: MJArtifactVersionEntity;
}
