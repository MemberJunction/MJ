import { Component, Input } from '@angular/core';
import { ArtifactVersionEntity } from '@memberjunction/core-entities';
import { IArtifactViewerComponent } from '../interfaces/artifact-viewer-plugin.interface';

/**
 * Abstract base component for all artifact viewer plugins.
 * Provides common functionality and enforces the contract.
 * Note: This is an abstract class and should not be declared in Angular module.
 */
@Component({
  template: ''
})
export abstract class BaseArtifactViewerPluginComponent implements IArtifactViewerComponent {
  /**
   * The artifact version to display
   */
  @Input() artifactVersion!: ArtifactVersionEntity;

  /**
   * Optional: Custom height for the viewer (defaults to auto)
   */
  @Input() height?: string;

  /**
   * Optional: Whether the viewer is in readonly mode
   */
  @Input() readonly: boolean = true;

  /**
   * Optional: Additional CSS classes to apply
   */
  @Input() cssClass?: string;

  /**
   * Get the content from the artifact version.
   * Handles both string content and JSON objects.
   */
  protected getContent(): string {
    if (!this.artifactVersion?.Content) {
      return '';
    }

    if (typeof this.artifactVersion.Content === 'string') {
      return this.artifactVersion.Content;
    }

    // If Content is an object, stringify it
    return JSON.stringify(this.artifactVersion.Content, null, 2);
  }

  /**
   * Parse JSON content safely
   */
  protected parseJsonContent<T = any>(): T | null {
    try {
      const content = this.getContent();
      return JSON.parse(content);
    } catch (error) {
      console.error('Failed to parse artifact content as JSON:', error);
      return null;
    }
  }

  /**
   * Get a safe display name for the artifact version
   */
  protected getDisplayName(): string {
    return this.artifactVersion?.Name || 'Untitled Artifact';
  }

  /**
   * Get the description
   */
  protected getDescription(): string {
    return this.artifactVersion?.Description || '';
  }
}
