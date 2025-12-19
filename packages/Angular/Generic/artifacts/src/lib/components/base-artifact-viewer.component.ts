import { Component, Input } from '@angular/core';
import { ArtifactVersionEntity } from '@memberjunction/core-entities';
import { IArtifactViewerComponent } from '../interfaces/artifact-viewer-plugin.interface';

/**
 * Represents an additional tab that a plugin can provide to the artifact viewer
 */
export interface ArtifactViewerTab {
  label: string;
  icon?: string;
  contentType: 'plaintext' | 'html' | 'markdown' | 'json' | 'code';
  content: string | (() => string); // Static or lazy-loaded
  language?: string; // For code type (typescript, json, etc.)
}

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
   * Whether this plugin is showing an "elevated" display (e.g., extracted markdown/HTML)
   * vs raw content. When true and content type is JSON, the wrapper will show a JSON tab.
   *
   * Subclasses should override this getter to return the appropriate value based on their
   * current display state. For example, JSON plugin returns true when showing displayMarkdown
   * or displayHtml, false when showing raw JSON editor.
   *
   * Default: false (showing raw content)
   */
  public get isShowingElevatedDisplay(): boolean {
    return false;
  }

  /**
   * Whether the parent wrapper should show a raw content tab (e.g., JSON tab for JSON content).
   * This gives plugins fine-grained control over the parent's tab display.
   *
   * Use cases:
   * - JSON plugin with extract rules: true (show JSON tab to view source)
   * - Component plugin: true (show JSON tab even when displaying elevated component)
   * - Code plugin: false (already showing raw content)
   *
   * Subclasses can override this to control parent behavior.
   * Default: true (parent should show raw content tab if applicable)
   */
  public get parentShouldShowRawContent(): boolean {
    return true;
  }

  /**
   * Whether this plugin has content to display in the Display tab.
   * Used by the parent wrapper to determine if the Display tab should be shown.
   *
   * Subclasses should override this getter to return true when they have
   * meaningful content to display.
   *
   * Default: false (subclasses must opt-in to showing Display tab)
   */
  public get hasDisplayContent(): boolean {
    return false;
  }

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

  /**
   * Get additional tabs that this plugin wants to provide to the artifact viewer.
   * Override this method to provide custom tabs for viewing metadata, code, etc.
   *
   * @returns Array of tab definitions, or undefined if no additional tabs
   */
  public GetAdditionalTabs?(): ArtifactViewerTab[];

  /**
   * Get list of standard tabs that this plugin wants to hide/remove.
   * Use this when the plugin provides custom alternatives to standard tabs.
   *
   * Example: Component viewer provides custom "Resolved JSON" tab, so removes standard "JSON" tab
   *
   * @returns Array of standard tab names to remove (case-insensitive)
   *          Valid values: 'JSON', 'Details', 'Links'
   *          Note: 'Display' cannot be removed (it's the main view)
   */
  public GetStandardTabRemovals?(): string[];
}
