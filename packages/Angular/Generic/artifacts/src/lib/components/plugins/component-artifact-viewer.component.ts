import { Component, ViewChild, AfterViewInit, OnInit, OnChanges, SimpleChanges, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { RegisterClass, SafeJSONParse } from '@memberjunction/global';
import { BaseArtifactViewerPluginComponent, ArtifactViewerTab } from '../base-artifact-viewer.component';
import { MJReactComponent, AngularAdapterService } from '@memberjunction/ng-react';
import { BuildComponentCompleteCode, ComponentSpec } from '@memberjunction/interactive-component-types';
import { isFormRole, getDeclaredFormEntityName } from '@memberjunction/interactive-component-types/forms';
import { BaseEntity, CompositeKey, DataSnapshot, EntityInfo, LogError, RunView } from '@memberjunction/core';
import { DataRequirementsViewerComponent } from './data-requirements-viewer/data-requirements-viewer.component';
import { evaluateComponentPermissions, PermissionEvaluationResult } from './component-permission-evaluation';

/**
 * Viewer component for interactive Component artifacts (React-based UI components)
 *
 * Features:
 * - Live component preview with React rendering
 * - Dynamic tabs for component metadata (via GetAdditionalTabs)
 * - Provides tabs for: Code, Functional Requirements, Technical Design, Data Requirements
 */
@Component({
  standalone: false,
  selector: 'mj-component-artifact-viewer',
  templateUrl: './component-artifact-viewer.component.html',
  styleUrls: ['./component-artifact-viewer.component.css']
})
@RegisterClass(BaseArtifactViewerPluginComponent, 'ComponentArtifactViewerPlugin')
export class ComponentArtifactViewerComponent extends BaseArtifactViewerPluginComponent implements OnInit, AfterViewInit, OnChanges {
  @ViewChild('reactComponent') reactComponent?: MJReactComponent;
  @Output() tabsChanged = new EventEmitter<void>();
  @Output() openEntityRecord = new EventEmitter<{entityName: string; compositeKey: CompositeKey}>();

  /**
   * Emitted when the user clicks "Apply to my form" on a form-role artifact.
   * Carries the spec (ready to hand to the agent's Create/Modify action) and
   * the entity name. The host is responsible for confirming + invoking the
   * actual server action.
   */
  @Output() applyFormRequested = new EventEmitter<{ spec: ComponentSpec; entityName: string }>();

  // ── Form-aware state (only populated when componentRole === 'form') ──

  /** True when this artifact's spec declares `componentRole: 'form'`. */
  public isFormArtifact = false;

  /** Entity the form targets — resolved from spec.entityName / dataRequirements. */
  public formEntityInfo: EntityInfo | null = null;

  /** The real or fixture record currently bound to the form preview. */
  public formRecord: BaseEntity | null = null;

  /** True iff `formRecord` is a real DB row (vs a fixture NewRecord()). */
  public formRecordIsReal = false;

  /** Label for the chip (e.g. the record's Name field). */
  public formRecordLabel = '';

  /** Picker UI state. */
  public showRecordPicker = false;
  public recordSearchTerm = '';
  public recordSearchResults: Array<{ ID: string; Label: string }> = [];
  public formInitError: string | null = null;

  // Component data
  public component: ComponentSpec | null = null;
  public componentCode: string = "";
  public componentName: string = '';

  /**
   * Cached resolved spec from the registry, preserved even after the React component
   * is destroyed (e.g., when a render error removes <mj-react-component> from the DOM).
   */
  private _cachedResolvedSpec: ComponentSpec | null = null;

  public get resolvedComponentSpec(): ComponentSpec | null {
    // Prefer the live React component's resolved spec (most up-to-date),
    // then fall back to our cached copy (survives DOM destruction),
    // then fall back to the stripped local spec as last resort.
    return this.reactComponent?.resolvedComponentSpec || this._cachedResolvedSpec || this.component;
  }

  // Feedback panel
  public ShowFeedbackPanel = false;

  // Error state
  public hasError = false;
  public errorMessage = '';
  public errorDetails = '';

  // Permission state
  public permissionResult: PermissionEvaluationResult | null = null;

  /**
   * Whether this plugin has content to display in the Display tab.
   * Returns true only if the component has code that can be rendered.
   *
   * IMPORTANT: Uses this.component (synchronously loaded from artifact JSON)
   * instead of resolvedComponentSpec (which depends on async React loading).
   * This ensures hasDisplayContent returns correct value immediately when
   * pluginLoaded fires, before React component finishes loading.
   */
  public override get hasDisplayContent(): boolean {
    // Use this.component directly - it's available synchronously after loadComponentSpec()
    return !!this.component?.namespace || !!this.component?.code
  }

  constructor(private adapter: AngularAdapterService, private cdr: ChangeDetectorRef) {
    super();
  }

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    // When artifactVersion input changes, reload the component spec
    if (changes['artifactVersion']) {
      this.loadComponentSpec();
      // Notify parent that tabs may have changed (on subsequent changes)
      if (!changes['artifactVersion'].firstChange) {
        this.tabsChanged.emit();
      }
    }
  }

  /**
   * Synchronously load the component spec from artifact content.
   * This is intentionally synchronous so that tabs are available immediately
   * when the parent queries GetAdditionalTabs() after pluginLoaded fires.
   *
   * The bridge purges the runtime registry + manager fetch cache itself when
   * it (re)initializes for the new spec, so we don't need to clear caches
   * from here — the bridge instance may not even exist yet when ngOnChanges
   * fires for the first time.
   */
  private loadComponentSpec(): void {
    try {
      // Clear cached resolved spec from previous version so stale data doesn't persist
      this._cachedResolvedSpec = null;
      this.permissionResult = null;

      if (this.artifactVersion?.Content) {
        this.component = SafeJSONParse(this.artifactVersion.Content) as ComponentSpec;
        this.extractComponentParts();
        this.evaluatePermissions();
        // Form-aware detection. Done here (not in ngAfterViewInit) so the
        // template's `@if (isFormArtifact)` branch decides which preview
        // to mount on the very first render — no flash of the non-form
        // path before the form-aware UI takes over.
        this.detectAndInitFormArtifact();
      } else {
        throw new Error('Artifact content is empty');
      }
    } catch (error) {
      console.error('Failed to load component spec:', error);
      this.hasError = true;
      this.errorMessage = 'Failed to load component';
      this.errorDetails = error instanceof Error ? error.message : String(error);
    }
  }

  /**
   * Evaluate whether the current user has sufficient permissions for
   * all entities and queries referenced in the component's dataRequirements.
   * Uses the best available spec: resolved (from registry) > cached > stripped artifact.
   * Runs synchronously against already-loaded client-side metadata.
   */
  private evaluatePermissions(): void {
    const spec = this.resolvedComponentSpec;
    if (!spec) return;

    const provider = this.ProviderToUse;
    const currentUser = provider.CurrentUser;
    if (!currentUser) return; // No user context — skip check

    this.permissionResult = evaluateComponentPermissions(spec, currentUser, provider);
  }

  /** Whether the component should be blocked from rendering due to missing permissions. */
  public get isPermissionBlocked(): boolean {
    return !!this.permissionResult && !this.permissionResult.canRun;
  }

  /**
   * Component initialization.
   * Note: loadComponentSpec() is called in ngOnChanges which runs before ngOnInit,
   * ensuring tabs are available when pluginLoaded fires.
   * The async adapter initialization happens here and doesn't block tab availability.
   */
  async ngOnInit(): Promise<void> {
    // Initialize Angular adapter for React components (async operation)
    try {
      await this.adapter.initialize();
    } catch (error) {
      console.error('Failed to initialize Angular adapter:', error);
      this.hasError = true;
      this.errorMessage = 'Failed to initialize component runtime';
      this.errorDetails = error instanceof Error ? error.message : String(error);
    }
  }

  async ngAfterViewInit(): Promise<void> {
    // Component initialization happens automatically via mj-react-component
  }

  /**
   * Provide additional tabs for viewing component metadata
   */
  public GetAdditionalTabs(): ArtifactViewerTab[] {
    const tabs: ArtifactViewerTab[] = [];

    const resolvedComponent = this.resolvedComponentSpec;

    if (!resolvedComponent) {
      return tabs;
    }

    // Functional Requirements tab
    if (resolvedComponent.functionalRequirements) {
      tabs.push({
        label: 'Functional',
        icon: 'fa-clipboard-list',
        contentType: 'markdown',
        content: resolvedComponent.functionalRequirements
      });
    }

    // Technical Design tab
    if (resolvedComponent.technicalDesign) {
      tabs.push({
        label: 'Technical',
        icon: 'fa-wrench',
        contentType: 'markdown',
        content: resolvedComponent.technicalDesign
      });
    }

    // Data Requirements tab - uses custom component for rich visualization
    if (resolvedComponent.dataRequirements) {
      tabs.push({
        label: 'Data',
        icon: 'fa-database',
        contentType: 'component',
        component: DataRequirementsViewerComponent,
        componentInputs: { dataRequirements: resolvedComponent.dataRequirements }
      });
    }

    // Code tab (lazy-loaded) - only show if there's actual code
    if (resolvedComponent.code && resolvedComponent.code.trim()) {
      tabs.push({
        label: 'Code',
        icon: 'fa-code',
        contentType: 'code',
        language: 'typescript',
        content: () => BuildComponentCompleteCode(resolvedComponent)
      });
    }

    // Spec tab - Shows fully resolved component spec in JSON format (rightmost)
    tabs.push({
      label: 'Spec',
      icon: 'fa-file-code',
      contentType: 'json',
      content: () => JSON.stringify(resolvedComponent, null, 2),
      language: 'json'
    });

    return tabs;
  }

  /**
   * Remove standard JSON tab since we provide "Resolved JSON" custom tab
   * The custom tab shows the fully resolved component spec instead of raw artifact JSON
   */
  public GetStandardTabRemovals(): string[] {
    return ['JSON'];
  }

  private extractComponentParts(): void {
    if (this.resolvedComponentSpec?.name) {
      this.componentName = this.resolvedComponentSpec.name;
    }
    if (this.resolvedComponentSpec?.code) {
      this.componentCode = BuildComponentCompleteCode(this.resolvedComponentSpec);
    }
  }

  /**
   * Called when MJReactComponent finishes loading the full component spec from the registry.
   * The full spec may contain Functional, Technical, and Data tabs not in the stripped spec.
   * Caches the resolved spec so it survives DOM destruction (e.g., if the component fails to
   * render and <mj-react-component> is removed by the @if/else block).
   * Emits tabsChanged so the parent panel re-evaluates allTabs and renders the new tab labels.
   */
  onReactComponentInitialized(): void {
    if (this.reactComponent?.resolvedComponentSpec &&
        this.reactComponent.resolvedComponentSpec !== this.component) {
      // Cache the resolved spec so it's available even after the React component is destroyed
      this._cachedResolvedSpec = this.reactComponent.resolvedComponentSpec;
      this.tabsChanged.emit();

      // Re-evaluate permissions against the resolved spec — the stripped artifact
      // spec has no dataRequirements, so the initial check in loadComponentSpec()
      // passes trivially. The resolved spec from the registry contains the full
      // dataRequirements with entity and query references.
      this.evaluatePermissions();
    }
  }

  onComponentEvent(event: unknown): void {
    console.log('Component event:', event);

    // Handle error events from React component
    if (event && typeof event === 'object' && 'type' in event && event.type === 'error') {
      const errorEvent = event as { type: 'error'; payload: { error: string; source: string } };
      this.hasError = true;
      this.errorMessage = 'Component Failed to Load';
      this.errorDetails = errorEvent.payload.error || 'Unknown error occurred while loading the component';
    }
  }

  /**
   * Handle entity record open request from React component
   * Propagates the event up to parent components
   */
  onOpenEntityRecord(event: {entityName: string; key: CompositeKey}): void {
    // Transform to use 'compositeKey' name for consistency with Angular components
    this.openEntityRecord.emit({
      entityName: event.entityName,
      compositeKey: event.key
    });
  }

  public override GetCurrentStateSnapshot(): DataSnapshot | null {
    // First try the component's explicit or auto-captured data state.
    // MJReactComponent.getCurrentDataState() already includes the fallback
    // to intercepted RunView/RunQuery results when the React component
    // doesn't register getCurrentDataState() via callbacks.RegisterMethod.
    const dataState = this.reactComponent?.getCurrentDataState?.();
    if (dataState && typeof dataState === 'object') {
      return dataState as DataSnapshot;
    }

    // Fallback for components with no captured data — static mockups,
    // pure-display components, or components whose data hooks haven't fired.
    // Rather than short-circuit Analyze with "No data available", emit a
    // minimal snapshot so the user can still open an agent conversation about
    // the component. The artifact itself is attached to the conversation as an
    // Input junction, so the agent can reason from the spec + any static data
    // baked into the component code.
    const spec = this.resolvedComponentSpec;
    if (!spec) return null;

    const snap = new DataSnapshot();
    snap.title = spec.title || spec.name || this.getDisplayTitle() || undefined;
    snap.interpretation =
      `Interactive component artifact${spec.name ? ` "${spec.name}"` : ''}. ` +
      `No live data was captured — the component either has no data-fetching ` +
      `hooks or has not yet run its queries. The component specification is ` +
      `attached to this conversation; the agent should inspect it directly.`;
    return snap;
  }

  /**
   * Component artifacts support feedback when a resolved spec is available.
   */
  public override get SupportsFeedback(): boolean {
    return !!this.resolvedComponentSpec;
  }

  /**
   * Toggle the feedback panel open. Called from the artifact viewer header button.
   */
  public override AskUserForFeedback(): void {
    this.ShowFeedbackPanel = !this.ShowFeedbackPanel;
  }

  // ════════════════════════════════════════════════════════════════════
  // FORM-AWARE BRANCH
  //
  // When the artifact's spec declares `componentRole: 'form'`, the viewer
  // delegates rendering to `<mj-interactive-form>` instead of the raw
  // `<mj-react-component>` path. This gives the React form a proper
  // FormHostProps binding (bound to a real DB record by default) and lets
  // the user swap records via a search picker before applying.
  //
  // Triggered from `loadComponentSpec()` after the spec parses.
  // ════════════════════════════════════════════════════════════════════

  /**
   * Detect form-role and kick off entity + record resolution. Failure modes
   * (missing entity, RunView failure, entity has no rows) fall back to a
   * synthetic record from `BaseEntity.NewRecord()` so the form still mounts
   * against type-appropriate empty values.
   */
  private async detectAndInitFormArtifact(): Promise<void> {
    this.isFormArtifact = false;
    this.formEntityInfo = null;
    this.formRecord = null;
    this.formRecordIsReal = false;
    this.formRecordLabel = '';
    this.formInitError = null;

    const spec = this.component;
    if (!spec || !isFormRole(spec)) return;

    this.isFormArtifact = true;

    const entityName = getDeclaredFormEntityName(spec);
    if (!entityName) {
      this.formInitError = 'Form artifact has no declared entity. Showing without record context.';
      return;
    }

    const provider = this.ProviderToUse;
    const entity = provider?.EntityByName(entityName);
    if (!entity) {
      this.formInitError = `Entity "${entityName}" not registered with the active provider.`;
      return;
    }
    this.formEntityInfo = entity;

    // Load Top-1 record by default. If empty / fails, fall back to a fresh
    // synthetic record. Either way the form mounts — failure to find a real
    // record is informational, not fatal.
    const record = await this.loadTopOneRecord(entity);
    if (record) {
      this.formRecord = record;
      this.formRecordIsReal = true;
      this.formRecordLabel = this.computeRecordLabel(record);
    } else {
      this.formRecord = await this.buildFixtureRecord(entity);
      this.formRecordIsReal = false;
      this.formRecordLabel = 'Mock data';
    }
    // This runs after an await on a RunView that resolves outside Angular's zone,
    // so nothing would refresh the view until the next user event — leaving the
    // "Could not bind a record" message up until the user clicks. Force CD so the
    // auto-loaded record binds and the form mounts immediately on first render.
    this.cdr.detectChanges();
  }

  /**
   * Load the first row by NameField (then __mj_CreatedAt) so different users
   * opening the same form-role artifact see the same record bound to the
   * preview. (Retrospective fix #7 — un-ordered Top-1 was physical-order
   * and non-deterministic.)
   */
  private async loadTopOneRecord(entity: EntityInfo): Promise<BaseEntity | null> {
    try {
      const orderBy = entity.NameField?.Name
        ? `${entity.NameField.Name} ASC`
        : `__mj_CreatedAt DESC`;
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const result = await rv.RunView<BaseEntity>({
        EntityName: entity.Name,
        MaxRows: 1,
        OrderBy: orderBy,
        ResultType: 'entity_object',
      }, this.ProviderToUse.CurrentUser);
      if (result.Success && (result.Results?.length ?? 0) > 0) {
        return result.Results[0];
      }
    } catch (err) {
      LogError(`ComponentArtifactViewer: Top-1 RunView failed for ${entity.Name}: ${err instanceof Error ? err.message : String(err)}`);
    }
    return null;
  }

  /** Synthetic "create-mode" record when no real row exists or RunView failed. */
  private async buildFixtureRecord(entity: EntityInfo): Promise<BaseEntity | null> {
    try {
      const fresh = await this.ProviderToUse.GetEntityObject<BaseEntity>(entity.Name, this.ProviderToUse.CurrentUser);
      fresh.NewRecord();
      return fresh;
    } catch (err) {
      LogError(`ComponentArtifactViewer: failed to build fixture record for ${entity.Name}: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  /** Pull a human-readable label from the record's NameField or first text field. */
  private computeRecordLabel(record: BaseEntity): string {
    const nameField = record.EntityInfo.NameField?.Name;
    if (nameField) {
      const v = record.Get(nameField);
      if (v != null && String(v).trim().length > 0) return String(v);
    }
    if (record.PrimaryKey?.HasValue) return record.PrimaryKey.ToConcatenatedString();
    return record.EntityInfo.Name;
  }

  /**
   * Search-as-you-type for the picker. Queries by name field (or any
   * indexed string field, best-effort). Limits to 8 hits for tightness.
   */
  public async onPickerSearchInput(term: string): Promise<void> {
    this.recordSearchTerm = term;
    if (!this.formEntityInfo || term.trim().length === 0) {
      this.recordSearchResults = [];
      return;
    }
    const nameField = this.formEntityInfo.NameField?.Name;
    if (!nameField) {
      this.recordSearchResults = [];
      return;
    }
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      // Best-effort LIKE filter against the entity's name field. Wrap the
      // term so we don't break SQL — RunView passes ExtraFilter as-is.
      const safe = term.replace(/'/g, "''");
      const result = await rv.RunView<BaseEntity>({
        EntityName: this.formEntityInfo.Name,
        ExtraFilter: `${nameField} LIKE '%${safe}%'`,
        MaxRows: 8,
        ResultType: 'entity_object',
      }, this.ProviderToUse.CurrentUser);
      if (result.Success) {
        this.recordSearchResults = (result.Results ?? []).map(r => ({
          ID: r.PrimaryKey?.ToConcatenatedString() ?? '',
          Label: this.computeRecordLabel(r),
        }));
      }
    } catch (err) {
      LogError(`ComponentArtifactViewer: picker search failed: ${err instanceof Error ? err.message : String(err)}`);
      this.recordSearchResults = [];
    }
  }

  /** User picked a different record from the search results. Re-bind the form. */
  public async onPickerSelect(item: { ID: string; Label: string }): Promise<void> {
    if (!this.formEntityInfo) return;
    try {
      const rec = await this.ProviderToUse.GetEntityObject<BaseEntity>(
        this.formEntityInfo.Name, this.ProviderToUse.CurrentUser,
      );
      const pk = new CompositeKey();
      pk.LoadFromURLSegment(this.formEntityInfo, item.ID);
      const loaded = await rec.InnerLoad(pk);
      if (loaded) {
        this.formRecord = rec;
        this.formRecordIsReal = true;
        this.formRecordLabel = item.Label;
        this.showRecordPicker = false;
        this.recordSearchTerm = '';
        this.recordSearchResults = [];
      }
    } catch (err) {
      LogError(`ComponentArtifactViewer: failed to load picked record ${item.ID}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Bubble Apply intent up to the host (Form Builder dashboard / Sage chat). */
  public onApplyClicked(): void {
    if (!this.component || !this.formEntityInfo) return;
    this.applyFormRequested.emit({
      spec: this.component,
      entityName: this.formEntityInfo.Name,
    });
  }
}
