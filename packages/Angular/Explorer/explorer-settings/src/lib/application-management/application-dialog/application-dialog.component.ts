import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, OnChanges, SimpleChanges, inject, HostListener, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { Metadata, RunView } from '@memberjunction/core';
import { MJApplicationEntity, MJApplicationEntityEntity, MJEntityEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';

import { BaseAngularComponent } from '@memberjunction/ng-base-types';
export interface ApplicationDialogData {
  application?: MJApplicationEntity;
  mode: 'create' | 'edit';
}

interface ApplicationEntityConfig {
  entity: MJEntityEntity;
  applicationEntity?: MJApplicationEntityEntity;
  sequence: number;
  defaultForNewUser: boolean;
  isNew: boolean;
  hasChanges: boolean;
}

export interface ApplicationDialogResult {
  action: 'save' | 'cancel';
  application?: MJApplicationEntity;
}

@Component({
  standalone: false,
  selector: 'mj-application-dialog',
  templateUrl: './application-dialog.component.html',
  styleUrls: ['./application-dialog.component.css']
})
export class ApplicationDialogComponent extends BaseAngularComponent implements OnInit, OnDestroy, OnChanges {
  @Input() Data: ApplicationDialogData | null = null;

  /** @deprecated Use {@link Data}. */
  @Input() set data(value: ApplicationDialogData | null) {
    this.Data = value;
  }
  /** @deprecated Use {@link Data}. */
  get data(): ApplicationDialogData | null {
    return this.Data;
  }
  @Input() Visible = false;

  /** @deprecated Use {@link Visible}. */
  @Input() set visible(value: ApplicationDialogComponent['Visible']) {
    this.Visible = value;
  }
  /** @deprecated Use {@link Visible}. */
  get visible(): ApplicationDialogComponent['Visible'] {
    return this.Visible;
  }
  @Output() Result = new EventEmitter<ApplicationDialogResult>();

  /**
   * @deprecated Use {@link Result}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (result) keeps working. Must stay AFTER Result: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() result = this.Result;

  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);
  private get metadata() { return this.ProviderToUse; }
  public ApplicationForm: FormGroup;

  /** @deprecated Use {@link ApplicationForm}. */
  public get applicationForm(): FormGroup {
    return this.ApplicationForm;
  }
  /** @deprecated Use {@link ApplicationForm}. */
  public set applicationForm(value: FormGroup) {
    this.ApplicationForm = value;
  }
  public isLoading = false;
  public error: string | null = null;

  // Entity management
  public ApplicationEntities: ApplicationEntityConfig[] = [];

  /** @deprecated Use {@link ApplicationEntities}. */
  public get applicationEntities(): ApplicationEntityConfig[] {
    return this.ApplicationEntities;
  }
  /** @deprecated Use {@link ApplicationEntities}. */
  public set applicationEntities(value: ApplicationEntityConfig[]) {
    this.ApplicationEntities = value;
  }
  public AvailableEntities: MJEntityEntity[] = [];

  /** @deprecated Use {@link AvailableEntities}. */
  public get availableEntities(): MJEntityEntity[] {
    return this.AvailableEntities;
  }
  /** @deprecated Use {@link AvailableEntities}. */
  public set availableEntities(value: MJEntityEntity[]) {
    this.AvailableEntities = value;
  }
  public AllEntities: MJEntityEntity[] = [];

  /** @deprecated Use {@link AllEntities}. */
  public get allEntities(): MJEntityEntity[] {
    return this.AllEntities;
  }
  /** @deprecated Use {@link AllEntities}. */
  public set allEntities(value: MJEntityEntity[]) {
    this.AllEntities = value;
  }

  // Search filter for available entities
  public EntitySearchTerm = '';

  /** @deprecated Use {@link EntitySearchTerm}. */
  public get entitySearchTerm() {
    return this.EntitySearchTerm;
  }
  /** @deprecated Use {@link EntitySearchTerm}. */
  public set entitySearchTerm(value) {
    this.EntitySearchTerm = value;
  }

  // Section expansion state
  public SectionExpanded = {
    basicInfo: true,
    entities: true,
    systemInfo: false
  };

  /** @deprecated Use {@link SectionExpanded}. */
  public get sectionExpanded() {
    return this.SectionExpanded;
  }
  /** @deprecated Use {@link SectionExpanded}. */
  public set sectionExpanded(value) {
    this.SectionExpanded = value;
  }

  // Fullscreen state
  public IsFullscreen = false;

  /** @deprecated Use {@link IsFullscreen}. */
  public get isFullscreen() {
    return this.IsFullscreen;
  }
  /** @deprecated Use {@link IsFullscreen}. */
  public set isFullscreen(value) {
    this.IsFullscreen = value;
  }

  constructor() {
    super();
    this.ApplicationForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(100)]],
      description: ['']
    });
  }

  ngOnInit(): void {
    // Initial setup
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.Visible) {
      this.initializeDialog();
    }
  }

  ngOnDestroy(): void {
    // Cleanup if needed
  }

  private async initializeDialog(): Promise<void> {
    if (!this.Visible) return;
    
    try {
      this.isLoading = true;
      this.error = null;
      
      // Load all entities first
      await this.loadAllEntities();
      
      if (this.Data?.application && this.IsEditMode) {
        await this.loadApplicationData();
      } else {
        this.resetForm();
      }
    } catch (error: unknown) {
      console.error('Error initializing dialog:', error);
      this.ngZone.run(() => {
        this.error = error instanceof Error ? error.message : 'Failed to load dialog data';
        this.cdr.markForCheck();
      });
    } finally {
      this.ngZone.run(() => {
        this.isLoading = false;
        this.cdr.markForCheck();
      });
    }
  }

  private async loadAllEntities(): Promise<void> {
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const result = await rv.RunView<MJEntityEntity>({
      EntityName: 'MJ: Entities',
      ResultType: 'entity_object',
      OrderBy: 'Name ASC'
    });
    
    this.AllEntities = result.Success ? result.Results : [];
  }

  private resetForm(): void {
    this.ApplicationForm.reset({
      name: '',
      description: ''
    });
    this.ApplicationEntities = [];
    this.AvailableEntities = [...this.AllEntities];
    this.EntitySearchTerm = '';
    this.error = null;
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.Visible) {
      this.onCancel();
    }
  }

  public get WindowTitle(): string {
    return this.IsEditMode ? 'Edit Application' : 'Create New Application';
  }

  /** @deprecated Use {@link WindowTitle}. */
  public get windowTitle(): string {
    return this.WindowTitle;
  }

  public get IsEditMode(): boolean {
    return this.Data?.mode === 'edit';
  }

  /** @deprecated Use {@link IsEditMode}. */
  public get isEditMode(): boolean {
    return this.IsEditMode;
  }

  private async loadApplicationData(): Promise<void> {
    if (!this.Data?.application) return;

    const app = this.Data.application;
    this.ApplicationForm.patchValue({
      name: app.Name,
      description: app.Description
    });

    // Load existing MJApplicationEntity records
    await this.loadApplicationEntities(app.ID);
  }

  private async loadApplicationEntities(applicationId: string): Promise<void> {
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const result = await rv.RunView<MJApplicationEntityEntity>({
        EntityName: 'MJ: Application Entities',
        ExtraFilter: `ApplicationID='${applicationId}'`,
        ResultType: 'entity_object',
        OrderBy: 'Sequence ASC'
      });

      if (result.Success && result.Results) {
        this.ApplicationEntities = [];
        const usedEntityIds = new Set<string>();

        for (const appEntity of result.Results) {
          const entity = this.AllEntities.find(e => UUIDsEqual(e.ID, appEntity.EntityID));
          if (entity) {
            this.ApplicationEntities.push({
              entity,
              applicationEntity: appEntity,
              sequence: appEntity.Sequence || 0,
              defaultForNewUser: appEntity.DefaultForNewUser || false,
              isNew: false,
              hasChanges: false
            });
            usedEntityIds.add(entity.ID);
          }
        }

        // Set available entities (excluding already assigned ones)
        this.AvailableEntities = this.AllEntities.filter(e => !usedEntityIds.has(e.ID));
      }
    } catch (error) {
      console.warn('Failed to load application entities:', error);
      this.AvailableEntities = [...this.AllEntities];
    }
  }

  public AddEntity(entity: MJEntityEntity): void {
    // Add entity to application
    this.ApplicationEntities.push({
      entity,
      sequence: this.ApplicationEntities.length + 1,
      defaultForNewUser: false,
      isNew: true,
      hasChanges: false
    });

    // Update all sequences to be consecutive
    this.updateSequences();

    // Remove from available entities
    this.AvailableEntities = this.AvailableEntities.filter(e => !UUIDsEqual(e.ID, entity.ID));
  }

  /** @deprecated Use {@link AddEntity}. */
  public addEntity(entity: MJEntityEntity): void {
    return this.AddEntity(entity);
  }

  public RemoveEntity(config: ApplicationEntityConfig): void {
    // Remove from application entities
    this.ApplicationEntities = this.ApplicationEntities.filter(ae => !UUIDsEqual(ae.entity.ID, config.entity.ID));
    
    // Update all sequences to be consecutive
    this.updateSequences();
    
    // Add back to available entities if not already there
    if (!this.AvailableEntities.find(e => UUIDsEqual(e.ID, config.entity.ID))) {
      this.AvailableEntities.push(config.entity);
      this.AvailableEntities.sort((a, b) => (a.Name || '').localeCompare(b.Name || ''));
    }
  }

  /** @deprecated Use {@link RemoveEntity}. */
  public removeEntity(config: ApplicationEntityConfig): void {
    return this.RemoveEntity(config);
  }

  public MoveEntityUp(index: number): void {
    if (index > 0) {
      const temp = this.ApplicationEntities[index];
      this.ApplicationEntities[index] = this.ApplicationEntities[index - 1];
      this.ApplicationEntities[index - 1] = temp;
      this.updateSequences();
    }
  }

  /** @deprecated Use {@link MoveEntityUp}. */
  public moveEntityUp(index: number): void {
    return this.MoveEntityUp(index);
  }

  public MoveEntityDown(index: number): void {
    if (index < this.ApplicationEntities.length - 1) {
      const temp = this.ApplicationEntities[index];
      this.ApplicationEntities[index] = this.ApplicationEntities[index + 1];
      this.ApplicationEntities[index + 1] = temp;
      this.updateSequences();
    }
  }

  /** @deprecated Use {@link MoveEntityDown}. */
  public moveEntityDown(index: number): void {
    return this.MoveEntityDown(index);
  }

  private updateSequences(): void {
    this.ApplicationEntities.forEach((config, index) => {
      config.sequence = index + 1;
      if (!config.isNew) {
        config.hasChanges = true;
      }
    });
  }

  public OnDefaultForNewUserChange(config: ApplicationEntityConfig): void {
    if (!config.isNew) {
      config.hasChanges = true;
    }
  }

  /** @deprecated Use {@link OnDefaultForNewUserChange}. */
  public onDefaultForNewUserChange(config: ApplicationEntityConfig): void {
    return this.OnDefaultForNewUserChange(config);
  }

  public get HasEntityChanges(): boolean {
    return this.ApplicationEntities.some(ae => ae.isNew || ae.hasChanges);
  }

  /** @deprecated Use {@link HasEntityChanges}. */
  public get hasEntityChanges(): boolean {
    return this.HasEntityChanges;
  }

  // Filtered available entities based on search term
  public get FilteredAvailableEntities(): MJEntityEntity[] {
    if (!this.EntitySearchTerm || !this.EntitySearchTerm.trim()) {
      return this.AvailableEntities;
    }
    const searchLower = this.EntitySearchTerm.toLowerCase().trim();
    return this.AvailableEntities.filter(entity =>
      (entity.Name || '').toLowerCase().includes(searchLower) ||
      (entity.Description || '').toLowerCase().includes(searchLower)
    );
  }

  /** @deprecated Use {@link FilteredAvailableEntities}. */
  public get filteredAvailableEntities(): MJEntityEntity[] {
    return this.FilteredAvailableEntities;
  }

  public OnEntitySearchChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.EntitySearchTerm = value;
  }

  /** @deprecated Use {@link OnEntitySearchChange}. */
  public onEntitySearchChange(event: Event): void {
    return this.OnEntitySearchChange(event);
  }

  public ClearEntitySearch(): void {
    this.EntitySearchTerm = '';
  }

  /** @deprecated Use {@link ClearEntitySearch}. */
  public clearEntitySearch(): void {
    return this.ClearEntitySearch();
  }

  public toggleSection(section: 'basicInfo' | 'entities' | 'systemInfo'): void {
    this.SectionExpanded[section] = !this.SectionExpanded[section];
  }

  public ToggleFullscreen(): void {
    this.IsFullscreen = !this.IsFullscreen;
  }

  /** @deprecated Use {@link ToggleFullscreen}. */
  public toggleFullscreen(): void {
    return this.ToggleFullscreen();
  }

  public OnEntityDrop(event: CdkDragDrop<ApplicationEntityConfig[]>): void {
    if (event.previousIndex !== event.currentIndex) {
      moveItemInArray(this.ApplicationEntities, event.previousIndex, event.currentIndex);
      this.updateSequences();
    }
  }

  /** @deprecated Use {@link OnEntityDrop}. */
  public onEntityDrop(event: CdkDragDrop<ApplicationEntityConfig[]>): void {
    return this.OnEntityDrop(event);
  }

  public async OnSubmit(): Promise<void> {
    if (this.ApplicationForm.invalid) {
      this.markFormGroupTouched(this.ApplicationForm);
      return;
    }

    this.isLoading = true;
    this.error = null;

    try {
      let application: MJApplicationEntity;

      if (this.IsEditMode && this.Data?.application) {
        // Edit existing application
        application = this.Data.application;
      } else {
        // Create new application
        application = await this.metadata.GetEntityObject<MJApplicationEntity>('MJ: Applications');
        application.NewRecord();
      }

      // Update application properties
      const formValue = this.ApplicationForm.value;
      application.Name = formValue.name;
      application.Description = formValue.description || null;

      // Save application
      const saveResult = await application.Save();
      if (!saveResult) {
        throw new Error(application.LatestResult?.Message || 'Failed to save application');
      }

      // Save application entities if there are changes
      if (this.HasEntityChanges) {
        await this.saveApplicationEntities(application.ID);
      }

      this.Result.emit({ action: 'save', application });

    } catch (error: unknown) {
      console.error('Error saving application:', error);
      this.ngZone.run(() => {
        this.error = error instanceof Error ? error.message : 'An unexpected error occurred';
        this.cdr.markForCheck();
      });
    } finally {
      this.ngZone.run(() => {
        this.isLoading = false;
        this.cdr.markForCheck();
      });
    }
  }

  /** @deprecated Use {@link OnSubmit}. */
  public async onSubmit(): Promise<void> {
    return this.OnSubmit();
  }

  private async saveApplicationEntities(applicationId: string): Promise<void> {
    // Save or update each MJApplicationEntity record
    for (const config of this.ApplicationEntities) {
      if (config.isNew || config.hasChanges) {
        let appEntity: MJApplicationEntityEntity;

        if (config.isNew) {
          // Create new MJApplicationEntity
          appEntity = await this.metadata.GetEntityObject<MJApplicationEntityEntity>('MJ: Application Entities');
          appEntity.NewRecord();
          appEntity.ApplicationID = applicationId;
          appEntity.EntityID = config.entity.ID;
        } else if (config.applicationEntity) {
          // Update existing MJApplicationEntity
          appEntity = config.applicationEntity;
        } else {
          continue;
        }

        appEntity.Sequence = config.sequence;
        appEntity.DefaultForNewUser = config.defaultForNewUser;

        const saveResult = await appEntity.Save();
        if (!saveResult) {
          console.warn(`Failed to save MJApplicationEntity for ${config.entity.Name}:`, appEntity.LatestResult?.Message);
        }
      }
    }
  }

  public onCancel(): void {
    this.Result.emit({ action: 'cancel' });
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
  }
}