/**
 * Controls how Library cards generate and display preview thumbnails for an Artifact Type.
 *
 * - `'Rendered'`: Capture and display a real rendered screenshot (or vector SVG export for
 *   Whiteboards/SVGs) stored in `MJArtifactVersionEntity.Configuration.thumbnailDataUrl`, masking
 *   live database widgets when `MaskLiveDataBlocks` is enabled.
 * - `'Structural'`: Display a clean abstract schematic wireframe (e.g. blank spreadsheet grid bars)
 *   without storing or rendering real cell values, query rows, or document text.
 * - `'Icon'`: Display only the artifact type's badge and icon with no content thumbnail stored or shown.
 */
export type ArtifactTypeThumbnailMode = 'Rendered' | 'Structural' | 'Icon';

/**
 * Thumbnail and screenshot capture policy nested inside {@link IArtifactTypeConfiguration}.
 */
export interface IArtifactTypeThumbnailConfiguration {
  /**
   * Master switch controlling whether thumbnails or structural previews are generated and displayed
   * for artifacts of this type. Defaults to `false` when `Mode === 'Icon'`, `true` otherwise.
   */
  Enabled?: boolean;

  /**
   * Determines whether cards show a `'Rendered'` screenshot/export, a `'Structural'` wireframe,
   * or an `'Icon'` badge only.
   */
  Mode?: ArtifactTypeThumbnailMode;

  /**
   * When `true` (default), live database-backed widgets inside documents or sheets (`mj-block`
   * `EntityView` / `Query` containers, live query cells) are masked with a neutral placeholder
   * during DOM screenshot capture so row-level data is never persisted into shared card thumbnails.
   */
  MaskLiveDataBlocks?: boolean;
}

/**
 * Optional configuration bag stored as JSON in `MJ: Artifact Types.Configuration`.
 * CodeGen emits a typed `ConfigurationObject` accessor on `MJArtifactTypeEntity` returning
 * `MJArtifactTypeEntity_IArtifactTypeConfiguration | null`.
 */
export interface IArtifactTypeConfiguration {
  /**
   * Per-artifact-type thumbnail visibility and capture behavior in Library cards.
   */
  Thumbnail?: IArtifactTypeThumbnailConfiguration;
}
