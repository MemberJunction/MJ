import { Component, AfterViewInit, OnDestroy, ViewChild, ElementRef, ChangeDetectorRef, HostListener } from '@angular/core';
import { BaseDashboard } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { Metadata, IMetadataProvider } from '@memberjunction/core';
import {
  MJComponentEntityExtended,
  MJArtifactVersionEntity,
  ResourceData,
  UserInfoEngine
} from '@memberjunction/core-entities';
import { Subject, takeUntil } from 'rxjs';
import { ComponentSpec } from '@memberjunction/interactive-component-types';
import { SharedService } from '@memberjunction/ng-shared';
import { ArtifactSelectionResult } from './components/artifact-selection-dialog.component';
import { ArtifactLoadResult } from './components/artifact-load-dialog.component';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { ComponentStudioStateService, FileLoadedComponent, ComponentError } from './services/component-studio-state.service';
import { ComponentVersionService } from './services/component-version.service';
import { SaveVersionResult } from './components/save-version-dialog/save-version-dialog.component';
import { RunView } from '@memberjunction/core';
import { FormOverrideDialogResult } from './components/form-override-dialog.component';
import { EntityFormOverrideService } from './services/entity-form-override.service';
import {
  generateCanvasId,
  type FormCanvasElement,
  type FormCanvasModel,
  type FormCanvasSection,
} from './services/form-canvas-model';
import { generateCodeFromCanvas } from './services/canvas-to-code';

/**
 * User preferences persisted via UserInfoEngine.
 */
interface ComponentStudioPreferences {
  leftPanelWidth: number;
  rightPanelWidth: number;
  previewFlexPercent: number;
  isAIPanelCollapsed: boolean;
  isLeftPanelCollapsed: boolean;
  isEditorPanelCollapsed: boolean;
}

/**
 * Result from the New Component dialog.
 */
export interface NewComponentResult {
  name: string;
  title: string;
  description: string;
  type: string;
}

@Component({
  standalone: false,
  selector: 'mj-component-studio-dashboard',
  templateUrl: './component-studio-dashboard.component.html',
  styleUrls: ['./component-studio-dashboard.component.css'],
  providers: [ComponentStudioStateService, ComponentVersionService]
})
@RegisterClass(BaseDashboard, 'ComponentStudioDashboard')
export class ComponentStudioDashboardComponent extends BaseDashboard implements AfterViewInit, OnDestroy {

  private static readonly USER_PREFS_KEY = 'ComponentStudio.UserPreferences';

  // --- Panel widths ---
  public leftPanelWidth = 340;
  public rightPanelWidth = 380;
  public previewFlex = '1 1 50%';
  public editorFlex = '1 1 50%';
  private previewFlexPercent = 50;

  // --- Dropdown states ---
  public exportDropdownOpen = false;

  // --- Resize state ---
  public IsResizing = false;
  private resizeType: 'left' | 'right' | 'center' | null = null;
  private resizeStartX = 0;
  private resizeStartValue = 0;

  // --- Collapsible panels ---
  public IsLeftPanelCollapsed = false;
  public IsEditorPanelCollapsed = false;

  // --- Dialog states ---
  public ShowNewComponentDialog = false;
  public ShowKeyboardShortcuts = false;
  public ShowSaveVersionDialog = false;
  public ShowTextImportDialog = false;
  public ShowArtifactLoadDialog = false;
  public ShowArtifactSelectionDialog = false;
  /** Toggled after a form-role Component is saved (see OnSaveVersionConfirm). */
  public ShowFormOverrideDialog = false;
  /** ComponentID of the just-saved Component, set when ShowFormOverrideDialog flips on. */
  public PendingOverrideComponentID: string | null = null;
  /** Entity name to seed the override dialog from (mirrors state.FormTargetEntityName). */
  public PendingOverrideEntityName = '';
  /** Component name to seed the override Name field. */
  public PendingOverrideComponentName = '';

  // --- Status bar ---
  public LastSavedTime: Date | null = null;

  // --- Preferences ---
  private prefsLoaded = false;

  @ViewChild('fileInput', { static: false }) fileInput?: ElementRef<HTMLInputElement>;

  protected override destroy$ = new Subject<void>();
  private get metadata(): IMetadataProvider { return this.ProviderToUse; }

  constructor(
    public state: ComponentStudioStateService,
    public versionService: ComponentVersionService,
    private cdr: ChangeDetectorRef,
    private notificationService: MJNotificationService,
    private entityFormOverrideService: EntityFormOverrideService
  ) {
    super();
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Component Studio';
  }

  async ngAfterViewInit() {
    this.initDashboard();

    // Subscribe to state changes for change detection
    this.state.StateChanged.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.cdr.detectChanges();
    });

    // Form Builder tab "Open in Chat" — relay to NavigationService.
    this.state.OpenInChatRequested.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.OnOpenFormInChat();
    });

    this.loadUserPreferences();
    await this.state.LoadComponents();
    this.NotifyLoadComplete();
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected initDashboard(): void {
    // Wire up provider-aware services for multi-provider support
    this.state.Provider = this.ProviderToUse;
    this.versionService.Provider = this.ProviderToUse;
  }

  protected loadData(): void {
    this.state.LoadComponents();
  }

  // ============================================================
  // USER PREFERENCES
  // ============================================================

  private loadUserPreferences(): void {
    try {
      const saved = UserInfoEngine.Instance.GetSetting(ComponentStudioDashboardComponent.USER_PREFS_KEY);
      if (saved) {
        const prefs = JSON.parse(saved) as ComponentStudioPreferences;
        this.applyPreferences(prefs);
      }
    } catch (error) {
      console.warn('[ComponentStudio] Failed to load user preferences:', error);
    } finally {
      this.prefsLoaded = true;
    }
  }

  private applyPreferences(prefs: ComponentStudioPreferences): void {
    if (prefs.leftPanelWidth) this.leftPanelWidth = prefs.leftPanelWidth;
    if (prefs.rightPanelWidth) this.rightPanelWidth = prefs.rightPanelWidth;
    if (prefs.previewFlexPercent) {
      this.previewFlexPercent = prefs.previewFlexPercent;
      this.previewFlex = `1 1 ${prefs.previewFlexPercent}%`;
      this.editorFlex = `1 1 ${100 - prefs.previewFlexPercent}%`;
    }
    if (prefs.isAIPanelCollapsed != null) {
      this.state.IsAIPanelCollapsed = prefs.isAIPanelCollapsed;
    }
    if (prefs.isLeftPanelCollapsed != null) {
      this.IsLeftPanelCollapsed = prefs.isLeftPanelCollapsed;
    }
    if (prefs.isEditorPanelCollapsed != null) {
      this.IsEditorPanelCollapsed = prefs.isEditorPanelCollapsed;
    }
  }

  private getCurrentPreferences(): ComponentStudioPreferences {
    return {
      leftPanelWidth: this.leftPanelWidth,
      rightPanelWidth: this.rightPanelWidth,
      previewFlexPercent: this.previewFlexPercent,
      isAIPanelCollapsed: this.state.IsAIPanelCollapsed,
      isLeftPanelCollapsed: this.IsLeftPanelCollapsed,
      isEditorPanelCollapsed: this.IsEditorPanelCollapsed
    };
  }

  private saveUserPreferences(): void {
    if (!this.prefsLoaded) return;
    try {
      UserInfoEngine.Instance.SetSetting(
        ComponentStudioDashboardComponent.USER_PREFS_KEY,
        JSON.stringify(this.getCurrentPreferences())
      );
    } catch (error) {
      console.warn('[ComponentStudio] Failed to save user preferences:', error);
    }
  }

  private saveUserPreferencesDebounced(): void {
    if (!this.prefsLoaded) return;
    try {
      UserInfoEngine.Instance.SetSettingDebounced(
        ComponentStudioDashboardComponent.USER_PREFS_KEY,
        JSON.stringify(this.getCurrentPreferences())
      );
    } catch (error) {
      console.warn('[ComponentStudio] Failed to save user preferences:', error);
    }
  }

  // ============================================================
  // KEYBOARD SHORTCUTS
  // ============================================================

  @HostListener('document:keydown', ['$event'])
  OnKeyDown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    const isInputFocused = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

    // Ctrl+S / Cmd+S = Save Version
    if ((event.ctrlKey || event.metaKey) && event.key === 's') {
      event.preventDefault();
      if (this.state.SelectedComponent) {
        this.SaveVersion();
      }
    }

    // Ctrl+N / Cmd+N = New Component
    if ((event.ctrlKey || event.metaKey) && event.key === 'n') {
      event.preventDefault();
      this.OnNewComponent();
    }

    // Ctrl+/ or ? = Toggle keyboard shortcuts
    if ((event.ctrlKey || event.metaKey) && event.key === '/') {
      event.preventDefault();
      this.ShowKeyboardShortcuts = !this.ShowKeyboardShortcuts;
      this.cdr.detectChanges();
    } else if (event.key === '?' && !isInputFocused) {
      this.ShowKeyboardShortcuts = !this.ShowKeyboardShortcuts;
      this.cdr.detectChanges();
    }

    // Escape = Close overlays
    if (event.key === 'Escape') {
      if (this.ShowKeyboardShortcuts) {
        this.ShowKeyboardShortcuts = false;
        this.cdr.detectChanges();
      }
    }
  }

  // ============================================================
  // SAVE VERSION
  // ============================================================

  SaveVersion(): void {
    if (!this.state.SelectedComponent) return;
    this.ShowSaveVersionDialog = true;
    this.cdr.detectChanges();
  }

  async OnSaveVersionConfirm(result: SaveVersionResult): Promise<void> {
    this.ShowSaveVersionDialog = false;

    // If the Form Builder tab is the active surface and the canvas has
    // content, serialize it to JSX BEFORE the version save so the canvas
    // edits actually persist. If the user is in the Code tab instead, the
    // EditableCode they hand-edited is already the source of truth.
    if (this.IsFormRoleComponent && this.state.ActiveTab === 5 && this.state.FormCanvas && this.state.FormSchema) {
      const canvas = this.state.FormCanvas;
      const schema = this.state.FormSchema;
      const name = canvas.title?.trim() || schema.displayName;
      this.state.EditableCode = generateCodeFromCanvas(canvas, schema, name);
    }

    let success: boolean;
    if (result.Mode === 'update') {
      success = await this.versionService.UpdateCurrentVersion(result.Comment || undefined);
    } else {
      success = await this.versionService.SaveVersion(result.Comment || undefined);
    }

    if (success) {
      this.LastSavedTime = new Date();
      this.notificationService.CreateSimpleNotification(
        `Saved as v${this.versionService.CurrentVersionNumber}`,
        'success',
        3000
      );
      this.state.HasUnsavedChanges = false;

      // For form-role Components, prompt the user to create an
      // EntityFormOverride so the saved Component actually activates for
      // someone. Skip silently if the post-save state didn't yield a
      // ComponentID (loading state, network blip).
      if (this.IsFormRoleComponent && this.state.FormTargetEntityName) {
        const spec = this.state.GetCurrentSpec?.();
        const componentID = (spec as { id?: string } | null)?.id ?? null;
        if (componentID) {
          this.PendingOverrideComponentID = componentID;
          this.PendingOverrideEntityName = this.state.FormTargetEntityName;
          this.PendingOverrideComponentName = spec?.name ?? '';
          this.ShowFormOverrideDialog = true;
        }
      }
    } else {
      this.notificationService.CreateSimpleNotification(
        'Failed to save version',
        'error'
      );
    }
    this.cdr.detectChanges();
  }

  /**
   * Handle the post-save override dialog. Persists an EntityFormOverride
   * row via {@link EntityFormOverrideService}. Currently surfaces an error
   * because the underlying write is blocked on the generated
   * `EntityFormOverrideEntity` class (Task 15) — the UI is wired so the
   * unblock is one swap of the service stub.
   */
  async OnFormOverrideDialogConfirm(result: FormOverrideDialogResult): Promise<void> {
    this.ShowFormOverrideDialog = false;
    if (!this.PendingOverrideComponentID) {
      this.cdr.detectChanges();
      return;
    }

    const overrideService = this.entityFormOverrideService;
    const provider = this.ProviderToUse;
    const user = provider?.CurrentUser;
    if (!user) {
      this.notificationService.CreateSimpleNotification(
        'No current user — cannot create override.',
        'error'
      );
      this.cdr.detectChanges();
      return;
    }

    const writeResult = await overrideService.CreateOverride(
      this.PendingOverrideComponentID,
      result,
      user,
      provider,
    );

    if (writeResult.Success) {
      this.notificationService.CreateSimpleNotification(
        `Override "${result.Name}" created. Next time you open a ${result.EntityName} record you'll see this form.`,
        'success',
        4000,
      );
    } else {
      this.notificationService.CreateSimpleNotification(
        writeResult.Error || 'Failed to create override.',
        'warning',
        6000,
      );
    }
    this.PendingOverrideComponentID = null;
    this.cdr.detectChanges();
  }

  OnFormOverrideDialogDismiss(): void {
    this.ShowFormOverrideDialog = false;
    this.PendingOverrideComponentID = null;
    this.cdr.detectChanges();
  }

  // ============================================================
  // REFRESH COMPONENT
  // ============================================================

  RefreshComponent(): void {
    this.state.RefreshComponent.emit();
  }

  // ============================================================
  // AI PANEL
  // ============================================================

  ToggleAIPanel(): void {
    this.state.IsAIPanelCollapsed = !this.state.IsAIPanelCollapsed;
    this.saveUserPreferences();
    this.cdr.detectChanges();
  }

  ToggleLeftPanel(): void {
    this.IsLeftPanelCollapsed = !this.IsLeftPanelCollapsed;
    this.saveUserPreferences();
    this.cdr.detectChanges();
  }

  ToggleEditorPanel(): void {
    this.IsEditorPanelCollapsed = !this.IsEditorPanelCollapsed;
    this.saveUserPreferences();
    this.cdr.detectChanges();
  }

  OnAskAIToFix(error: ComponentError): void {
    // Open AI panel if collapsed
    if (this.state.IsAIPanelCollapsed) {
      this.state.IsAIPanelCollapsed = false;
    }
    // Send error to AI panel
    this.state.SendErrorToAI.emit(error);
    this.cdr.detectChanges();
  }

  // ============================================================
  // NEW COMPONENT
  // ============================================================

  OnNewComponent(): void {
    this.ShowNewComponentDialog = true;
    this.cdr.detectChanges();
  }

  /**
   * True iff the currently-loaded Component declares itself as a form-role
   * component. Controls whether the right rail renders the field-binding
   * inspector or the default AI assistant panel.
   */
  public get IsFormRoleComponent(): boolean {
    const spec = this.state.GetCurrentSpec?.();
    return spec?.componentRole === 'form' || spec?.type === 'form';
  }

  /**
   * Forwards a snippet emitted by the field-binding inspector to the code
   * editor. Inserts at the end of the current code with a leading blank
   * line so it lands inside the function body but doesn't clobber the
   * cursor's current position. (Cursor-aware insertion is a follow-up —
   * it requires plumbing EditorView refs from this component through
   * EditorTabs → CodeEditorPanel → mj-code-editor.)
   */
  public OnFieldSnippetRequested(snippet: string): void {
    if (!snippet) return;
    const existing = this.state.EditableCode ?? '';
    const separator = existing.endsWith('\n') ? '\n' : '\n\n';
    this.state.EditableCode = existing + separator + snippet + '\n';
    this.cdr.detectChanges();
  }

  // ============================================================
  // FORM BUILDER — right-panel event handlers
  // (Mirrors what the Form Builder tab does internally, but routed
  // through here so the right panel works regardless of which editor
  // tab is currently active.)
  // ============================================================

  public OnFormBuilderElementChanged(next: FormCanvasElement): void {
    const canvas = this.state.FormCanvas;
    if (!canvas) return;
    const updated: FormCanvasModel = {
      ...canvas,
      sections: canvas.sections.map(s => ({
        ...s,
        elements: s.elements.map(e => e.id === next.id ? next : e),
      })),
    };
    this.applyCanvasUpdate(updated);
  }

  public OnFormBuilderSectionChanged(next: FormCanvasSection): void {
    const canvas = this.state.FormCanvas;
    if (!canvas) return;
    const updated: FormCanvasModel = {
      ...canvas,
      sections: canvas.sections.map(s => s.id === next.id ? next : s),
    };
    this.applyCanvasUpdate(updated);
  }

  public OnFormBuilderElementDeleted(elementId: string): void {
    const canvas = this.state.FormCanvas;
    if (!canvas) return;
    const updated: FormCanvasModel = {
      ...canvas,
      sections: canvas.sections.map(s => ({
        ...s,
        elements: s.elements.filter(e => e.id !== elementId),
      })),
    };
    this.state.FormSelectedElementId = null;
    this.applyCanvasUpdate(updated);
  }

  public OnFormBuilderSectionDeleted(sectionId: string): void {
    const canvas = this.state.FormCanvas;
    if (!canvas) return;
    const updated: FormCanvasModel = {
      ...canvas,
      sections: canvas.sections.filter(s => s.id !== sectionId),
    };
    this.state.FormSelectedSectionId = null;
    this.applyCanvasUpdate(updated);
  }

  public OnFormBuilderFieldAdded(payload: { fieldName: string }): void {
    const canvas = this.state.FormCanvas;
    if (!canvas) return;
    const targetId = this.state.FormSelectedSectionId
      ?? canvas.sections.find(s => s.elements.some(e => e.id === this.state.FormSelectedElementId))?.id
      ?? canvas.sections[0]?.id;
    if (!targetId) return;
    const updated: FormCanvasModel = {
      ...canvas,
      sections: canvas.sections.map(s => s.id === targetId
        ? { ...s, elements: [...s.elements, {
            id: generateCanvasId('field'),
            type: 'field',
            fieldName: payload.fieldName,
            span: 1,
          }] }
        : s),
    };
    this.applyCanvasUpdate(updated);
  }

  /**
   * Persist the canvas mutation, mirror it into code, mark the dashboard
   * dirty. Centralised so right-panel events and tab events share the same
   * pipeline.
   */
  private applyCanvasUpdate(next: FormCanvasModel): void {
    this.state.FormCanvas = next;
    this.state.HasUnsavedChanges = true;
    this.regenerateFormCodeFromCanvas();
    this.cdr.detectChanges();
  }

  /**
   * Serialise the canvas → JSX into state.EditableCode. Quietly no-ops if
   * we don't have both a canvas and a schema (the FormSelected* events
   * shouldn't fire in that case anyway).
   */
  private regenerateFormCodeFromCanvas(): void {
    const canvas = this.state.FormCanvas;
    const schema = this.state.FormSchema;
    if (!canvas || !schema) return;
    const name = canvas.title?.trim() || schema.displayName;
    this.state.EditableCode = generateCodeFromCanvas(canvas, schema, name);
  }

  /**
   * Bridge the Form Builder tab's "Open in Chat" button to NavigationService.
   * Publishes the active canvas as agent context and registers an UpdateForm
   * tool so Sage can mutate the canvas live. Falls back to clipboard if the
   * navigation service isn't available (e.g. embedded host).
   */
  private async OnOpenFormInChat(): Promise<void> {
    const canvas = this.state.FormCanvas;
    if (!canvas) {
      this.notificationService.CreateSimpleNotification(
        'No active form to send to chat.', 'warning',
      );
      return;
    }
    try {
      this.navigationService?.SetAgentContext(this, {
        activeForm: {
          entityName: canvas.entityName,
          title: canvas.title,
          sections: canvas.sections,
        },
      });
      this.navigationService?.SetAgentClientTools(this, [{
        Name: 'UpdateForm',
        Description: 'Replace the canvas model of the active form. Accepts a FormCanvasModel JSON object.',
        ParameterSchema: {
          type: 'object',
          properties: { canvas: { type: 'object', description: 'A FormCanvasModel matching the Form Builder shape.' } },
          required: ['canvas'],
        },
        Handler: async (params: Record<string, unknown>) => {
          const next = (params['canvas'] as FormCanvasModel | undefined) ?? null;
          if (next && Array.isArray(next.sections)) {
            this.applyCanvasUpdate(next);
            return { Success: true };
          }
          return { Success: false, Error: 'Missing or malformed canvas payload.' };
        },
      }]);
      this.notificationService.CreateSimpleNotification(
        'Form context sent to chat. Open the chat panel to continue.',
        'info', 4000,
      );
    } catch {
      try {
        await navigator.clipboard.writeText(JSON.stringify(canvas, null, 2));
        this.notificationService.CreateSimpleNotification(
          'Canvas JSON copied to clipboard. Paste it into chat.',
          'info', 4000,
        );
      } catch {
        this.notificationService.CreateSimpleNotification(
          'Could not hand off to chat.', 'warning',
        );
      }
    }
  }

  OnNewComponentDialogClose(result: NewComponentResult | null): void {
    this.ShowNewComponentDialog = false;
    if (!result) {
      this.cdr.detectChanges();
      return;
    }
    this.createComponentFromResult(result);
    this.cdr.detectChanges();
  }

  OnQuickStart(type: string): void {
    const typeNames: Record<string, string> = {
      dashboard: 'Dashboard',
      report: 'Report',
      chart: 'Chart',
      form: 'Form'
    };
    const typeName = typeNames[type] || 'Component';
    this.createComponentFromResult({
      name: `New ${typeName}`,
      title: `New ${typeName}`,
      description: '',
      type
    });
  }

  private createComponentFromResult(result: NewComponentResult): void {
    const isForm = result.type === 'form';
    const newSpec: ComponentSpec = {
      name: result.name,
      title: result.title,
      description: result.description,
      type: result.type,
      // Form-role components opt in to the FormHostProps contract so the
      // resolver mounts them via InteractiveFormComponent at runtime and
      // the linter enforces form-specific shape checks.
      componentRole: isForm ? 'form' : undefined,
      location: 'embedded',
      exampleUsage: '',
      code: this.getTemplateCode(result.name, result.type),
      functionalRequirements: isForm
        ? 'Renders a single entity record using FormHostProps. Supports view / edit / create modes. Emits BeforeSave with the dirty-field diff and BeforeDelete; the Angular wrapper owns BaseEntity persistence.'
        : '',
      dataRequirements: { mode: 'views', entities: [], queries: [], description: '' },
      technicalDesign: isForm
        ? 'Form-role component. Local React state holds a draft diff that overlays FormHostProps.record. Save dispatches NotifyEvent(\'BeforeSave\', { dirtyFields }) — the host applies the diff to the BaseEntity. Mode flips are requested via EditModeChangeRequested, never set locally.'
        : ''
    } as ComponentSpec;

    const fileComponent: FileLoadedComponent = {
      id: this.state.GenerateId(),
      name: result.name,
      description: result.description,
      specification: newSpec,
      filename: 'new-component.json',
      loadedAt: new Date(),
      isFileLoaded: true,
      type: result.type || 'Dashboard',
      status: 'New'
    };

    this.state.AddFileLoadedComponent(fileComponent);
    this.state.ExpandedComponent = fileComponent;
    this.state.RunComponent(fileComponent);
  }

  private getTemplateCode(name: string, type: string): string {
    if (type === 'form') {
      return this.getFormTemplateCode(name);
    }
    return `function Component({ utilities, settings }) {
  const React = utilities.React;
  const { useState } = React;

  return React.createElement('div', {
    style: { padding: '24px', fontFamily: 'system-ui' }
  },
    React.createElement('h2', null, '${name}'),
    React.createElement('p', null, 'Start building your ${type || 'component'} here.')
  );
}`;
  }

  /**
   * JSX skeleton for form-role components. Pre-wires destructured
   * FormHostProps, local `draft` state for the dirty-field diff, and the
   * three canonical lifecycle events (BeforeSave, BeforeDelete,
   * EditModeChangeRequested). Authors fill in the field rendering; the
   * persistence path is already correct.
   */
  private getFormTemplateCode(name: string): string {
    const componentName = this.toIdentifier(name) || 'Form';
    return `function ${componentName}({
  // FormHostProps (from the Angular wrapper)
  entityName,
  primaryKey,
  record,
  entityMetadata,
  mode,
  canEdit,
  canDelete,
  canCreate,
  // Standard interactive-component props
  utilities,
  styles,
  components,
  callbacks,
  savedUserSettings,
  onSaveUserSettings,
}) {
  const [draft, setDraft] = React.useState({});

  // Track latest draft in a ref so the methods we register below always
  // see the current value without re-registering on every keystroke.
  const draftRef = React.useRef({});
  React.useEffect(() => { draftRef.current = draft; }, [draft]);

  const isCreate = mode === "create";
  const isEdit = mode === "edit";
  const isView = mode === "view";
  const editing = isEdit || isCreate;

  // Reset the draft diff whenever a new record loads or we return to view.
  React.useEffect(() => {
    setDraft({});
  }, [primaryKey && JSON.stringify(primaryKey), isView]);

  // Register the host-callable methods exactly once. The wrapper invokes
  // these when the toolbar (above this component) fires Save / Cancel.
  React.useEffect(() => {
    callbacks?.RegisterMethod?.("RequestSave", () => {
      callbacks?.NotifyEvent?.("BeforeSave", {
        dirtyFields: { ...draftRef.current },
        cancel: false,
        timestamp: new Date(),
      });
    });
    callbacks?.RegisterMethod?.("RequestCancel", () => {
      setDraft({});
    });
  }, []);

  const value = (f) => (f in draft ? draft[f] : record?.[f] ?? "");

  const setField = (f, v) => {
    setDraft((d) => ({ ...d, [f]: v }));
    callbacks?.NotifyEvent?.("FieldChanged", {
      fieldName: f,
      oldValue: record?.[f],
      newValue: v,
      timestamp: new Date(),
    });
  };

  if (!record && !isCreate) {
    return <div style={{ padding: 24 }}>No record loaded.</div>;
  }

  return (
    <div style={{
      padding: 24,
      background: "var(--mj-bg-surface, #fff)",
      color: "var(--mj-text-primary, #1f2937)",
      borderRadius: 8,
      border: "1px solid var(--mj-border-default, #e0e0e0)",
    }}>
      <h2 style={{ margin: 0, marginBottom: 16 }}>
        {isCreate ? "New " + (entityMetadata?.displayName || entityName) : value(entityMetadata?.nameField || "Name") || "(unnamed)"}
      </h2>

      {/* TODO: render each entityMetadata.fields entry as an input.
          Use value(fieldName) to read, setField(fieldName, newValue) to write.
          See the form-builder template at metadata/prompts/templates/sage/form-builder.template.md
          for full guidance, or open this component in chat to have the
          Form Builder agent extend it.

          DO NOT render Save / Cancel / Edit / Delete buttons here — the
          host toolbar above this component provides all four. Save is
          wired via the RequestSave method registered above. */}
    </div>
  );
}`;
  }

  /** Sanitises a human-readable component name into a JS identifier. */
  private toIdentifier(name: string): string {
    const cleaned = name.replace(/[^A-Za-z0-9]/g, '');
    if (!cleaned) return '';
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  // ============================================================
  // IMPORT / EXPORT
  // ============================================================

  ToggleExportDropdown(): void {
    this.exportDropdownOpen = !this.exportDropdownOpen;
  }

  @HostListener('document:click', ['$event'])
  OnDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.header-dropdown')) {
      this.exportDropdownOpen = false;
    }
  }

  ImportFromFile(): void {
    this.fileInput?.nativeElement.click();
  }

  ImportFromText(): void {
    this.ShowTextImportDialog = true;
    this.cdr.detectChanges();
  }

  OnTextImportSpec(spec: ComponentSpec): void {
    this.ShowTextImportDialog = false;
    this.handleSpecImport(spec, 'text-import.json', 'Text');
    this.cdr.detectChanges();
  }

  OnTextImportCancel(): void {
    this.ShowTextImportDialog = false;
    this.cdr.detectChanges();
  }

  ImportFromArtifact(): void {
    this.ShowArtifactLoadDialog = true;
    this.cdr.detectChanges();
  }

  OnArtifactLoadClose(result: ArtifactLoadResult | undefined): void {
    this.ShowArtifactLoadDialog = false;
    if (!result) {
      this.cdr.detectChanges();
      return;
    }

    const artifactComponent: FileLoadedComponent = {
      id: this.state.GenerateId(),
      name: result.spec.name,
      description: result.spec.description,
      specification: result.spec,
      filename: `${result.artifactName} (v${result.versionNumber})`,
      loadedAt: new Date(),
      isFileLoaded: true,
      type: result.spec.type || 'Component',
      status: 'Artifact',
      sourceArtifactID: result.artifactID,
      sourceVersionID: result.versionID
    };

    this.state.AddFileLoadedComponent(artifactComponent);
    this.state.ExpandedComponent = artifactComponent;
    this.state.RunComponent(artifactComponent);

    this.notificationService.CreateSimpleNotification(
      `Loaded "${result.spec.name}" from artifact`,
      'success',
      3000
    );
    this.cdr.detectChanges();
  }

  async HandleFileSelect(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !file.name.endsWith('.json')) return;

    try {
      const content = await this.readFile(file);
      const spec = JSON.parse(content) as ComponentSpec;
      if (!spec.name || !spec.code) {
        console.error('Invalid spec: missing name or code');
        return;
      }
      this.handleSpecImport(spec, file.name, 'File');
      input.value = '';
    } catch (error) {
      console.error('Error loading file:', error);
    }
  }

  private handleSpecImport(spec: ComponentSpec, filename: string, status: string): void {
    const component: FileLoadedComponent = {
      id: this.state.GenerateId(),
      name: spec.name,
      description: spec.description,
      specification: spec,
      filename,
      loadedAt: new Date(),
      isFileLoaded: true,
      type: spec.type || 'Component',
      status
    };

    this.state.AddFileLoadedComponent(component);
    this.state.ExpandedComponent = component;
    this.state.RunComponent(component);
  }

  ExportToArtifact(): void {
    this.exportDropdownOpen = false;
    const currentSpec = this.state.GetCurrentSpec();
    if (!currentSpec || !this.state.SelectedComponent) return;

    this.ShowArtifactSelectionDialog = true;
    this.cdr.detectChanges();
  }

  async OnArtifactSelectionClose(result: ArtifactSelectionResult | undefined): Promise<void> {
    this.ShowArtifactSelectionDialog = false;
    if (!result?.action) {
      this.cdr.detectChanges();
      return;
    }

    const currentSpec = this.state.GetCurrentSpec();
    if (!currentSpec) return;

    try {
      const artifact = result.artifact;
      let version: MJArtifactVersionEntity;

      if (result.action === 'update-version' && result.versionToUpdate) {
        version = result.versionToUpdate;
      } else {
        version = await this.metadata.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions');
        version.ArtifactID = artifact.ID;
        version.UserID = this.metadata.CurrentUser.ID;

        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const versionsResult = await rv.RunView<MJArtifactVersionEntity>({
          EntityName: 'MJ: Artifact Versions',
          ExtraFilter: `ArtifactID = '${artifact.ID}'`,
          OrderBy: 'VersionNumber DESC',
          MaxRows: 1,
          ResultType: 'entity_object'
        });

        version.VersionNumber = (versionsResult.Success && versionsResult.Results?.length > 0)
          ? versionsResult.Results[0].VersionNumber + 1
          : 1;
      }

      version.Content = JSON.stringify(currentSpec, null, 2);
      version.ContentHash = await this.generateSHA256Hash(version.Content);
      version.Name = currentSpec.name;
      version.Description = currentSpec.description || null;
      const timestamp = new Date().toISOString();
      const actionText = result.action === 'update-version' ? 'Updated' : 'Created';
      version.Comments = `${actionText} from Component Studio at ${timestamp}`;

      const saved = await version.Save();
      if (saved) {
        this.notificationService.CreateSimpleNotification(
          `Saved as artifact version ${version.VersionNumber}`,
          'success',
          3000
        );
      } else {
        this.notificationService.CreateSimpleNotification('Failed to save artifact version', 'error');
      }
    } catch (error) {
      console.error('Error saving to artifact:', error);
      this.notificationService.CreateSimpleNotification('Error saving to artifact', 'error');
    }
    this.cdr.detectChanges();
  }

  ExportToFile(): void {
    this.exportDropdownOpen = false;
    const currentSpec = this.state.GetCurrentSpec();
    if (!currentSpec || !this.state.SelectedComponent) return;

    const componentName = this.state.GetComponentName(this.state.SelectedComponent);
    const filename = componentName.replace(/\s+/g, '-').replace(/[^a-z0-9\-]/gi, '-').toLowerCase() + '.json';
    const blob = new Blob([JSON.stringify(currentSpec, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async ExportToClipboard(): Promise<void> {
    this.exportDropdownOpen = false;
    const currentSpec = this.state.GetCurrentSpec();
    if (!currentSpec) return;

    try {
      await navigator.clipboard.writeText(JSON.stringify(currentSpec, null, 2));
      this.notificationService.CreateSimpleNotification('Copied to clipboard', 'success', 2000);
    } catch (error) {
      this.notificationService.CreateSimpleNotification('Failed to copy to clipboard', 'error');
    }
  }

  async RefreshData(): Promise<void> {
    await this.state.LoadComponents();
  }

  // ============================================================
  // RESIZE HANDLERS
  // ============================================================

  OnLeftResizeStart(event: MouseEvent): void {
    event.preventDefault();
    this.resizeType = 'left';
    this.resizeStartX = event.clientX;
    this.resizeStartValue = this.leftPanelWidth;
    this.addResizeListeners();
  }

  OnRightResizeStart(event: MouseEvent): void {
    event.preventDefault();
    this.resizeType = 'right';
    this.resizeStartX = event.clientX;
    this.resizeStartValue = this.rightPanelWidth;
    this.addResizeListeners();
  }

  OnCenterResizeStart(event: MouseEvent): void {
    event.preventDefault();
    this.resizeType = 'center';
    this.resizeStartX = event.clientX;
    this.resizeStartValue = this.previewFlexPercent;
    this.addResizeListeners();
  }

  private addResizeListeners(): void {
    this.IsResizing = true;
    document.addEventListener('mousemove', this.onResizeMove);
    document.addEventListener('mouseup', this.onResizeEnd);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  private onResizeMove = (event: MouseEvent): void => {
    if (this.resizeType === 'left') {
      const delta = event.clientX - this.resizeStartX;
      this.leftPanelWidth = Math.max(280, Math.min(600, this.resizeStartValue + delta));
    } else if (this.resizeType === 'right') {
      const delta = this.resizeStartX - event.clientX;
      this.rightPanelWidth = Math.max(300, Math.min(600, this.resizeStartValue + delta));
    } else if (this.resizeType === 'center') {
      const centerPanel = document.querySelector('.panel-center') as HTMLElement;
      if (centerPanel) {
        const rect = centerPanel.getBoundingClientRect();
        const relativeX = event.clientX - rect.left;
        const percent = Math.max(20, Math.min(80, (relativeX / rect.width) * 100));
        this.previewFlexPercent = percent;
        this.previewFlex = `1 1 ${percent}%`;
        this.editorFlex = `1 1 ${100 - percent}%`;
      }
    }
    this.cdr.detectChanges();
  };

  private onResizeEnd = (): void => {
    this.IsResizing = false;
    this.resizeType = null;
    document.removeEventListener('mousemove', this.onResizeMove);
    document.removeEventListener('mouseup', this.onResizeEnd);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    this.saveUserPreferencesDebounced();
  };

  // ============================================================
  // HELPERS
  // ============================================================

  private readFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  private async generateSHA256Hash(content: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
}
