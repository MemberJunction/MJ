import { Component, ViewChild, AfterViewInit, OnInit, OnChanges, SimpleChanges, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { RegisterClass, SafeJSONParse } from '@memberjunction/global';
import { BaseArtifactViewerPluginComponent, ArtifactViewerTab } from '../base-artifact-viewer.component';
import { MJReactComponent, AngularAdapterService } from '@memberjunction/ng-react';
import { BuildComponentCompleteCode, ComponentSpec } from '@memberjunction/interactive-component-types';
import {
  isFormRole, IsFormPanelRole, getDeclaredFormEntityName, GetDeclaredFormContribution,
  type FormPanelHostProps,
} from '@memberjunction/interactive-component-types/forms';
import {
  BuildFormPanelHostProps, ContributionSpecToRegistration, ResolveContributionKey,
} from '@memberjunction/ng-base-forms';
import { BaseEntity, CompositeKey, DataSnapshot, EntityInfo, LogError, RunView } from '@memberjunction/core';
import { InteractiveFormComponent } from '@memberjunction/ng-base-forms';
import { DataRequirementsViewerComponent } from './data-requirements-viewer/data-requirements-viewer.component';
import { EvaluateComponentPermissions, PermissionEvaluationResult } from './component-permission-evaluation';

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
  @ViewChild('reactComponent') ReactComponent?: MJReactComponent;

  /** @deprecated Use {@link ReactComponent}. */
  get reactComponent(): MJReactComponent | undefined {
    return this.ReactComponent;
  }
  /** @deprecated Use {@link ReactComponent}. */
  set reactComponent(value: MJReactComponent | undefined) {
    this.ReactComponent = value;
  }
  @ViewChild('panelReactComponent') PanelReactComponent?: MJReactComponent;
  @ViewChild('interactiveForm') InteractiveForm?: InteractiveFormComponent;

  /** @deprecated Use {@link InteractiveForm}. */
  get interactiveForm(): InteractiveFormComponent | undefined {
    return this.InteractiveForm;
  }
  /** @deprecated Use {@link InteractiveForm}. */
  set interactiveForm(value: InteractiveFormComponent | undefined) {
    this.InteractiveForm = value;
  }
  @Output() tabsChanged = new EventEmitter<void>();
  @Output() OpenEntityRecord = new EventEmitter<{entityName: string; compositeKey: CompositeKey}>();

  /**
   * @deprecated Use {@link OpenEntityRecord}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (openEntityRecord) keeps working. Must stay AFTER OpenEntityRecord: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() openEntityRecord = this.OpenEntityRecord;

  /**
   * Emitted when the user clicks "Apply to my form" on a form-role artifact.
   * Carries the spec (ready to hand to the agent's Create/Modify action) and
   * the entity name. The host is responsible for confirming + invoking the
   * actual server action.
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

  // ── Form-aware state (only populated when componentRole === 'form') ──

  /** True when this artifact's spec declares `componentRole: 'form'`. */
  public IsFormArtifact = false;

  /** @deprecated Use {@link IsFormArtifact}. */
  public get isFormArtifact() {
    return this.IsFormArtifact;
  }
  /** @deprecated Use {@link IsFormArtifact}. */
  public set isFormArtifact(value) {
    this.IsFormArtifact = value;
  }

  /** True for `componentRole: 'form-panel'` — a single contribution, not a whole form. */
  public IsFormPanelArtifact = false;

  /** Host props for the panel preview. Null until a record is bound. */
  public PanelPreviewProps: FormPanelHostProps | null = null;

  /** Entity the form targets — resolved from spec.entityName / dataRequirements. */
  public FormEntityInfo: EntityInfo | null = null;

  /** @deprecated Use {@link FormEntityInfo}. */
  public get formEntityInfo(): EntityInfo | null {
    return this.FormEntityInfo;
  }
  /** @deprecated Use {@link FormEntityInfo}. */
  public set formEntityInfo(value: EntityInfo | null) {
    this.FormEntityInfo = value;
  }

  /** The real or fixture record currently bound to the form preview. */
  public FormRecord: BaseEntity | null = null;

  /** @deprecated Use {@link FormRecord}. */
  public get formRecord(): BaseEntity | null {
    return this.FormRecord;
  }
  /** @deprecated Use {@link FormRecord}. */
  public set formRecord(value: BaseEntity | null) {
    this.FormRecord = value;
  }

  /** True iff `formRecord` is a real DB row (vs a fixture NewRecord()). */
  public FormRecordIsReal = false;

  /** @deprecated Use {@link FormRecordIsReal}. */
  public get formRecordIsReal() {
    return this.FormRecordIsReal;
  }
  /** @deprecated Use {@link FormRecordIsReal}. */
  public set formRecordIsReal(value) {
    this.FormRecordIsReal = value;
  }

  /** Label for the chip (e.g. the record's Name field). */
  public FormRecordLabel = '';

  /** @deprecated Use {@link FormRecordLabel}. */
  public get formRecordLabel() {
    return this.FormRecordLabel;
  }
  /** @deprecated Use {@link FormRecordLabel}. */
  public set formRecordLabel(value) {
    this.FormRecordLabel = value;
  }

  /** Picker UI state. */
  public ShowRecordPicker = false;

  /** @deprecated Use {@link ShowRecordPicker}. */
  public get showRecordPicker() {
    return this.ShowRecordPicker;
  }
  /** @deprecated Use {@link ShowRecordPicker}. */
  public set showRecordPicker(value) {
    this.ShowRecordPicker = value;
  }
  public RecordSearchTerm = '';

  /** @deprecated Use {@link RecordSearchTerm}. */
  public get recordSearchTerm() {
    return this.RecordSearchTerm;
  }
  /** @deprecated Use {@link RecordSearchTerm}. */
  public set recordSearchTerm(value) {
    this.RecordSearchTerm = value;
  }
  public RecordSearchResults: Array<{ ID: string; Label: string }> = [];

  /** @deprecated Use {@link RecordSearchResults}. */
  public get recordSearchResults(): Array<{ ID: string; Label: string }> {
    return this.RecordSearchResults;
  }
  /** @deprecated Use {@link RecordSearchResults}. */
  public set recordSearchResults(value: Array<{ ID: string; Label: string }>) {
    this.RecordSearchResults = value;
  }
  public FormInitError: string | null = null;

  /** @deprecated Use {@link FormInitError}. */
  public get formInitError(): string | null {
    return this.FormInitError;
  }
  /** @deprecated Use {@link FormInitError}. */
  public set formInitError(value: string | null) {
    this.FormInitError = value;
  }

  // Component data
  public Component: ComponentSpec | null = null;

  /** @deprecated Use {@link Component}. */
  public get component(): ComponentSpec | null {
    return this.Component;
  }
  /** @deprecated Use {@link Component}. */
  public set component(value: ComponentSpec | null) {
    this.Component = value;
  }
  public ComponentCode: string = "";

  /** @deprecated Use {@link ComponentCode}. */
  public get componentCode(): string {
    return this.ComponentCode;
  }
  /** @deprecated Use {@link ComponentCode}. */
  public set componentCode(value: string) {
    this.ComponentCode = value;
  }
  public ComponentName: string = '';

  /** @deprecated Use {@link ComponentName}. */
  public get componentName(): string {
    return this.ComponentName;
  }
  /** @deprecated Use {@link ComponentName}. */
  public set componentName(value: string) {
    this.ComponentName = value;
  }

  /**
   * Cached resolved spec from the registry, preserved even after the React component
   * is destroyed (e.g., when a render error removes <mj-react-component> from the DOM).
   */
  private _cachedResolvedSpec: ComponentSpec | null = null;

  /**
   * The React host currently mounted. A form panel previews through its own
   * `<mj-react-component>`, so both branches have to be consulted — the artifact
   * carries a registry reference without code, and only the mounted host holds
   * the spec resolved from the registry.
   */
  private get liveReactComponent(): MJReactComponent | undefined {
    return this.ReactComponent ?? this.PanelReactComponent;
  }

  public get ResolvedComponentSpec(): ComponentSpec | null {
    // Prefer the live React component's resolved spec (most up-to-date),
    // then fall back to our cached copy (survives DOM destruction),
    // then fall back to the stripped local spec as last resort.
    return this.liveReactComponent?.resolvedComponentSpec || this._cachedResolvedSpec || this.Component;
  }

  /** @deprecated Use {@link ResolvedComponentSpec}. */
  public get resolvedComponentSpec(): ComponentSpec | null {
    return this.ResolvedComponentSpec;
  }

  // Feedback panel
  public ShowFeedbackPanel = false;

  // Error state
  public HasError = false;

  /** @deprecated Use {@link HasError}. */
  public get hasError() {
    return this.HasError;
  }
  /** @deprecated Use {@link HasError}. */
  public set hasError(value) {
    this.HasError = value;
  }
  public errorMessage = '';
  public ErrorDetails = '';

  /** @deprecated Use {@link ErrorDetails}. */
  public get errorDetails() {
    return this.ErrorDetails;
  }
  /** @deprecated Use {@link ErrorDetails}. */
  public set errorDetails(value) {
    this.ErrorDetails = value;
  }

  // Permission state
  public PermissionResult: PermissionEvaluationResult | null = null;

  /** @deprecated Use {@link PermissionResult}. */
  public get permissionResult(): PermissionEvaluationResult | null {
    return this.PermissionResult;
  }
  /** @deprecated Use {@link PermissionResult}. */
  public set permissionResult(value: PermissionEvaluationResult | null) {
    this.PermissionResult = value;
  }

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
    return !!this.Component?.namespace || !!this.Component?.code
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
      this.PermissionResult = null;

      if (this.artifactVersion?.Content) {
        this.Component = SafeJSONParse(this.artifactVersion.Content) as ComponentSpec;
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
      this.HasError = true;
      this.errorMessage = 'Failed to load component';
      this.ErrorDetails = error instanceof Error ? error.message : String(error);
    }
  }

  /**
   * Evaluate whether the current user has sufficient permissions for
   * all entities and queries referenced in the component's dataRequirements.
   * Uses the best available spec: resolved (from registry) > cached > stripped artifact.
   * Runs synchronously against already-loaded client-side metadata.
   */
  private evaluatePermissions(): void {
    const spec = this.ResolvedComponentSpec;
    if (!spec) return;

    const provider = this.ProviderToUse;
    const currentUser = provider.CurrentUser;
    if (!currentUser) return; // No user context — skip check

    this.PermissionResult = EvaluateComponentPermissions(spec, currentUser, provider);
  }

  /** Whether the component should be blocked from rendering due to missing permissions. */
  public get IsPermissionBlocked(): boolean {
    return !!this.PermissionResult && !this.PermissionResult.canRun;
  }

  /** @deprecated Use {@link IsPermissionBlocked}. */
  public get isPermissionBlocked(): boolean {
    return this.IsPermissionBlocked;
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
      this.HasError = true;
      this.errorMessage = 'Failed to initialize component runtime';
      this.ErrorDetails = error instanceof Error ? error.message : String(error);
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

    const resolvedComponent = this.ResolvedComponentSpec;

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
    if (this.ResolvedComponentSpec?.name) {
      this.ComponentName = this.ResolvedComponentSpec.name;
    }
    if (this.ResolvedComponentSpec?.code) {
      this.ComponentCode = BuildComponentCompleteCode(this.ResolvedComponentSpec);
    }
  }

  /**
   * Called when MJReactComponent finishes loading the full component spec from the registry.
   * The full spec may contain Functional, Technical, and Data tabs not in the stripped spec.
   * Caches the resolved spec so it survives DOM destruction (e.g., if the component fails to
   * render and <mj-react-component> is removed by the @if/else block).
   * Emits tabsChanged so the parent panel re-evaluates allTabs and renders the new tab labels.
   */
  OnReactComponentInitialized(): void {
    const host = this.liveReactComponent;
    if (host?.resolvedComponentSpec &&
        host.resolvedComponentSpec !== this.Component) {
      // Cache the resolved spec so it's available even after the React component is destroyed
      this._cachedResolvedSpec = host.resolvedComponentSpec;
      this.tabsChanged.emit();

      // Re-evaluate permissions against the resolved spec — the stripped artifact
      // spec has no dataRequirements, so the initial check in loadComponentSpec()
      // passes trivially. The resolved spec from the registry contains the full
      // dataRequirements with entity and query references.
      this.evaluatePermissions();
    }
  }

  /** @deprecated Use {@link OnReactComponentInitialized}. */
  onReactComponentInitialized(): void {
    return this.OnReactComponentInitialized();
  }

  OnComponentEvent(event: unknown): void {
    console.log('Component event:', event);

    // Handle error events from React component
    if (event && typeof event === 'object' && 'type' in event && event.type === 'error') {
      const errorEvent = event as { type: 'error'; payload: { error: string; source: string } };
      this.HasError = true;
      this.errorMessage = 'Component Failed to Load';
      this.ErrorDetails = errorEvent.payload.error || 'Unknown error occurred while loading the component';
    }
  }

  /** @deprecated Use {@link OnComponentEvent}. */
  onComponentEvent(event: unknown): void {
    return this.OnComponentEvent(event);
  }

  /**
   * Handle entity record open request from React component
   * Propagates the event up to parent components
   */
  OnOpenEntityRecord(event: {entityName: string; key: CompositeKey}): void {
    // Transform to use 'compositeKey' name for consistency with Angular components
    this.OpenEntityRecord.emit({
      entityName: event.entityName,
      compositeKey: event.key
    });
  }

  /** @deprecated Use {@link OnOpenEntityRecord}. */
  onOpenEntityRecord(event: {entityName: string; key: CompositeKey}): void {
    return this.OnOpenEntityRecord(event);
  }

  public override GetCurrentStateSnapshot(): DataSnapshot | null {
    // First try the component's explicit or auto-captured data state.
    // MJReactComponent.getCurrentDataState() already includes the fallback
    // to intercepted RunView/RunQuery results when the React component
    // doesn't register getCurrentDataState() via callbacks.RegisterMethod.
    const dataState = this.ReactComponent?.getCurrentDataState?.();
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
    const spec = this.ResolvedComponentSpec;
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
    return !!this.ResolvedComponentSpec;
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
    this.IsFormArtifact = false;
    this.IsFormPanelArtifact = false;
    this.PanelPreviewProps = null;
    this.FormEntityInfo = null;
    this.FormRecord = null;
    this.FormRecordIsReal = false;
    this.FormRecordLabel = '';
    this.FormInitError = null;

    const spec = this.Component;
    if (!spec || (!isFormRole(spec) && !IsFormPanelRole(spec))) return;

    this.IsFormArtifact = true;
    this.IsFormPanelArtifact = IsFormPanelRole(spec);

    const entityName = getDeclaredFormEntityName(spec);
    if (!entityName) {
      this.FormInitError = 'Form artifact has no declared entity. Showing without record context.';
      return;
    }

    const provider = this.ProviderToUse;
    const entity = provider?.EntityByName(entityName);
    if (!entity) {
      this.FormInitError = `Entity "${entityName}" not registered with the active provider.`;
      return;
    }
    this.FormEntityInfo = entity;

    // Load Top-1 record by default. If empty / fails, fall back to a fresh
    // synthetic record. Either way the form mounts — failure to find a real
    // record is informational, not fatal.
    const record = await this.loadTopOneRecord(entity);
    if (record) {
      this.FormRecord = record;
      this.FormRecordIsReal = true;
      this.FormRecordLabel = this.computeRecordLabel(record);
    } else {
      this.FormRecord = await this.buildFixtureRecord(entity);
      this.FormRecordIsReal = false;
      this.FormRecordLabel = 'Mock data';
    }
    this.rebuildPanelPreviewProps();
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
  public async OnPickerSearchInput(term: string): Promise<void> {
    this.RecordSearchTerm = term;
    if (!this.FormEntityInfo || term.trim().length === 0) {
      this.RecordSearchResults = [];
      return;
    }
    const nameField = this.FormEntityInfo.NameField?.Name;
    if (!nameField) {
      this.RecordSearchResults = [];
      return;
    }
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      // Best-effort LIKE filter against the entity's name field. Wrap the
      // term so we don't break SQL — RunView passes ExtraFilter as-is.
      const safe = term.replace(/'/g, "''");
      const result = await rv.RunView<BaseEntity>({
        EntityName: this.FormEntityInfo.Name,
        ExtraFilter: `${nameField} LIKE '%${safe}%'`,
        MaxRows: 8,
        ResultType: 'entity_object',
      }, this.ProviderToUse.CurrentUser);
      if (result.Success) {
        this.RecordSearchResults = (result.Results ?? []).map(r => ({
          ID: r.PrimaryKey?.ToConcatenatedString() ?? '',
          Label: this.computeRecordLabel(r),
        }));
      }
    } catch (err) {
      LogError(`ComponentArtifactViewer: picker search failed: ${err instanceof Error ? err.message : String(err)}`);
      this.RecordSearchResults = [];
    }
  }

  /** @deprecated Use {@link OnPickerSearchInput}. */
  public async onPickerSearchInput(term: string): Promise<void> {
    return this.OnPickerSearchInput(term);
  }

  /** User picked a different record from the search results. Re-bind the form. */
  public async OnPickerSelect(item: { ID: string; Label: string }): Promise<void> {
    if (!this.FormEntityInfo) return;
    try {
      const rec = await this.ProviderToUse.GetEntityObject<BaseEntity>(
        this.FormEntityInfo.Name, this.ProviderToUse.CurrentUser,
      );
      const pk = new CompositeKey();
      pk.LoadFromURLSegment(this.FormEntityInfo, item.ID);
      const loaded = await rec.InnerLoad(pk);
      if (loaded) {
        this.FormRecord = rec;
        this.FormRecordIsReal = true;
        this.FormRecordLabel = item.Label;
        this.rebuildPanelPreviewProps();
        this.ShowRecordPicker = false;
        this.RecordSearchTerm = '';
        this.RecordSearchResults = [];
      }
    } catch (err) {
      LogError(`ComponentArtifactViewer: failed to load picked record ${item.ID}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** @deprecated Use {@link OnPickerSelect}. */
  public async onPickerSelect(item: { ID: string; Label: string }): Promise<void> {
    return this.OnPickerSelect(item);
  }

  /**
   * Bubble Apply intent up to the host (Form Builder dashboard / Sage chat).
   *
   * Resolves the full ComponentSpec (with code) from multiple sources:
   *   1. resolvedComponentSpec — live React bridge or cached copy (best for non-form artifacts)
   *   2. Re-parse artifact version Content — the agent stores the full spec including code
   *   3. DB fallback — fetch from MJ: Components by name
   *
   * Source #2 covers the common form-artifact case where the React component lives inside
   * <mj-interactive-form> and resolvedComponentSpec falls back to the stripped local spec.
   */
  /**
   * Host props for a form-panel preview. There is no host form here, so permissions
   * read false and the panel renders as if opened read-only — the preview shows what
   * the panel looks like, not what it can do once installed.
   */
  private rebuildPanelPreviewProps(): void {
    this.PanelPreviewProps = null;
    if (!this.IsFormPanelArtifact || !this.FormRecord || !this.FormEntityInfo || !this.Component) return;
    const contribution = GetDeclaredFormContribution(this.Component);
    if (!contribution) return;
    const registration = ContributionSpecToRegistration(this.FormEntityInfo.Name, contribution);
    this.PanelPreviewProps = BuildFormPanelHostProps({
      Record: this.FormRecord,
      FormComponent: null,
      Contribution: registration,
      SectionKey: ResolveContributionKey(registration.Metadata) || `preview:${this.Component.name}`,
      Layout: 'accordion',
      IsExpanded: true,
    });
  }

  public async OnApplyClicked(): Promise<void> {
    if (!this.FormEntityInfo) return;

    const spec = await this.resolveSpecWithCode();
    if (!spec) {
      // The artifact stores a registry reference, so the code arrives only once
      // the preview has resolved it. Saying so beats a button that does nothing.
      this.FormInitError = 'Component code is still loading. Try again in a moment.';
      this.cdr.detectChanges();
      return;
    }

    this.ApplyFormRequested.emit({
      spec,
      entityName: this.FormEntityInfo.Name,
    });
  }

  /** @deprecated Use {@link OnApplyClicked}. */
  public async onApplyClicked(): Promise<void> {
    return this.OnApplyClicked();
  }

  /**
   * Resolve a ComponentSpec that includes code, trying multiple sources in order.
   */
  private async resolveSpecWithCode(): Promise<ComponentSpec | null> {
    // 1. Prefer the live React bridge's resolved spec (non-form path).
    const resolved = this.ResolvedComponentSpec;
    if (resolved?.code) return resolved;

    // 2. For whole-form artifacts, the React component lives inside
    //    <mj-interactive-form>. Reach into it to get the resolved spec from the
    //    component registry.
    const formReactSpec = this.InteractiveForm?.reactComponent?.resolvedComponentSpec;
    if (formReactSpec?.code) return formReactSpec;

    // 2b. A panel previews through its own React host, which is the only place
    //     its registry-resolved spec exists.
    const panelReactSpec = this.PanelReactComponent?.resolvedComponentSpec;
    if (panelReactSpec?.code) return panelReactSpec;

    // 3. Re-parse the artifact version's Content directly — the agent stores the
    //    full spec including code. This handles the case where loadComponentSpec()
    //    parsed early (before Content was fully populated) and the in-memory
    //    `this.component` ended up without code.
    if (this.artifactVersion?.Content) {
      const freshParse = SafeJSONParse(this.artifactVersion.Content) as ComponentSpec | null;
      if (freshParse?.code) return freshParse;
    }

    // 4. DB fallback — fetch from MJ: Components by name.
    const name = resolved?.name ?? this.Component?.name;
    if (name) {
      const dbSpec = await this.fetchFullSpecByName(name);
      if (dbSpec?.code) return dbSpec;
    }

    LogError('ComponentArtifactViewer: could not resolve spec with code for Apply');
    return null;
  }

  /**
   * Fetch the full ComponentSpec (including code) from the MJ: Components table
   * by component name. Returns null if not found or on error.
   */
  private async fetchFullSpecByName(name: string): Promise<ComponentSpec | null> {
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const result = await rv.RunView<{ Specification: string }>({
        EntityName: 'MJ: Components',
        ExtraFilter: `Name='${name.replace(/'/g, "''")}'`,
        Fields: ['Specification'],
        OrderBy: 'VersionSequence DESC',
        MaxRows: 1,
        ResultType: 'simple',
      });
      if (result.Success && result.Results?.length > 0 && result.Results[0].Specification) {
        return JSON.parse(result.Results[0].Specification) as ComponentSpec;
      }
    } catch (err) {
      LogError(`ComponentArtifactViewer: failed to fetch full spec for '${name}': ${err instanceof Error ? err.message : String(err)}`);
    }
    return null;
  }
}
