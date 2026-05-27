import {
  Component,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  ViewChild,
  ChangeDetectorRef
} from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { ComponentSpec } from '@memberjunction/interactive-component-types';
import {
  buildCuratedFormSchema,
  FormHostProps,
  FormMode,
} from '@memberjunction/interactive-component-types/forms';
import { ReactComponentEvent, MJReactComponent } from '@memberjunction/ng-react';
import {
  BaseEntity,
  CompositeKey,
  LogError,
  Metadata,
  RunView,
} from '@memberjunction/core';
import { SharedService } from '@memberjunction/ng-shared';
import {
  ComponentStudioStateService,
  ComponentError
} from '../../services/component-studio-state.service';
import { buildFixtureFormHostProps } from '../../services/form-host-props-fixture';

/**
 * Viewport size preset for the component preview
 */
export type ViewportSize = 'mobile' | 'tablet' | 'desktop';

interface ViewportPreset {
  Size: ViewportSize;
  Label: string;
  Icon: string;
  MaxWidth: string;
}

/**
 * Component Preview - TOP section of CENTER panel.
 * Renders the live React component preview with toolbar controls.
 */
@Component({
  standalone: false,
  selector: 'mj-component-preview',
  templateUrl: './component-preview.component.html',
  styleUrls: ['./component-preview.component.css']
})
export class ComponentPreviewComponent implements OnInit, OnDestroy {

  @ViewChild('reactComponent') ReactComponentRef?: MJReactComponent;

  @Output() AskAIToFix = new EventEmitter<ComponentError>();

  // --- Viewport ---
  public ActiveViewport: ViewportSize = 'desktop';

  public readonly ViewportPresets: ViewportPreset[] = [
    { Size: 'mobile', Label: 'Mobile (375px)', Icon: 'fa-mobile-screen', MaxWidth: '375px' },
    { Size: 'tablet', Label: 'Tablet (768px)', Icon: 'fa-tablet-screen-button', MaxWidth: '768px' },
    { Size: 'desktop', Label: 'Desktop (100%)', Icon: 'fa-desktop', MaxWidth: '100%' }
  ];

  // --- Local spec for refresh cycle ---
  public LocalComponentSpec: ComponentSpec | null = null;

  // ----- Form-role preview controls (sandboxed) -----
  /** Recent records of the target entity for the optional real-record picker. */
  public RecentRecords: Array<{ ID: string; Display: string }> = [];
  public SelectedRecordID: string | null = null;
  /** When a real record is loaded, this holds its fields keyed by name. */
  public LoadedRecordValues: Record<string, unknown> | null = null;
  public IsLoadingRecord = false;
  /** Last 20 events emitted by the previewed component, newest first. */
  public EventLog: Array<{ Timestamp: Date; Type: string; Payload: string }> = [];

  private destroy$ = new Subject<void>();
  private lastLoadedEntity: string | null = null;

  constructor(
    public State: ComponentStudioStateService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.syncSpecFromState();

    this.State.StateChanged
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.syncSpecFromState();
        this.maybeRefreshRecentRecords();
        this.cdr.detectChanges();
      });

    this.State.RefreshComponent
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.refreshPreview();
      });

    this.maybeRefreshRecentRecords();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ============================================================
  // TOOLBAR ACTIONS
  // ============================================================

  public RunSelectedComponent(): void {
    if (this.State.SelectedComponent) {
      this.State.RunComponent(this.State.SelectedComponent);
    }
  }

  public StopComponent(): void {
    MJReactComponent.forceClearRegistries();
    this.State.StopComponent();
  }

  public RefreshComponent(): void {
    if (this.State.SelectedComponent && this.State.IsRunning) {
      MJReactComponent.forceClearRegistries();
      this.refreshPreview();
    }
  }

  public SetViewport(size: ViewportSize): void {
    this.ActiveViewport = size;
    this.cdr.detectChanges();
  }

  public SendErrorToAI(): void {
    if (this.State.CurrentError) {
      this.AskAIToFix.emit(this.State.CurrentError);
      this.State.SendErrorToAI.emit(this.State.CurrentError);
    }
  }

  // ============================================================
  // VIEWPORT HELPERS
  // ============================================================

  public GetActivePreset(): ViewportPreset {
    return this.ViewportPresets.find(p => p.Size === this.ActiveViewport) || this.ViewportPresets[2];
  }

  public GetPreviewContainerMaxWidth(): string {
    return this.GetActivePreset().MaxWidth;
  }

  // ============================================================
  // REACT COMPONENT EVENTS
  // ============================================================

  public OnComponentEvent(event: ReactComponentEvent): void {
    if (event.type === 'error') {
      this.State.CurrentError = {
        type: event.payload?.source || 'Component Error',
        message: event.payload?.error || 'An error occurred while rendering the component',
        technicalDetails: event.payload?.errorInfo || event.payload
      };
      this.cdr.detectChanges();
      return;
    }
    // Form-role event sandbox — log BeforeSave / BeforeDelete /
    // FieldChanged events but never let them persist. The previewed
    // component should treat the response as a no-op.
    if (this.IsFormRolePreview) {
      this.logEvent(event.type, event.payload);
      this.cdr.detectChanges();
    }
  }

  // ============================================================
  // FORM PREVIEW HELPERS
  // ============================================================

  /** True when the current spec is form-role (drives the sandbox UI). */
  public get IsFormRolePreview(): boolean {
    const spec = this.LocalComponentSpec;
    return !!spec && (spec.componentRole === 'form' || spec.type === 'form');
  }

  /** Convenience for the template — the entity name the form binds to. */
  public get FormTargetEntity(): string | null {
    return this.State.FormTargetEntityName;
  }

  /** Selected preview mode (delegates to the shared state). */
  public get FormPreviewMode(): FormMode {
    return this.State.FormPreviewMode;
  }

  public SetFormPreviewMode(mode: FormMode): void {
    this.State.FormPreviewMode = mode;
    // Switching mode invalidates any loaded record diff — clear it so the
    // refreshed render starts fresh.
    if (mode === 'create') {
      this.SelectedRecordID = null;
      this.LoadedRecordValues = null;
    }
    this.refreshPreview();
  }

  /** Add an entry to the event log; keep the log bounded to 20 entries. */
  private logEvent(type: string, payload: unknown): void {
    const entry = {
      Timestamp: new Date(),
      Type: type,
      Payload: this.summarisePayload(payload),
    };
    this.EventLog = [entry, ...this.EventLog].slice(0, 20);
  }

  private summarisePayload(payload: unknown): string {
    if (payload == null) return '—';
    try {
      const s = JSON.stringify(payload);
      return s.length > 200 ? s.slice(0, 200) + '…' : s;
    } catch {
      return String(payload);
    }
  }

  public ClearEventLog(): void {
    this.EventLog = [];
    this.cdr.detectChanges();
  }

  /**
   * Load the top 10 most-recent records for the target entity so the
   * preview can swap from fixture to real-record mode. Re-runs whenever
   * the target entity changes; quiet no-op if entity isn't set yet.
   */
  private async maybeRefreshRecentRecords(): Promise<void> {
    const entityName = this.State.FormTargetEntityName;
    if (!entityName || entityName === this.lastLoadedEntity) return;
    this.lastLoadedEntity = entityName;
    this.RecentRecords = [];
    try {
      const rv = RunView.FromMetadataProvider(this.State.Provider);
      const entityInfo = this.State.Provider.EntityByName(entityName);
      const nameField = entityInfo?.NameField?.Name ?? 'ID';
      const fields = nameField === 'ID' ? ['ID'] : ['ID', nameField];
      const result = await rv.RunView<Record<string, unknown>>({
        EntityName: entityName,
        Fields: fields,
        OrderBy: '__mj_UpdatedAt DESC',
        MaxRows: 10,
        ResultType: 'simple',
      });
      if (result.Success && Array.isArray(result.Results)) {
        this.RecentRecords = result.Results.map(r => ({
          ID: String(r['ID'] ?? ''),
          Display: String(r[nameField] ?? r['ID'] ?? ''),
        })).filter(r => r.ID.length > 0);
      }
    } catch (err) {
      LogError(`ComponentPreview.maybeRefreshRecentRecords: ${err instanceof Error ? err.message : String(err)}`);
    }
    this.cdr.detectChanges();
  }

  /**
   * Load a real record for preview. We pull the full entity object then
   * extract its field values into a plain object for FormHostProps.
   * Sandboxed — any BeforeSave/BeforeDelete events emitted by the previewed
   * component are logged, never applied.
   */
  public async OnPickRecord(event: Event): Promise<void> {
    const id = (event.target as HTMLSelectElement).value || null;
    this.SelectedRecordID = id;
    if (!id) {
      this.LoadedRecordValues = null;
      this.refreshPreview();
      return;
    }
    const entityName = this.State.FormTargetEntityName;
    if (!entityName) return;
    this.IsLoadingRecord = true;
    this.cdr.detectChanges();
    try {
      const provider = this.State.Provider;
      const entity = await provider.GetEntityObject<BaseEntity>(entityName, provider.CurrentUser);
      const compositeKey = CompositeKey.FromID(id);
      const loaded = await entity.InnerLoad(compositeKey);
      if (loaded) {
        const values: Record<string, unknown> = {};
        for (const f of entity.Fields) {
          values[f.Name] = f.Value;
        }
        this.LoadedRecordValues = values;
      } else {
        this.LoadedRecordValues = null;
      }
    } catch (err) {
      LogError(`ComponentPreview.OnPickRecord: ${err instanceof Error ? err.message : String(err)}`);
      this.LoadedRecordValues = null;
    } finally {
      this.IsLoadingRecord = false;
    }
    this.refreshPreview();
  }

  /**
   * Fires once the React bridge has resolved the full component hierarchy from the
   * registry. The bridge stores the resolved spec (with real dependency code, not
   * registry-reference stubs) on its public `resolvedComponentSpec` field — pull it
   * across so the code-editor tabs can render actual source instead of "No code available".
   */
  public OnReactInitialized(): void {
    const resolvedSpec = this.ReactComponentRef?.resolvedComponentSpec;
    if (resolvedSpec) {
      this.State.UpdateWithResolvedSpec(resolvedSpec);
      this.cdr.detectChanges();
    }
  }

  public OnOpenEntityRecord(event: { entityName: string; key: CompositeKey }): void {
    SharedService.Instance.OpenEntityRecord(event.entityName, event.key);
  }

  // ============================================================
  // STATE HELPERS
  // ============================================================

  public GetComponentName(): string {
    if (!this.State.SelectedComponent) return '';
    return this.State.GetComponentName(this.State.SelectedComponent);
  }

  public GetComponentDescription(): string | undefined {
    if (!this.State.SelectedComponent) return undefined;
    return this.State.GetComponentDescription(this.State.SelectedComponent);
  }

  // ============================================================
  // PRIVATE
  // ============================================================

  private syncSpecFromState(): void {
    this.LocalComponentSpec = this.State.ComponentSpec;
  }

  /**
   * Fixture `FormHostProps` for form-role component previews. Built from
   * the curated schema of `State.FormTargetEntityName` — the entity the
   * user picked in the Field Binding Inspector. Returns an empty object
   * when (a) the current spec isn't a form, (b) no target entity is
   * selected, or (c) the entity isn't registered with the provider — in
   * which case the previewed component sees `record === undefined` and
   * should handle that gracefully (the Studio skeleton does).
   *
   * The mode toggles to 'edit' so authors can see how inputs render
   * without manually flipping mode each refresh.
   */
  public get FixtureFormHostProps(): Partial<FormHostProps> | object {
    const spec = this.LocalComponentSpec;
    if (!spec || (spec.componentRole !== 'form' && spec.type !== 'form')) {
      return {};
    }
    const entityName = this.State.FormTargetEntityName;
    if (!entityName) {
      return {};
    }
    const provider = this.State.Provider;
    if (!provider) return {};
    const schema = buildCuratedFormSchema(entityName, provider);
    if (!schema) return {};
    const mode = this.State.FormPreviewMode;
    const fixture = buildFixtureFormHostProps(schema, mode);

    // If the user picked a real record, overlay its field values on top of
    // the fixture (which has the right shape for entityMetadata + caps).
    // The record is still sandboxed — events fired by the previewed
    // component never reach a Save().
    if (this.LoadedRecordValues && mode !== 'create') {
      return {
        ...fixture,
        record: this.LoadedRecordValues,
        primaryKey: this.SelectedRecordID
          ? { ID: this.SelectedRecordID }
          : fixture.primaryKey,
      };
    }
    return fixture;
  }

  /**
   * Refresh the preview by nulling the spec, detecting changes,
   * then restoring the spec after a short delay. The bridge's own
   * `initializeComponent` purges the runtime registry + manager fetch cache
   * for the new spec's keys, so consumers don't need to clear anything here.
   */
  private refreshPreview(): void {
    if (!this.State.SelectedComponent) return;

    const spec = this.State.ComponentSpec;

    // Null out to force React to unmount
    this.LocalComponentSpec = null;
    this.cdr.detectChanges();

    // Re-set after a brief pause to force fresh mount
    setTimeout(() => {
      this.LocalComponentSpec = spec;
      this.State.ComponentSpec = spec;
      this.State.CurrentError = null;
      try {
        this.cdr.detectChanges();
      } catch (error) {
        console.error('Error during refresh detectChanges:', error);
      }
    }, 10);
  }
}
