import { Component, ElementRef, EventEmitter, inject, Input, Output, Type } from '@angular/core';
import { CompositeKey, DataSnapshot, type IMetadataProvider } from '@memberjunction/core';
import { MJArtifactVersionEntity } from '@memberjunction/core-entities';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { IArtifactViewerComponent } from '../interfaces/artifact-viewer-plugin.interface';
import { CaptureRenderedElementThumbnail } from '../utils/artifact-dom-capture';
import type { PdfOrientation } from '@memberjunction/ng-react';

/**
 * General-purpose navigation request emitted by artifact viewer plugins.
 * Allows plugins to request app-level navigation (e.g., switch to a specific
 * application, open a nav item, and set query parameters) without depending
 * on NavigationService directly.
 *
 * The event bubbles through ArtifactTypePluginViewer → ArtifactViewerPanel →
 * consumer (conversations, dashboards, etc.) → ultimately the Explorer wrapper
 * where NavigationService lives.
 */
export interface NavigationRequest {
  /** Target application name (e.g., 'Data Explorer'). If omitted, stays in current app. */
  appName?: string;

  /** Target navigation item label within the app (e.g., 'Queries') */
  navItemName: string;

  /** Query parameters to pass to the navigation target (e.g., { queryId: 'xxx' }) */
  queryParams?: Record<string, string>;

  /** An artifact to open in its own tab. When set, hosts open it and ignore the nav item. */
  ArtifactID?: string;

  /** Tab title for {@link ArtifactID}. */
  ArtifactName?: string;
}

/**
 * Represents an additional tab that a plugin can provide to the artifact viewer.
 *
 * Tabs can render content in two ways:
 * 1. **String content** - Use `contentType` with `content` for built-in renderers (markdown, json, code, etc.)
 * 2. **Custom component** - Use `contentType: 'component'` with `component` and optional `componentInputs`
 *
 * @example
 * // String content tab
 * {
 *   label: 'Code',
 *   icon: 'fa-code',
 *   contentType: 'code',
 *   content: () => this.getCodeContent(),
 *   language: 'typescript'
 * }
 *
 * @example
 * // Custom component tab
 * {
 *   label: 'Data',
 *   icon: 'fa-database',
 *   contentType: 'component',
 *   component: DataRequirementsViewerComponent,
 *   componentInputs: { dataRequirements: this.spec.dataRequirements }
 * }
 */
export interface ArtifactViewerTab {
  /** Display label for the tab */
  label: string;
  /** Font Awesome icon class (without 'fas' prefix) */
  icon?: string;
  /** Type of content to render */
  contentType: 'plaintext' | 'html' | 'markdown' | 'json' | 'code' | 'component';
  /** String content or function returning string (for non-component tabs) */
  content?: string | (() => string);
  /** Language hint for code highlighting (used with 'code' contentType) */
  language?: string;
  /** Angular component class to render (used with 'component' contentType) */
  component?: Type<object>;
  /** Inputs to pass to the custom component */
  componentInputs?:
    | Record<string, string | number | boolean | object | null | undefined>
    | (() => Record<string, string | number | boolean | object | null | undefined>);
}

/**
 * Strongly-typed contract implemented by per-artifact-type visual version diff viewer components.
 * Mounted dynamically inside the Version Compare workspace when a plugin returns `true` from
 * {@link BaseArtifactViewerPluginComponent.SupportsVersionDiff}.
 */
export interface IArtifactVersionDiffViewer {
  BaseVersion: MJArtifactVersionEntity;
  TargetVersion: MJArtifactVersionEntity;
  Provider?: IMetadataProvider | null;
}

/**
 * Interactive viewing/editing mode accepted by unified artifact viewers (`NW-6`).
 */
export type ArtifactViewerViewMode = 'edit' | 'suggest' | 'diff' | 'present';

/**
 * Target location inside a document, spreadsheet, or slide deck for deep linking (`NW-6`).
 */
export interface ArtifactNavigationAnchor {
  Sheet?: string;
  Range?: string;
  SlideNumber?: number;
  SlideID?: string;
  ElementID?: string;
  Heading?: string;
  BlockID?: string;
  HighlightMs?: number;
}

export type ArtifactSelectionDomain = 'document' | 'spreadsheet' | 'slides' | 'whiteboard';

/**
 * User selection context emitted by artifact viewers (`NW-6`).
 */
export interface ArtifactSelectionAnchor {
  domain: ArtifactSelectionDomain;
  heading?: string;
  blockId?: string;
  quote?: string;
  sheet?: string;
  range?: string;
  slideNumber?: number;
  slideId?: string;
  elementId?: string;
}

/**
 * Server-verified frozen snapshot provenance entry passed in anonymous/guest share views (`NW-1`).
 */
export interface PreVerifiedFrozenSnapshotEntry {
  Verified: boolean;
  FrozenByUserName?: string;
  FrozenAt?: string;
}

export type PreVerifiedFrozenSnapshotMap = Record<string, PreVerifiedFrozenSnapshotEntry>;

/**
 * One entry in the artifact viewer header's Export menu.
 * A viewer lists its entries in {@link BaseArtifactViewerPluginComponent.GetExportOptions}
 * and runs the chosen one in {@link BaseArtifactViewerPluginComponent.RunExport}.
 */
export interface ArtifactExportOption {
  /** Key passed back to `RunExport`. Unique within one viewer. */
  Key: string;
  /** Menu label, e.g. "Excel (.xlsx)". */
  Label: string;
  /** Font Awesome icon classes, e.g. "fa-solid fa-file-excel". */
  Icon: string;
  /** Optional short hint shown under the label. */
  Description?: string;
  /** Optional heading. Options next to each other with the same group show under one heading. */
  Group?: string;
  /** When set, the option shows greyed out with this text in place of its description, and does not run. */
  DisabledReason?: string;
}

/** The PDF entries every viewer that supports PDF export gets by default. */
const PDF_EXPORT_OPTIONS: ReadonlyArray<ArtifactExportOption> = [
  { Key: 'pdf-portrait', Label: 'PDF – Portrait', Icon: 'fa-solid fa-file-pdf' },
  { Key: 'pdf-landscape', Label: 'PDF – Landscape', Icon: 'fa-solid fa-file-pdf fa-rotate-90' },
];

/** Export key for a viewer's one downloadable file: the uploaded file, or the source it shows. */
export const FILE_EXPORT_KEY = 'file';

/**
 * Abstract base component for all artifact viewer plugins.
 * Provides common functionality and enforces the contract.
 * Note: This is an abstract class and should not be declared in Angular module.
 */
@Component({
  standalone: false,
  template: ''
})
export abstract class BaseArtifactViewerPluginComponent extends BaseAngularComponent implements IArtifactViewerComponent {
  private _artifactVersion!: MJArtifactVersionEntity;

  /**
   * The artifact version to display
   */
  @Input()
  public get artifactVersion(): MJArtifactVersionEntity {
    return this._artifactVersion;
  }
  public set artifactVersion(value: MJArtifactVersionEntity) {
    const previous = this._artifactVersion;
    const isFirstChange = previous === undefined;
    this._artifactVersion = value;
    if (previous !== value) {
      this.onArtifactVersionChanged(previous, value, isFirstChange);
    }
  }

  /**
   * Optional lifecycle hook invoked when {@link artifactVersion} is assigned a new reference.
   */
  protected onArtifactVersionChanged(
    _previous: MJArtifactVersionEntity | undefined,
    _current: MJArtifactVersionEntity,
    _isFirstChange: boolean,
  ): void {}

  /**
   * Inline-PREVIEW resolution does NOT live here.
   *
   * Plugins that want to drive an inline preview inside conversation message cards declare the
   * preview contract as STATIC members on their class — `static readonly PreviewComponentType` and
   * `static CanHandlePreview(...)` — described by {@link IArtifactViewerPluginPreviewStatics}. The
   * resolver reads those statics off the registered constructor WITHOUT instantiating the plugin
   * (these are Angular components with DI constructors; a bare `new` outside an injection context
   * throws). There is intentionally NO instance-level preview member on this base class — static is
   * the single source of truth.
   */

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
   * Optional: The version numbers of this artifact that the viewer lists in its conversation
   * scope. Null when the viewer has no scope, so every version of the artifact counts.
   */
  @Input() VisibleVersionNumbers: ReadonlyArray<number> | null = null;

  private _preVerifiedFrozenSnapshots: PreVerifiedFrozenSnapshotMap | null = null;
  private _guestSnapshotMode = false;
  private _viewerViewMode: ArtifactViewerViewMode | undefined = undefined;
  private _navigationAnchor: ArtifactNavigationAnchor | null = null;

  /**
   * Forces offline snapshot-only rendering without Yjs WebSocket connections, server permission lookups,
   * or live query refreshes — even when the host browser has an authenticated `Metadata.Provider` (`P0-P3-4`).
   */
  @Input()
  public get GuestSnapshotMode(): boolean {
    return this._guestSnapshotMode;
  }
  public set GuestSnapshotMode(value: boolean | undefined) {
    const next = Boolean(value);
    if (this._guestSnapshotMode !== next) {
      this._guestSnapshotMode = next;
      this.onGuestSnapshotModeChanged(next);
    }
  }

  /** CamelCase alias for {@link GuestSnapshotMode}. */
  @Input()
  public get guestSnapshotMode(): boolean {
    return this.GuestSnapshotMode;
  }
  public set guestSnapshotMode(value: boolean | undefined) {
    this.GuestSnapshotMode = value;
  }

  /**
   * Effective guest snapshot isolation flag: explicit `[GuestSnapshotMode]="true"` OR
   * an ephemeral guest snapshot version (empty `ArtifactID` paired with `PreVerifiedFrozenSnapshots !== null`).
   */
  protected get isGuestSnapshotMode(): boolean {
    return (
      this._guestSnapshotMode ||
      (!this.artifactVersion?.ArtifactID && this._preVerifiedFrozenSnapshots !== null)
    );
  }

  /** Optional lifecycle hook invoked when {@link GuestSnapshotMode} changes. */
  protected onGuestSnapshotModeChanged(_guestMode: boolean): void {}

  /**
   * Server-verified frozen block/table/slide provenance passed for pre-auth guest share views (`NW-1`).
   */
  @Input()
  public get PreVerifiedFrozenSnapshots(): PreVerifiedFrozenSnapshotMap | null {
    return this._preVerifiedFrozenSnapshots;
  }
  public set PreVerifiedFrozenSnapshots(value: PreVerifiedFrozenSnapshotMap | null | undefined) {
    this._preVerifiedFrozenSnapshots = value ?? null;
    this.onPreVerifiedFrozenSnapshotsChanged(this._preVerifiedFrozenSnapshots);
  }

  /**
   * Optional synchronized mode (`'edit' | 'suggest' | 'diff' | 'present'`) pushed from host containers (`NW-6`).
   * Aliased to `'ViewMode'` / `'viewMode'` so plugin subclasses that define their own `ViewMode` property do not collide.
   */
  @Input('ViewMode')
  public get SyncViewMode(): ArtifactViewerViewMode | undefined {
    return this._viewerViewMode;
  }
  public set SyncViewMode(value: ArtifactViewerViewMode | undefined) {
    if (value !== undefined && this._viewerViewMode !== value) {
      this._viewerViewMode = value;
      this.onViewerViewModeChanged(value);
    }
  }

  /** CamelCase alias for {@link SyncViewMode}. */
  @Input('viewMode')
  public get syncViewMode(): ArtifactViewerViewMode | undefined {
    return this.SyncViewMode;
  }
  public set syncViewMode(value: ArtifactViewerViewMode | undefined) {
    this.SyncViewMode = value;
  }

  /**
   * Optional target heading, block, sheet/range, or slide/element anchor to focus (`NW-6`).
   */
  @Input()
  public get NavigationAnchor(): ArtifactNavigationAnchor | null {
    return this._navigationAnchor;
  }
  public set NavigationAnchor(value: ArtifactNavigationAnchor | null | undefined) {
    this._navigationAnchor = value ?? null;
    if (this._navigationAnchor) {
      this.onNavigationAnchorChanged(this._navigationAnchor);
    }
  }

  /** CamelCase alias for {@link NavigationAnchor}. */
  @Input()
  public get navigationAnchor(): ArtifactNavigationAnchor | null {
    return this.NavigationAnchor;
  }
  public set navigationAnchor(value: ArtifactNavigationAnchor | null | undefined) {
    this.NavigationAnchor = value;
  }

  /** Emitted when the active selection (heading, block, cell range, or slide) changes (`NW-6`). */
  @Output() public SelectionChanged = new EventEmitter<ArtifactSelectionAnchor>();

  /** CamelCase alias for {@link SelectionChanged}. */
  @Output() public selectionChanged = this.SelectionChanged;

  /** Optional lifecycle hook invoked when {@link PreVerifiedFrozenSnapshots} changes. */
  protected onPreVerifiedFrozenSnapshotsChanged(_snapshots: PreVerifiedFrozenSnapshotMap | null): void {}

  /** Optional lifecycle hook invoked when {@link ViewMode} changes. */
  protected onViewerViewModeChanged(_mode: ArtifactViewerViewMode): void {}

  /** Optional lifecycle hook invoked when {@link NavigationAnchor} is assigned. */
  protected onNavigationAnchorChanged(_anchor: ArtifactNavigationAnchor): void {}

  /**
   * Emitted when an inline-editable plugin (such as `MarkdownArtifactViewerComponent` or
   * `WhiteboardArtifactViewerComponent` in OLE canvas mode) commits updated serialized
   * content that should be persisted as a new `MJ: Artifact Versions` record.
   */
  @Output() public ContentCommitted = new EventEmitter<string>();

  /**
   * Whether this plugin supports inline editing when `[readonly]="false"` ("MS OLE" inline mode, § 3.4.1).
   * Subclasses that support inline editing override this getter to return `true`.
   */
  public get SupportsInlineEdit(): boolean {
    return false;
  }

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
  protected parseJsonContent<T = Record<string, string | number | boolean | object | null | undefined>>(): T | null {
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
   * Optional: Emitted when the plugin's additional tabs change after async loading.
   * Plugins that load data asynchronously (e.g., from a component registry) should
   * emit this when loading completes and new tabs become available. The parent panel
   * listens for this to re-run change detection and render the updated tab list.
   */
  public tabsChanged?: EventEmitter<void>;

  /**
   * Optional: Emitted when the plugin wants to navigate to a different app/nav item.
   * Plugins that need app-level navigation (e.g., "Open Query" navigating to the
   * Data Explorer's Queries nav item) should instantiate this emitter and emit a
   * NavigationRequest. The event bubbles up through the artifact viewer chain to the
   * host application where NavigationService handles the actual navigation.
   */
  public navigationRequest?: EventEmitter<NavigationRequest>;

  /**
   * Optional: Emitted when the plugin wants to open a MemberJunction entity record.
   */
  public OpenEntityRecord?: EventEmitter<{ entityName: string; compositeKey: CompositeKey }>;

  /**
   * @deprecated Use {@link OpenEntityRecord}.
   */
  public openEntityRecord?: EventEmitter<{ entityName: string; compositeKey: CompositeKey }>;

  /**
   * Whether this plugin supports user feedback.
   * Plugins that return true will get a feedback button in the artifact viewer header.
   * Override this getter to return true when feedback is available.
   *
   * Default: false
   */
  public get SupportsFeedback(): boolean {
    return false;
  }

  /**
   * Ask the user for feedback on the current artifact.
   * Called by the artifact viewer panel when the user clicks the feedback button in the header.
   * Each plugin implements its own feedback UX (dialog, panel, inline form, etc.).
   *
   * Default: no-op. Subclasses should override to implement artifact-type-specific feedback.
   */
  public AskUserForFeedback(): void {
    // Subclasses override to implement feedback UX
  }

  /**
   * Whether this plugin can export what it shows as a PDF.
   * Plugins that return true get an Export PDF button in the artifact viewer header.
   *
   * Default: false
   */
  public get SupportsPDFExport(): boolean {
    return false;
  }

  /**
   * Download what the plugin shows as a PDF on A4 pages. Called from the artifact viewer header menu.
   *
   * Default: no-op. Subclasses that return true from {@link SupportsPDFExport} override it.
   */
  public async ExportPDF(_orientation: PdfOrientation = 'portrait'): Promise<void> {
    // Subclasses override to export their content
  }

  /**
   * The formats this viewer can export, shown in the artifact viewer header's Export menu.
   * The header shows no Export button when this returns an empty list.
   *
   * Default: the portrait and landscape PDF entries when {@link SupportsPDFExport} is true.
   * Subclasses override to list other formats, and may include the PDF entries too.
   */
  public GetExportOptions(): ArtifactExportOption[] {
    return this.SupportsPDFExport ? [...PDF_EXPORT_OPTIONS] : [];
  }

  /**
   * Runs the export option with the given key, which came from {@link GetExportOptions}.
   * Throws when the export fails, so the header can tell the user.
   *
   * Default: runs the PDF entries through {@link ExportPDF}. Subclasses that add options
   * handle their own keys and pass the rest to `super.RunExport`.
   */
  public async RunExport(key: string): Promise<void> {
    if (key === 'pdf-portrait' || key === 'pdf-landscape') {
      await this.ExportPDF(key === 'pdf-landscape' ? 'landscape' : 'portrait');
      return;
    }
    throw new Error(`Unknown export option: ${key}`);
  }

  /**
   * Whether this plugin provides a domain-specific visual diff viewer for comparing two versions
   * of the artifact inside the Git-style Version Compare workspace.
   *
   * When `false` (default), the workspace automatically falls back to the universal structural
   * JSON diff (`DeepDiffer`) and unified/split line diff.
   */
  public get SupportsVersionDiff(): boolean {
    return false;
  }

  /**
   * Returns the Angular component type implementing {@link IArtifactVersionDiffViewer} when
   * {@link SupportsVersionDiff} is `true`, or `null` to use the universal diff viewer.
   */
  public GetVersionDiffComponentType(): Type<IArtifactVersionDiffViewer> | null {
    return null;
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

  /**
   * Return a point-in-time snapshot of the data this viewer is currently displaying.
   * Every viewer plugin MUST implement this with type-appropriate content.
   *
   * Guidelines for file-based viewers:
   * - PDF: page count, current page in interpretation, extracted text summary in custom
   * - Excel: each sheet as a DataTable in tables[], active sheet in activeTab
   * - Word: section count in interpretation, extracted text in custom
   * - For all: use getDisplayTitle() for snap.title
   *
   * @returns A DataSnapshot describing the current state, or null if no data is available.
   */
  public abstract GetCurrentStateSnapshot(): DataSnapshot | null;

  protected readonly captureHostElementRef: ElementRef<HTMLElement> | null = (() => {
    try {
      return inject(ElementRef, { optional: true }) as ElementRef<HTMLElement> | null;
    } catch {
      return null;
    }
  })();

  /**
   * Captures a rendered visual thumbnail (`data:image/webp|jpeg|png|svg+xml;base64,...`) of this
   * plugin's primary display surface, masking live data blocks when requested by the Artifact Type policy.
   */
  public async CaptureRenderedThumbnail(options?: { maskLiveDataBlocks?: boolean }): Promise<string | null> {
    const target = this.resolveCaptureRootElement();
    if (!target) {
      return null;
    }
    return CaptureRenderedElementThumbnail(target, {
      MaskLiveDataBlocks: options?.maskLiveDataBlocks !== false,
    });
  }

  /**
   * Returns the DOM element representing the visual canvas/stage to screenshot (excluding viewer chrome).
   */
  protected resolveCaptureRootElement(): HTMLElement | null {
    return this.captureHostElementRef?.nativeElement ?? null;
  }

  /**
   * Get the raw text content from the artifact version.
   * Returns null if no content is available.
   */
  protected getRawContent(): string | null {
    return this.artifactVersion?.Content ?? null;
  }

  /**
   * Get a display-friendly title for the artifact.
   * Returns null if no name is available.
   */
  protected getDisplayTitle(): string | null {
    return this.artifactVersion?.Name ?? null;
  }

  /**
   * Trigger a browser file download from a URL.
   * Shared by all file-backed viewer plugins (PDF, XLSX, DOCX) so the fetch →
   * blob → object-URL → anchor pattern lives in exactly one place.
   */
  protected async triggerBrowserDownload(url: string, fileName: string): Promise<void> {
    const response = await fetch(url);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  }

  /** The Export menu entry for the viewer's one downloadable file. */
  protected FileExportOption(label: string, icon: string, description: string): ArtifactExportOption {
    return { Key: FILE_EXPORT_KEY, Label: label, Icon: icon, Description: description };
  }

  /** The uploaded file's name, else the artifact's name, else the fallback. */
  protected OriginalFileName(fallback: string): string {
    return this.artifactVersion?.FileName?.trim() || this.getDisplayTitle()?.trim() || fallback;
  }

  /** The artifact's name with the given extension, for a downloaded file. */
  protected ExportFileName(extension: string): string {
    return `${this.getDisplayTitle()?.trim() || 'artifact'}.${extension}`;
  }

  /** Saves text as a file in the browser. */
  protected DownloadTextFile(text: string, fileName: string, mimeType: string): void {
    const objectUrl = URL.createObjectURL(new Blob([text], { type: mimeType }));
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  }
}
