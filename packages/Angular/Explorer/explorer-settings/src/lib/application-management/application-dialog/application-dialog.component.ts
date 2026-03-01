import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, OnChanges, SimpleChanges, inject, HostListener, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { Metadata, RunView } from '@memberjunction/core';
import { MJApplicationEntity, MJApplicationEntityEntity, MJEntityEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';

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
export class ApplicationDialogComponent implements OnInit, OnDestroy, OnChanges {
  @Input() data: ApplicationDialogData | null = null;
  @Input() visible = false;
  @Output() result = new EventEmitter<ApplicationDialogResult>();

  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);
  private metadata = new Metadata();

  public applicationForm: FormGroup;
  public isLoading = false;
  public error: string | null = null;

  // Entity management
  public applicationEntities: ApplicationEntityConfig[] = [];
  public availableEntities: MJEntityEntity[] = [];
  public allEntities: MJEntityEntity[] = [];

  // Search filter for available entities
  public entitySearchTerm = '';

  // Section expansion state
  public sectionExpanded = {
    basicInfo: true,
    entities: true,
    systemInfo: false
  };

  // Fullscreen state
  public isFullscreen = false;

  constructor() {
    this.applicationForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(100)]],
      description: ['']
    });
  }

  ngOnInit(): void {
    // Initial setup
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      this.initializeDialog();
    }
  }

  ngOnDestroy(): void {
    // Cleanup if needed
  }

  private async initializeDialog(): Promise<void> {
    if (!this.visible) return;
    
    try {
      this.isLoading = true;
      this.error = null;
      
      // Load all entities first
      await this.loadAllEntities();
      
      if (this.data?.application && this.isEditMode) {
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
    const rv = new RunView();
    const result = await rv.RunView<MJEntityEntity>({
      EntityName: 'MJ: Entities',
      ResultType: 'entity_object',
      OrderBy: 'Name ASC'
    });
    
    this.allEntities = result.Success ? result.Results : [];
  }

  private resetForm(): void {
    this.applicationForm.reset({
      name: '',
      description: ''
    });
    this.applicationEntities = [];
    this.availableEntities = [...this.allEntities];
    this.entitySearchTerm = '';
    this.error = null;
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.visible) {
      this.onCancel();
    }
  }

  public get windowTitle(): string {
    return this.isEditMode ? 'Edit Application' : 'Create New Application';
  }

  public get isEditMode(): boolean {
    return this.data?.mode === 'edit';
  }

  private async loadApplicationData(): Promise<void> {
    if (!this.data?.application) return;

    const app = this.data.application;
    this.applicationForm.patchValue({
      name: app.Name,
      description: app.Description
    });

    // Load existing MJApplicationEntity records
    await this.loadApplicationEntities(app.ID);
  }

  private async loadApplicationEntities(applicationId: string): Promise<void> {
    try {
      const rv = new RunView();
      const result = await rv.RunView<MJApplicationEntityEntity>({
        EntityName: 'MJ: Application Entities',
        ExtraFilter: `ApplicationID='${applicationId}'`,
        ResultType: 'entity_object',
        OrderBy: 'Sequence ASC'
      });

      if (result.Success && result.Results) {
        this.applicationEntities = [];
        const usedEntityIds = new Set<string>();

        for (const appEntity of result.Results) {
          const entity = this.allEntities.find(e => UUIDsEqual(e.ID, appEntity.EntityID))
          if (entity) {
            this.applicationEntities.push({
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
        this.availableEntities = this.allEntities.filter(e => !usedEntityIds.has(e.ID));
      }
    } catch (error) {
      console.warn('Failed to load application entities:', error);
      this.availableEntities = [...this.allEntities];
    }
  }

  public addEntity(entity: MJEntityEntity): void {
    // Add entity to application
    this.applicationEntities.push({
      entity,
      sequence: this.applicationEntities.length + 1,
      defaultForNewUser: false,
      isNew: true,
      hasChanges: false
    });

    // Update all sequences to be consecutive
    this.updateSequences();

    // Remove from available entities
    this.availableEntities = this.availableEntities.filter(e => !UUIDsEqual(e.ID, entity.ID))
  }

  public removeEntity(config: ApplicationEntityConfig): void {
    // Remove from application entities
    this.applicationEntities = this.applicationEntities.filter(ae => !UUIDsEqual(ae.entity.ID, config.entity.ID))
    
    // Update all sequences to be consecutive
    this.updateSequences();
    
    // Add back to available entities if not already there
    if (!this.availableEntities.find(e => UUIDsEqual(e.ID, config.entity.ID))) {
      this.availableEntities.push(config.entity);
      this.availableEntities.sort((a, b) => (a.Name || '').localeCompare(b.Name || ''));
    }
  }

  public moveEntityUp(index: number): void {
    if (index > 0) {
      const temp = this.applicationEntities[index];
      this.applicationEntities[index] = this.applicationEntities[index - 1];
      this.applicationEntities[index - 1] = temp;
      this.updateSequences();
    }
  }

  public moveEntityDown(index: number): void {
    if (index < this.applicationEntities.length - 1) {
      const temp = this.applicationEntities[index];
      this.applicationEntities[index] = this.applicationEntities[index + 1];
      this.applicationEntities[index + 1] = temp;
      this.updateSequences();
    }
  }

  private updateSequences(): void {
    this.applicationEntities.forEach((config, index) => {
      config.sequence = index + 1;
      if (!config.isNew) {
        config.hasChanges = true;
      }
    });
  }

  public onDefaultForNewUserChange(config: ApplicationEntityConfig): void {
    if (!config.isNew) {
      config.hasChanges = true;
    }
  }

  public get hasEntityChanges(): boolean {
    return this.applicationEntities.some(ae => ae.isNew || ae.hasChanges);
  }

  // Filtered available entities based on search term
  public get filteredAvailableEntities(): MJEntityEntity[] {
    if (!this.entitySearchTerm || !this.entitySearchTerm.trim()) {
      return this.availableEntities;
    }
    const searchLower = this.entitySearchTerm.toLowerCase().trim();
    return this.availableEntities.filter(entity =>
      (entity.Name || '').toLowerCase().includes(searchLower) ||
      (entity.Description || '').toLowerCase().includes(searchLower)
    );
  }

  public onEntitySearchChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.entitySearchTerm = value;
  }

  public clearEntitySearch(): void {
    this.entitySearchTerm = '';
  }

  public toggleSection(section: 'basicInfo' | 'entities' | 'systemInfo'): void {
    this.sectionExpanded[section] = !this.sectionExpanded[section];
  }

  public toggleFullscreen(): void {
    this.isFullscreen = !this.isFullscreen;
  }

  public onEntityDrop(event: CdkDragDrop<ApplicationEntityConfig[]>): void {
    if (event.previousIndex !== event.currentIndex) {
      moveItemInArray(this.applicationEntities, event.previousIndex, event.currentIndex);
      this.updateSequences();
    }
  }

  public async onSubmit(): Promise<void> {
    if (this.applicationForm.invalid) {
      this.markFormGroupTouched(this.applicationForm);
      return;
    }

    this.isLoading = true;
    this.error = null;

    try {
      let application: MJApplicationEntity;

      if (this.isEditMode && this.data?.application) {
        // Edit existing application
        application = this.data.application;
      } else {
        // Create new application
        application = await this.metadata.GetEntityObject<MJApplicationEntity>('MJ: Applications');
        application.NewRecord();
      }

      // Update application properties
      const formValue = this.applicationForm.value;
      application.Name = formValue.name;
      application.Description = formValue.description || null;

      // Save application
      const saveResult = await application.Save();
      if (!saveResult) {
        throw new Error(application.LatestResult?.Message || 'Failed to save application');
      }

      // Save application entities if there are changes
      if (this.hasEntityChanges) {
        await this.saveApplicationEntities(application.ID);
      }

      this.result.emit({ action: 'save', application });

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

  private async saveApplicationEntities(applicationId: string): Promise<void> {
    // Save or update each MJApplicationEntity record
    for (const config of this.applicationEntities) {
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
    this.result.emit({ action: 'cancel' });
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
  }
}