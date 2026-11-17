import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  ViewChild,
  ViewContainerRef,
  ComponentRef,
  Type,
  InjectionToken,
  Injector,
  inject,
} from '@angular/core';
import { MJArtifactVersionEntity, MJArtifactTypeEntity, ArtifactMetadataEngine } from '@memberjunction/core-entities';
import type { ComponentSpec } from '@memberjunction/interactive-component-types';
import { Subscription } from 'rxjs';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import type { PdfOrientation } from '@memberjunction/ng-react';
import { LogError, CompositeKey } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import {
  ArtifactNavigationAnchor,
  ArtifactSelectionAnchor,
  ArtifactViewerViewMode,
  BaseArtifactViewerPluginComponent,
  NavigationRequest,
  PreVerifiedFrozenSnapshotMap,
} from './base-artifact-viewer.component';

/**
 * Maximum nesting depth allowed for embedded OLE artifacts (Doc -> Doc/Sheet/Slide -> ...).
 */
export const MJ_MAX_EMBED_DEPTH = 3;

/**
 * Hierarchical Angular DI token tracking normalized lowercase `ArtifactID`s of all ancestor
 * viewers enclosing an embedded OLE viewer, preventing infinite circular embeds (`A -> A` or `A -> B -> A`).
 */
export const MJ_EMBEDDED_ARTIFACT_ANCESTORS = new InjectionToken<ReadonlySet<string>>(
  'MJ_EMBEDDED_ARTIFACT_ANCESTORS',
);

/**
 * Artifact type plugin viewer that loads the appropriate plugin based on the artifact's DriverClass.
 * Uses MJGlobal.Instance.ClassFactory.CreateInstance() to dynamically load viewer plugins.
 */
@Component({
  standalone: false,
  selector: 'mj-artifact-type-plugin-viewer',
  template: `
    <div class="artifact-type-plugin-viewer">
      @if (isLoading) {
        <div class="loading-state">
          <i class="fa-solid fa-spinner fa-spin"></i>
          <span>Loading artifact viewer...</span>
        </div>
      }
      @if (error) {
        <div class="error-state">
          <i class="fa-solid fa-triangle-exclamation"></i>
          @if (errorTitle) {
            <div class="error-title">{{ errorTitle }}</div>
          }
          <div class="error-details">{{ error }}</div>
          @if (errorDetails) {
            <div class="error-tech-details">{{ errorDetails }}</div>
          }
        </div>
      }
      <ng-container #viewerContainer></ng-container>
    </div>
  `,
  styles: [`
    .artifact-type-plugin-viewer {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    .artifact-type-plugin-viewer ::ng-deep > * {
      flex: 1;
      min-height: 0;
    }

    .loading-state,
    .error-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px;
      gap: 16px;
      color: var(--mj-text-muted, #6c757d);
      width: 100%;
      height: 100%;
      min-height: 200px;
    }

    .loading-state i {
      font-size: 32px;
    }

    .error-state {
      color: var(--mj-status-error, #dc3545);
      text-align: center;
      max-width: 600px;
      margin: 0 auto;
    }

    .error-state i {
      font-size: 32px;
    }

    .error-state .error-title {
      font-weight: 600;
      font-size: 16px;
      margin-bottom: 8px;
    }

    .error-state .error-details {
      font-size: 14px;
      line-height: 1.5;
      color: var(--mj-text-muted, #6c757d);
    }

    .error-state .error-tech-details {
      margin-top: 12px;
      padding: 12px;
      background: var(--mj-bg-surface-sunken, #f8f9fa);
      color: var(--mj-text-secondary, #495057);
      border-radius: 4px;
      font-family: monospace;
      font-size: 12px;
      word-break: break-word;
    }
  `]
})
export class ArtifactTypePluginViewerComponent extends BaseAngularComponent implements OnInit, OnDestroy {
  private readonly parentAncestors = inject(MJ_EMBEDDED_ARTIFACT_ANCESTORS, {
    optional: true,
    skipSelf: true,
  });
  private readonly injector = inject(Injector);

  private _artifactVersion!: MJArtifactVersionEntity;
  private _artifactTypeName!: string;
  private _driverClass?: string;
  private _contentType?: string;
  private _height?: string;
  private _readonly = true;
  private _cssClass?: string;
  private _visibleVersionNumbers: ReadonlyArray<number> | null = null;
  private _ancestorArtifactIDs?: ReadonlySet<string> | null = null;
  private _preVerifiedFrozenSnapshots: PreVerifiedFrozenSnapshotMap | null = null;
  private _guestSnapshotMode = false;
  private _viewerViewMode?: ArtifactViewerViewMode;
  private _navigationAnchor: ArtifactNavigationAnchor | null = null;
  private initialized = false;
  private loadSequence = 0;
  private loadedDriverClass: string | null = null;
  private loadedArtifactID: string | null = null;
  private loadedVersionID: string | null = null;

  @Input() set artifactVersion(value: MJArtifactVersionEntity) {
    const changed = this._artifactVersion !== value;
    this._artifactVersion = value;
    if (this.initialized && changed) {
      void this.loadViewer();
    }
  }
  get artifactVersion(): MJArtifactVersionEntity {
    return this._artifactVersion;
  }

  @Input() set ArtifactTypeName(value: string) {
    const changed = this._artifactTypeName !== value;
    this._artifactTypeName = value;
    if (this.initialized && changed) {
      void this.loadViewer();
    }
  }
  get ArtifactTypeName(): string {
    return this._artifactTypeName;
  }

  /** @deprecated Use {@link ArtifactTypeName}. */
  @Input() set artifactTypeName(value: string) {
    this.ArtifactTypeName = value;
  }
  /** @deprecated Use {@link ArtifactTypeName}. */
  get artifactTypeName(): string {
    return this.ArtifactTypeName;
  }

  /**
   * Optional explicit plugin DriverClass override (for anonymous/guest share rendering without
   * querying ArtifactMetadataEngine). When set, bypasses metadata type lookup.
   */
  @Input() set DriverClass(value: string | undefined) {
    const changed = this._driverClass !== value;
    this._driverClass = value;
    if (this.initialized && changed) {
      void this.loadViewer();
    }
  }
  get DriverClass(): string | undefined {
    return this._driverClass;
  }

  /** CamelCase alias for {@link DriverClass}. */
  @Input() set driverClass(value: string | undefined) {
    this.DriverClass = value;
  }
  get driverClass(): string | undefined {
    return this.DriverClass;
  }

  @Input() set ContentType(value: string | undefined) {
    this._contentType = value;
    if (this.componentRef && value !== undefined) {
      this.componentRef.setInput('contentType', value);
      this.componentRef.changeDetectorRef.detectChanges();
    }
  }
  get ContentType(): string | undefined {
    return this._contentType;
  }

  /** @deprecated Use {@link ContentType}. */
  @Input() set contentType(value: string | undefined) {
    this.ContentType = value;
  }
  /** @deprecated Use {@link ContentType}. */
  get contentType(): string | undefined {
    return this.ContentType;
  }

  @Input() set height(value: string | undefined) {
    this._height = value;
    if (this.componentRef && value !== undefined) {
      this.componentRef.setInput('height', value);
      this.componentRef.changeDetectorRef.detectChanges();
    }
  }
  get height(): string | undefined {
    return this._height;
  }

  @Input() set readonly(value: boolean) {
    this._readonly = value;
    if (this.componentRef) {
      this.componentRef.setInput('readonly', value);
      this.componentRef.changeDetectorRef.detectChanges();
    }
  }
  get readonly(): boolean {
    return this._readonly;
  }

  @Input() set cssClass(value: string | undefined) {
    this._cssClass = value;
    if (this.componentRef && value !== undefined) {
      this.componentRef.setInput('cssClass', value);
      this.componentRef.changeDetectorRef.detectChanges();
    }
  }
  get cssClass(): string | undefined {
    return this._cssClass;
  }

  /** Version numbers the viewer lists in its conversation scope, handed to the plugin; null without a scope. */
  @Input() set VisibleVersionNumbers(value: ReadonlyArray<number> | null) {
    this._visibleVersionNumbers = value;
    if (this.componentRef) {
      this.componentRef.setInput('VisibleVersionNumbers', value);
      this.componentRef.changeDetectorRef.detectChanges();
    }
  }
  get VisibleVersionNumbers(): ReadonlyArray<number> | null {
    return this._visibleVersionNumbers;
  }

  /** Optional explicit ancestor artifact IDs merged with DI-inherited {@link MJ_EMBEDDED_ARTIFACT_ANCESTORS}. */
  @Input() set AncestorArtifactIDs(value: ReadonlySet<string> | null | undefined) {
    this._ancestorArtifactIDs = value;
    if (this.initialized) {
      void this.loadViewer();
    }
  }
  get AncestorArtifactIDs(): ReadonlySet<string> | null | undefined {
    return this._ancestorArtifactIDs;
  }

  /** Optional server-verified frozen snapshot provenance map forwarded to plugin (`NW-1`). */
  @Input() set PreVerifiedFrozenSnapshots(value: PreVerifiedFrozenSnapshotMap | null | undefined) {
    this._preVerifiedFrozenSnapshots = value ?? null;
    if (this.componentRef) {
      this.componentRef.setInput('PreVerifiedFrozenSnapshots', this._preVerifiedFrozenSnapshots);
      this.componentRef.changeDetectorRef.detectChanges();
    }
  }
  get PreVerifiedFrozenSnapshots(): PreVerifiedFrozenSnapshotMap | null {
    return this._preVerifiedFrozenSnapshots;
  }

  /** @deprecated Use {@link PreVerifiedFrozenSnapshots}. */
  @Input() set preVerifiedFrozenSnapshots(value: PreVerifiedFrozenSnapshotMap | null | undefined) {
    this.PreVerifiedFrozenSnapshots = value;
  }
  /** @deprecated Use {@link PreVerifiedFrozenSnapshots}. */
  get preVerifiedFrozenSnapshots(): PreVerifiedFrozenSnapshotMap | null {
    return this.PreVerifiedFrozenSnapshots;
  }

  /** Forces offline snapshot-only rendering for guest share previews (`P0-P3-4`). */
  @Input() set GuestSnapshotMode(value: boolean | undefined) {
    this._guestSnapshotMode = Boolean(value);
    if (this.componentRef) {
      this.componentRef.setInput('GuestSnapshotMode', this._guestSnapshotMode);
      this.componentRef.changeDetectorRef.detectChanges();
    }
  }
  get GuestSnapshotMode(): boolean {
    return this._guestSnapshotMode;
  }

  /** CamelCase alias for {@link GuestSnapshotMode}. */
  @Input() set guestSnapshotMode(value: boolean | undefined) {
    this.GuestSnapshotMode = value;
  }
  get guestSnapshotMode(): boolean {
    return this.GuestSnapshotMode;
  }

  /** Optional synchronized mode (`'edit' | 'suggest' | 'diff' | 'present'`) forwarded to plugin (`NW-6`). */
  @Input('ViewMode') set SyncViewMode(value: ArtifactViewerViewMode | undefined) {
    this._viewerViewMode = value;
    if (this.componentRef && value !== undefined) {
      this.componentRef.setInput('ViewMode', value);
      this.componentRef.changeDetectorRef.detectChanges();
    }
  }
  get SyncViewMode(): ArtifactViewerViewMode | undefined {
    return this._viewerViewMode;
  }

  /** CamelCase alias for {@link SyncViewMode}. */
  @Input('viewMode') set syncViewMode(value: ArtifactViewerViewMode | undefined) {
    this.SyncViewMode = value;
  }
  get syncViewMode(): ArtifactViewerViewMode | undefined {
    return this.SyncViewMode;
  }

  /** Optional target heading/block/sheet/slide anchor forwarded to plugin (`NW-6`). */
  @Input() set NavigationAnchor(value: ArtifactNavigationAnchor | null | undefined) {
    this._navigationAnchor = value ?? null;
    if (this.componentRef) {
      this.componentRef.setInput('NavigationAnchor', this._navigationAnchor);
      this.componentRef.changeDetectorRef.detectChanges();
    }
  }
  get NavigationAnchor(): ArtifactNavigationAnchor | null {
    return this._navigationAnchor;
  }

  /** CamelCase alias for {@link NavigationAnchor}. */
  @Input() set navigationAnchor(value: ArtifactNavigationAnchor | null | undefined) {
    this.NavigationAnchor = value;
  }
  get navigationAnchor(): ArtifactNavigationAnchor | null {
    return this.NavigationAnchor;
  }

  @Output() OpenEntityRecord = new EventEmitter<{entityName: string; compositeKey: CompositeKey}>();

  /**
   * @deprecated Use {@link OpenEntityRecord}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (openEntityRecord) keeps working. Must stay AFTER OpenEntityRecord: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() openEntityRecord = this.OpenEntityRecord;
  @Output() navigationRequest = new EventEmitter<NavigationRequest>();
  @Output() PluginLoaded = new EventEmitter<void>();

  /**
   * @deprecated Use {@link PluginLoaded}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (pluginLoaded) keeps working. Must stay AFTER PluginLoaded: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() pluginLoaded = this.PluginLoaded;
  @Output() tabsChanged = new EventEmitter<void>();
  /**
   * Bubbled up from the component-artifact-viewer's form-aware branch when
   * the user clicks "Apply to my form". Carries the spec + entity so the
   * consumer (chat message card, conversation host) can invoke the
   * Create-or-Modify Interactive Form action behind a confirmation dialog.
   */
  @Output() ApplyFormRequested = new EventEmitter<{ spec: ComponentSpec; entityName: string }>();

  /**
   * @deprecated Use {@link ApplyFormRequested}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (applyFormRequested) keeps working. Must stay AFTER ApplyFormRequested: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() applyFormRequested = this.ApplyFormRequested;

  /**
   * Bubbled up from inline-editable viewer plugins (`SupportsInlineEdit === true`) when
   * the user commits changes on an inline OLE canvas or editor (§ 3.4.1).
   */
  @Output() ContentCommitted = new EventEmitter<string>();

  /** Bubbled up from plugins when active heading/block/cell/slide selection changes (`NW-6`). */
  @Output() SelectionChanged = new EventEmitter<ArtifactSelectionAnchor>();

  /** CamelCase alias for {@link SelectionChanged}. */
  @Output() selectionChanged = this.SelectionChanged;

  @ViewChild('viewerContainer', { read: ViewContainerRef, static: true })
  ViewerContainer!: ViewContainerRef;

  /** @deprecated Use {@link ViewerContainer}. */
  get viewerContainer(): ViewContainerRef {
    return this.ViewerContainer;
  }
  /** @deprecated Use {@link ViewerContainer}. */
  set viewerContainer(value: ViewContainerRef) {
    this.ViewerContainer = value;
  }

  public isLoading = true;
  public error: string | null = null;
  public ErrorDetails: string | null = null;

  /** @deprecated Use {@link ErrorDetails}. */
  public get errorDetails(): string | null {
    return this.ErrorDetails;
  }
  /** @deprecated Use {@link ErrorDetails}. */
  public set errorDetails(value: string | null) {
    this.ErrorDetails = value;
  }
  public ErrorTitle: string | null = null;

  /** @deprecated Use {@link ErrorTitle}. */
  public get errorTitle(): string | null {
    return this.ErrorTitle;
  }
  /** @deprecated Use {@link ErrorTitle}. */
  public set errorTitle(value: string | null) {
    this.ErrorTitle = value;
  }

  private componentRef: ComponentRef<BaseArtifactViewerPluginComponent> | null = null;
  private pluginSubscriptions: Subscription[] = [];

  /**
   * Get the loaded plugin instance (if available)
   */
  public get PluginInstance(): BaseArtifactViewerPluginComponent | null {
    return this.componentRef?.instance as BaseArtifactViewerPluginComponent || null;
  }

  /** @deprecated Use {@link PluginInstance}. */
  public get pluginInstance(): BaseArtifactViewerPluginComponent | null {
    return this.PluginInstance;
  }

  /**
   * Whether the loaded plugin supports user feedback.
   * Pass-through to the plugin instance for use by the parent panel wrapper.
   */
  public get SupportsFeedback(): boolean {
    return this.PluginInstance?.SupportsFeedback ?? false;
  }

  /**
   * Ask the loaded plugin to show its feedback UX.
   * Pass-through to the plugin instance, called from the parent panel header.
   */
  public AskUserForFeedback(): void {
    this.PluginInstance?.AskUserForFeedback();
  }

  /**
   * Whether the loaded plugin can export what it shows as a PDF.
   * Pass-through to the plugin instance for use by the parent panel wrapper.
   */
  public get SupportsPDFExport(): boolean {
    return this.PluginInstance?.SupportsPDFExport ?? false;
  }

  /**
   * Whether the loaded plugin supports inline OLE editing (`[readonly]="false"`).
   */
  public get SupportsInlineEdit(): boolean {
    return this.PluginInstance?.SupportsInlineEdit ?? false;
  }

  /**
   * Ask the loaded plugin to download what it shows as a PDF.
   * Pass-through to the plugin instance, called from the parent panel header.
   */
  public async ExportPDF(orientation: PdfOrientation = 'portrait'): Promise<void> {
    await this.PluginInstance?.ExportPDF(orientation);
  }

  async ngOnInit(): Promise<void> {
    if (this.initialized) {
      return;
    }
    this.initialized = true;
    await this.loadViewer();
  }

  ngOnDestroy(): void {
    this.destroyCurrentViewer();
  }

  /**
   * Collects normalized ancestor Artifact IDs from both hierarchical DI (`MJ_EMBEDDED_ARTIFACT_ANCESTORS`)
   * and the explicit `AncestorArtifactIDs` `@Input()`.
   */
  private collectEffectiveAncestors(): Set<string> {
    const ancestors = new Set<string>();
    if (this.parentAncestors) {
      for (const id of this.parentAncestors) {
        const normalized = id.trim().toLowerCase();
        if (normalized) {
          ancestors.add(normalized);
        }
      }
    }
    if (this._ancestorArtifactIDs) {
      for (const id of this._ancestorArtifactIDs) {
        const normalized = id.trim().toLowerCase();
        if (normalized) {
          ancestors.add(normalized);
        }
      }
    }
    return ancestors;
  }

  /**
   * Load the appropriate viewer plugin for the artifact
   */
  private async loadViewer(): Promise<void> {
    const seq = ++this.loadSequence;
    try {
      this.isLoading = true;
      this.error = null;
      this.ErrorTitle = null;
      this.ErrorDetails = null;

      if (!this.artifactVersion) {
        this.setError(
          'Missing Artifact Data',
          'Unable to display this artifact because the version information is missing.',
          'artifactVersion is null or undefined'
        );
        this.isLoading = false;
        return;
      }

      const explicitDriverClass = this._driverClass?.trim() || null;

      if (!explicitDriverClass && !this.ArtifactTypeName) {
        this.setError(
          'Missing Artifact Type',
          'Unable to display this artifact because the type information is missing.',
          'artifactTypeName is empty'
        );
        this.isLoading = false;
        return;
      }

      // Guard against recursive/circular embedded OLE artifacts and excessive nesting depth
      const currentArtifactId = (this.artifactVersion.ArtifactID ?? '').trim().toLowerCase();
      const effectiveAncestors = this.collectEffectiveAncestors();
      if (currentArtifactId && effectiveAncestors.has(currentArtifactId)) {
        this.destroyCurrentViewer();
        this.setError(
          'Circular Embed Blocked',
          'Cannot display this embedded artifact because it references itself in an embed loop.',
          `Circular reference detected for artifact ${currentArtifactId} (chain: ${[...effectiveAncestors].join(' -> ')})`
        );
        this.isLoading = false;
        return;
      }
      if (effectiveAncestors.size >= MJ_MAX_EMBED_DEPTH) {
        this.destroyCurrentViewer();
        this.setError(
          'Maximum Embed Depth Exceeded',
          `Embedded artifacts are limited to ${MJ_MAX_EMBED_DEPTH} nesting levels.`,
          `Embed depth ${effectiveAncestors.size + 1} exceeds MJ_MAX_EMBED_DEPTH (${MJ_MAX_EMBED_DEPTH})`
        );
        this.isLoading = false;
        return;
      }

      // Resolve DriverClass either from explicit override (pre-auth guest share) or metadata type
      let driverClass: string | null = explicitDriverClass;
      if (!driverClass) {
        const artifactType = await this.getArtifactType();
        if (seq !== this.loadSequence) {
          return;
        }
        if (artifactType) {
          // Resolve DriverClass by traversing parent hierarchy if needed
          driverClass = await this.resolveDriverClass(artifactType);
          if (seq !== this.loadSequence) {
            return;
          }
        } else {
          driverClass = this.resolveBuiltinFallbackDriverClass(this.ArtifactTypeName);
          if (!driverClass) {
            this.setError(
              'Unknown Artifact Type',
              `The artifact type "${this.ArtifactTypeName}" is not recognized. This might be a custom type that hasn't been properly configured.`,
              `Artifact type "${this.ArtifactTypeName}" not found in metadata`
            );
            this.isLoading = false;
            return;
          }
        }
      }

      if (!driverClass) {
        this.setError(
          'No Viewer Available',
          `This artifact type (${this.ArtifactTypeName}) doesn't have a viewer component configured. The artifact content may need to be viewed in the JSON tab.`,
          `No DriverClass in hierarchy and content is not valid JSON`
        );
        this.isLoading = false;
        return;
      }

      // Keep the existing live component instance when only artifactVersion changes on the same artifact & driver
      const currentVersionId = (this.artifactVersion.ID ?? '').trim().toLowerCase();
      const sameArtifactLoaded =
        this.componentRef !== null &&
        this.loadedDriverClass === driverClass &&
        ((currentArtifactId.length > 0 && this.loadedArtifactID === currentArtifactId) ||
          (currentArtifactId.length === 0 && currentVersionId.length > 0 && this.loadedVersionID === currentVersionId));
      if (sameArtifactLoaded && this.componentRef) {
        this.applyPluginInputs(this.componentRef);
        this.componentRef.changeDetectorRef.detectChanges();
        this.loadedVersionID = currentVersionId;
        this.isLoading = false;
        return;
      }

      // Look up the registered component class from ClassFactory WITHOUT instantiating it,
      // so Angular's createComponent can properly instantiate it within the Angular injection context.
      const registration = await MJGlobal.Instance.ClassFactory.GetRegistrationAsync(
        BaseArtifactViewerPluginComponent,
        driverClass
      );

      if (!registration?.SubClass) {
        this.setError(
          'Viewer Component Not Found',
          `The viewer component "${driverClass}" is not registered in the application. This usually means the required package or module hasn't been loaded.`,
          `Component "${driverClass}" not found in ClassFactory registry. Ensure it's registered with @RegisterClass(BaseArtifactViewerPluginComponent, '${driverClass}').`
        );
        this.isLoading = false;
        return;
      }

      // Get the component type from the registration
      const componentType = registration.SubClass as Type<BaseArtifactViewerPluginComponent>;

      // Destroy previous viewer if exists
      this.destroyCurrentViewer();

      // Provide updated ancestor chain to any nested OLE embeds rendered inside this plugin
      const nextAncestors = new Set<string>(effectiveAncestors);
      if (currentArtifactId) {
        nextAncestors.add(currentArtifactId);
      }
      const childInjector = Injector.create({
        providers: [{ provide: MJ_EMBEDDED_ARTIFACT_ANCESTORS, useValue: nextAncestors }],
        parent: this.injector,
      });

      // Create and configure the viewer component
      this.componentRef = this.ViewerContainer.createComponent(componentType, {
        injector: childInjector,
      });
      this.loadedDriverClass = driverClass;
      this.loadedArtifactID = currentArtifactId;
      this.loadedVersionID = currentVersionId;

      this.applyPluginInputs(this.componentRef);

      // Subscribe to OpenEntityRecord / legacy openEntityRecord event if the plugin emits it
      const componentInstance = this.componentRef.instance;
      const openRecordEmitter = componentInstance.OpenEntityRecord ?? componentInstance.openEntityRecord;
      if (openRecordEmitter) {
        this.pluginSubscriptions.push(
          openRecordEmitter.subscribe((event: {entityName: string; compositeKey: CompositeKey}) => {
            this.OpenEntityRecord.emit(event);
          })
        );
      }

      // Subscribe to navigationRequest event if the plugin emits it
      if (componentInstance.navigationRequest) {
        this.pluginSubscriptions.push(
          componentInstance.navigationRequest.subscribe((event: NavigationRequest) => {
            this.navigationRequest.emit(event);
          })
        );
      }

      // Subscribe to tabsChanged event if the plugin emits it (e.g., after async spec loading)
      if (componentInstance.tabsChanged) {
        this.pluginSubscriptions.push(
          componentInstance.tabsChanged.subscribe(() => {
            this.tabsChanged.emit();
          })
        );
      }

      // Subscribe to the form-aware "Apply to my form" event when the
      // underlying plugin is a component-artifact-viewer rendering a
      // form-role spec. Other plugin types don't have this output.
      const formAwarePlugin = componentInstance as BaseArtifactViewerPluginComponent & {
        applyFormRequested?: EventEmitter<{ spec: ComponentSpec; entityName: string }>;
      };
      if (formAwarePlugin.applyFormRequested) {
        this.pluginSubscriptions.push(
          formAwarePlugin.applyFormRequested.subscribe(
            (event: { spec: ComponentSpec; entityName: string }) => {
              this.ApplyFormRequested.emit(event);
            }
          )
        );
      }

      if (componentInstance.ContentCommitted) {
        this.pluginSubscriptions.push(
          componentInstance.ContentCommitted.subscribe((serializedContent: string) => {
            this.ContentCommitted.emit(serializedContent);
          })
        );
      }

      if (componentInstance.SelectionChanged) {
        this.pluginSubscriptions.push(
          componentInstance.SelectionChanged.subscribe((selection: ArtifactSelectionAnchor) => {
            this.SelectionChanged.emit(selection);
          })
        );
      }

      // Trigger change detection
      this.componentRef.changeDetectorRef.detectChanges();

      this.isLoading = false;

      // Notify parent that plugin has loaded (for tab selection timing)
      this.PluginLoaded.emit();
    } catch (err) {
      console.error('Error loading artifact viewer:', err);
      LogError(err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorStack = err instanceof Error && err.stack ? err.stack : undefined;
      this.setError(
        'Failed to Load Viewer',
        'An unexpected error occurred while loading the artifact viewer. Please try refreshing the page or contact support if the problem persists.',
        errorStack || errorMessage
      );
      this.isLoading = false;
    }
  }

  private applyPluginInputs(componentRef: ComponentRef<BaseArtifactViewerPluginComponent>): void {
    componentRef.setInput('artifactVersion', this.artifactVersion);
    if (this.Provider) {
      componentRef.setInput('Provider', this.Provider);
    }
    if (this.height !== undefined) {
      componentRef.setInput('height', this.height);
    }
    if (this.readonly !== undefined) {
      componentRef.setInput('readonly', this.readonly);
    }
    if (this.cssClass !== undefined) {
      componentRef.setInput('cssClass', this.cssClass);
    }
    if (this.ContentType !== undefined) {
      componentRef.setInput('contentType', this.ContentType);
    }
    if (this.VisibleVersionNumbers) {
      componentRef.setInput('VisibleVersionNumbers', this.VisibleVersionNumbers);
    }
    if (this._preVerifiedFrozenSnapshots !== null) {
      componentRef.setInput('PreVerifiedFrozenSnapshots', this._preVerifiedFrozenSnapshots);
    }
    if (this._guestSnapshotMode) {
      componentRef.setInput('GuestSnapshotMode', true);
    }
    if (this._viewerViewMode !== undefined) {
      componentRef.setInput('ViewMode', this._viewerViewMode);
    }
    if (this._navigationAnchor !== null) {
      componentRef.setInput('NavigationAnchor', this._navigationAnchor);
    }
  }

  /**
   * Set a structured error message with title, user-friendly description, and technical details
   */
  private setError(title: string, userMessage: string, technicalDetails: string): void {
    this.ErrorTitle = title;
    this.error = userMessage;
    this.ErrorDetails = technicalDetails;
  }

  /**
   * Get the artifact type entity for the current artifact using the provider-scoped ArtifactMetadataEngine
   */
  private async getArtifactType(): Promise<MJArtifactTypeEntity | null> {
    try {
      const engine = this.Provider
        ? (ArtifactMetadataEngine.GetProviderInstance(
            this.Provider,
            ArtifactMetadataEngine
          ) as ArtifactMetadataEngine)
        : ArtifactMetadataEngine.Instance;
      const artifactType = engine.FindArtifactType(this.ArtifactTypeName);
      return artifactType || null;
    } catch (err) {
      console.error('Error loading artifact type:', err);
      return null;
    }
  }

  /**
   * Fallback mapping for canonical built-in artifact types when `ArtifactMetadataEngine` has not
   * yet been populated (e.g., in standalone OLE embeds or isolated component tests).
   */
  private resolveBuiltinFallbackDriverClass(typeName: string): string | null {
    const builtinMap: Record<string, string> = {
      'Markdown Document': 'MarkdownArtifactViewerPlugin',
      'Whiteboard': 'WhiteboardArtifactViewerPlugin',
      'Presentation': 'SlideDeckArtifactViewerPlugin',
      'Excel Spreadsheet': 'SpreadsheetArtifactViewerPlugin',
    };
    return builtinMap[typeName] ?? null;
  }

  /**
   * Resolves the DriverClass for an artifact type by traversing up the parent hierarchy.
   * Falls back to JSON viewer if content is valid JSON and no DriverClass is found.
   *
   * @param artifactType The artifact type to resolve the DriverClass for
   * @param visitedIds Set of already-visited ArtifactType IDs to prevent infinite parent cycles
   * @returns The DriverClass string, or null if none found and no JSON fallback available
   */
  private async resolveDriverClass(
    artifactType: MJArtifactTypeEntity,
    visitedIds = new Set<string>()
  ): Promise<string | null> {
    if (artifactType.ID) {
      if (visitedIds.has(artifactType.ID)) {
        return this.checkJsonFallback();
      }
      visitedIds.add(artifactType.ID);
    }

    // Check if current artifact type has a DriverClass
    if (artifactType.DriverClass) {
      return artifactType.DriverClass;
    }

    // No DriverClass on current type - check if it has a parent
    if (artifactType.ParentID) {
      const parentType = await this.getArtifactTypeById(artifactType.ParentID);

      if (parentType) {
        // Recursively check parent
        return await this.resolveDriverClass(parentType, visitedIds);
      } else {
        console.warn(`⚠️ Parent artifact type '${artifactType.ParentID}' not found`);
      }
    }

    // Reached root with no DriverClass - check for JSON fallback
    return this.checkJsonFallback();
  }

  /**
   * Loads an artifact type by ID
   */
  private async getArtifactTypeById(id: string): Promise<MJArtifactTypeEntity | null> {
    try {
      const md = this.ProviderToUse;
      const artifactType = await md.GetEntityObject<MJArtifactTypeEntity>('MJ: Artifact Types');
      const loaded = await artifactType.Load(id);

      if (loaded) {
        return artifactType;
      }

      return null;
    } catch (err) {
      console.error('Error loading artifact type by ID:', err);
      return null;
    }
  }

  /**
   * Checks if the artifact content is valid JSON and returns the JSON viewer plugin if so
   */
  private checkJsonFallback(): string | null {
    if (!this.artifactVersion || !this.artifactVersion.Content) {
      console.log('❌ No content available for JSON fallback');
      return null;
    }

    try {
      // Try to parse the content as JSON
      JSON.parse(this.artifactVersion.Content);
      console.log('✅ Content is valid JSON, using JsonArtifactViewerPlugin as fallback');
      return 'JsonArtifactViewerPlugin';
    } catch {
      console.log('❌ Content is not valid JSON, no fallback available');
      return null;
    }
  }

  /**
   * Destroy the current viewer component and unsubscribe all dynamic plugin EventEmitter listeners.
   */
  private destroyCurrentViewer(): void {
    for (const sub of this.pluginSubscriptions) {
      sub.unsubscribe();
    }
    this.pluginSubscriptions = [];
    if (this.componentRef) {
      this.componentRef.destroy();
      this.componentRef = null;
    }
    this.loadedDriverClass = null;
    this.loadedArtifactID = null;
    this.loadedVersionID = null;
    this.ViewerContainer?.clear();
  }
}
