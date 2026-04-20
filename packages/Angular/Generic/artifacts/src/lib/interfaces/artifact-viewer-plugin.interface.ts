import { Type } from '@angular/core';
import { MJArtifactVersionEntity } from '@memberjunction/core-entities';

/**
 * Interface for artifact viewer plugins.
 * All artifact viewer plugins must implement this interface and be registered
 * with @RegisterClass decorator from @memberjunction/global.
 */
export interface IArtifactViewerPlugin {
  /**
   * The Angular component class that will be dynamically loaded to render the artifact.
   * Must be a component type that accepts artifact input.
   */
  readonly componentType: Type<any>;

  /**
   * Determines if this plugin can handle the given artifact type and content type.
   * @param artifactTypeName The artifact type name (e.g., 'JSON', 'Code', etc.)
   * @param contentType The content type (e.g., 'application/json', 'text/x-python', etc.)
   * @returns true if this plugin can render the artifact
   */
  canHandle(artifactTypeName: string, contentType?: string): boolean;

  /**
   * Optional: Get display metadata for the artifact (title, icon, etc.)
   * @param artifactVersion The artifact version to get metadata for
   * @returns Display metadata object
   */
  getMetadata?(artifactVersion: MJArtifactVersionEntity): ArtifactMetadata;
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
