import { Component, AfterViewInit, OnDestroy, ViewChild, ElementRef, ChangeDetectorRef, HostListener } from '@angular/core';
import { BaseDashboard } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { Metadata } from '@memberjunction/core';
import {
  ComponentEntityExtended,
  ArtifactVersionEntity,
  ResourceData,
  UserInfoEngine
} from '@memberjunction/core-entities';
import { Subject, takeUntil } from 'rxjs';
import { ComponentSpec } from '@memberjunction/interactive-component-types';
import { SharedService } from '@memberjunction/ng-shared';
import { DialogService, DialogRef } from '@progress/kendo-angular-dialog';
import { TextImportDialogComponent } from './components/text-import-dialog.component';
import { ArtifactSelectionDialogComponent, ArtifactSelectionResult } from './components/artifact-selection-dialog.component';
import { ArtifactLoadDialogComponent, ArtifactLoadResult } from './components/artifact-load-dialog.component';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { ComponentStudioStateService, FileLoadedComponent, ComponentError } from './services/component-studio-state.service';
import { ComponentVersionService } from './services/component-version.service';
import { SaveVersionResult } from './components/save-version-dialog/save-version-dialog.component';
import { RunView } from '@memberjunction/core';

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

  // --- Status bar ---
  public LastSavedTime: Date | null = null;

  // --- Preferences ---
  private prefsLoaded = false;

  @ViewChild('fileInput', { static: false }) fileInput?: ElementRef<HTMLInputElement>;

  private destroy$ = new Subject<void>();
  private metadata: Metadata = new Metadata();

  constructor(
    public state: ComponentStudioStateService,
    public versionService: ComponentVersionService,
    private cdr: ChangeDetectorRef,
    private dialogService: DialogService,
    private notificationService: MJNotificationService
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

    this.loadUserPreferences();
    await this.state.LoadComponents();
    this.NotifyLoadComplete();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected initDashboard(): void {
    // Initialize dashboard
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
    } else {
      this.notificationService.CreateSimpleNotification(
        'Failed to save version',
        'error'
      );
    }
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
    const newSpec: ComponentSpec = {
      name: result.name,
      title: result.title,
      description: result.description,
      type: result.type,
      location: 'embedded',
      exampleUsage: '',
      code: this.getTemplateCode(result.name, result.type),
      functionalRequirements: '',
      dataRequirements: { mode: 'views', entities: [], queries: [], description: '' },
      technicalDesign: ''
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
    const dialogRef = this.dialogService.open({
      content: TextImportDialogComponent,
      width: 700,
      height: 600,
      minWidth: 500,
      title: '',
      actions: []
    });

    const instance = dialogRef.content.instance as TextImportDialogComponent;
    instance.importSpec.subscribe((spec: ComponentSpec) => {
      this.handleSpecImport(spec, 'text-import.json', 'Text');
      dialogRef.close();
    });
    instance.cancelDialog.subscribe(() => dialogRef.close());
  }

  async ImportFromArtifact(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      const dialogRef = this.dialogService.open({
        content: ArtifactLoadDialogComponent,
        width: 1200,
        height: 700
      });

      const result = await dialogRef.result.toPromise() as ArtifactLoadResult | undefined;
      if (!result) return;

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
    } catch (error) {
      if (error && error !== 'cancel') {
        console.error('Error loading from artifact:', error);
        this.notificationService.CreateSimpleNotification(
          'Failed to load from artifact',
          'error'
        );
      }
    }
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

  async ExportToArtifact(): Promise<void> {
    this.exportDropdownOpen = false;
    const currentSpec = this.state.GetCurrentSpec();
    if (!currentSpec || !this.state.SelectedComponent) return;

    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      const dialogRef = this.dialogService.open({
        content: ArtifactSelectionDialogComponent,
        width: 1200,
        height: 900
      });

      const result = await dialogRef.result.toPromise() as ArtifactSelectionResult | undefined;
      if (!result?.action) return;

      const artifact = result.artifact;
      let version: ArtifactVersionEntity;

      if (result.action === 'update-version' && result.versionToUpdate) {
        version = result.versionToUpdate;
      } else {
        version = await this.metadata.GetEntityObject<ArtifactVersionEntity>('MJ: Artifact Versions');
        version.ArtifactID = artifact.ID;
        version.UserID = this.metadata.CurrentUser.ID;

        const rv = new RunView();
        const versionsResult = await rv.RunView<ArtifactVersionEntity>({
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

/**
 * Function to prevent tree shaking of the ComponentStudioDashboardComponent.
 */
export function LoadComponentStudioDashboard() {
  // This function doesn't need to do anything
}
