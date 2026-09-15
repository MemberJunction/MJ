import { Component, OnInit, OnDestroy, ChangeDetectorRef, ViewChild, Output, EventEmitter } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Subject, BehaviorSubject, takeUntil } from 'rxjs';
import { Metadata, RunView } from '@memberjunction/core';
import { MJTemplateEntity, MJAIPromptTypeEntity, MJTemplateContentEntity } from '@memberjunction/core-entities';
import { MJAIPromptEntityExtended } from "@memberjunction/ai-core-plus";
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { TemplateEditorConfig } from '../../shared/components/template-editor.component';
import { AIPromptManagementService } from '../AIPrompts/ai-prompt-management.service';
import { TemplateSelectorConfig } from '../AIPrompts/template-selector-dialog.component';

import { BaseAngularComponent } from '@memberjunction/ng-base-types';
export interface CreatePromptConfig {
  /** Title for the dialog */
  title?: string;
  /** Initial name for the prompt */
  initialName?: string;
  /** Pre-selected prompt type ID */
  initialTypeID?: string;
}

export interface CreatePromptResult {
  /** Created prompt entity (not saved to database) */
  prompt: MJAIPromptEntityExtended;
  /** Created template entity (not saved to database) */
  template?: MJTemplateEntity;
  /** Template content entities (not saved to database) */
  templateContents?: MJTemplateContentEntity[];
}

/**
 * Dialog for creating new AI Prompts with essential fields and basic template editing.
 * Creates entities but does not save them - returns entities for parent to add to PendingRecords.
 * This ensures atomicity with the parent form's save operation.
 */
@Component({
  standalone: false,
  selector: 'mj-create-prompt-dialog',
  templateUrl: './create-prompt-dialog.component.html',
  styleUrls: ['./create-prompt-dialog.component.css']
})
export class CreatePromptDialogComponent extends BaseAngularComponent implements OnInit, OnDestroy {
  
  // Configuration
  config: CreatePromptConfig = {};
  
  // State management
  private destroy$ = new Subject<void>();
  public Result = new Subject<CreatePromptResult | null>();

  /** @deprecated Use {@link Result}. */
  public get result() {
    return this.Result;
  }
  /** @deprecated Use {@link Result}. */
  public set result(value) {
    this.Result = value;
  }
  
  // Form and validation
  PromptForm: FormGroup;

  /** @deprecated Use {@link PromptForm}. */
  get promptForm(): FormGroup {
    return this.PromptForm;
  }
  /** @deprecated Use {@link PromptForm}. */
  set promptForm(value: FormGroup) {
    this.PromptForm = value;
  }
  IsLoading$ = new BehaviorSubject<boolean>(false);

  /** @deprecated Use {@link IsLoading$}. */
  get isLoading$() {
    return this.IsLoading$;
  }
  /** @deprecated Use {@link IsLoading$}. */
  set isLoading$(value) {
    this.IsLoading$ = value;
  }
  IsSaving$ = new BehaviorSubject<boolean>(false);

  /** @deprecated Use {@link IsSaving$}. */
  get isSaving$() {
    return this.IsSaving$;
  }
  /** @deprecated Use {@link IsSaving$}. */
  set isSaving$(value) {
    this.IsSaving$ = value;
  }
  
  // Data
  AvailablePromptTypes$ = new BehaviorSubject<MJAIPromptTypeEntity[]>([]);

  /** @deprecated Use {@link AvailablePromptTypes$}. */
  get availablePromptTypes$() {
    return this.AvailablePromptTypes$;
  }
  /** @deprecated Use {@link AvailablePromptTypes$}. */
  set availablePromptTypes$(value) {
    this.AvailablePromptTypes$ = value;
  }
  
  // Entities (not saved to database)
  PromptEntity: MJAIPromptEntityExtended | null = null;

  /** @deprecated Use {@link PromptEntity}. */
  get promptEntity(): MJAIPromptEntityExtended | null {
    return this.PromptEntity;
  }
  /** @deprecated Use {@link PromptEntity}. */
  set promptEntity(value: MJAIPromptEntityExtended | null) {
    this.PromptEntity = value;
  }
  TemplateEntity: MJTemplateEntity | null = null;

  /** @deprecated Use {@link TemplateEntity}. */
  get templateEntity(): MJTemplateEntity | null {
    return this.TemplateEntity;
  }
  /** @deprecated Use {@link TemplateEntity}. */
  set templateEntity(value: MJTemplateEntity | null) {
    this.TemplateEntity = value;
  }
  TemplateContents: MJTemplateContentEntity[] = [];

  /** @deprecated Use {@link TemplateContents}. */
  get templateContents(): MJTemplateContentEntity[] {
    return this.TemplateContents;
  }
  /** @deprecated Use {@link TemplateContents}. */
  set templateContents(value: MJTemplateContentEntity[]) {
    this.TemplateContents = value;
  }
  
  // Template editor
  @ViewChild('templateEditor') TemplateEditor: any;

  /** @deprecated Use {@link TemplateEditor}. */
  get templateEditor(): any {
    return this.TemplateEditor;
  }
  /** @deprecated Use {@link TemplateEditor}. */
  set templateEditor(value: any) {
    this.TemplateEditor = value;
  } // Template editor component reference
  ShowTemplateEditor = false;

  /** @deprecated Use {@link ShowTemplateEditor}. */
  get showTemplateEditor() {
    return this.ShowTemplateEditor;
  }
  /** @deprecated Use {@link ShowTemplateEditor}. */
  set showTemplateEditor(value) {
    this.ShowTemplateEditor = value;
  }
  TemplateEditorConfig: TemplateEditorConfig = {
    allowEdit: true,
    showRunButton: false,
    compactMode: true  // Compact mode for dialog
  };

  /** @deprecated Use {@link TemplateEditorConfig}. */
  get templateEditorConfig(): TemplateEditorConfig {
    return this.TemplateEditorConfig;
  }
  /** @deprecated Use {@link TemplateEditorConfig}. */
  set templateEditorConfig(value: TemplateEditorConfig) {
    this.TemplateEditorConfig = value;
  }
  
  // Template state
  TemplateMode: 'new' | 'existing' = 'new';

  /** @deprecated Use {@link TemplateMode}. */
  get templateMode(): 'new' | 'existing' {
    return this.TemplateMode;
  }
  /** @deprecated Use {@link TemplateMode}. */
  set templateMode(value: 'new' | 'existing') {
    this.TemplateMode = value;
  }

  @Output() DialogClose = new EventEmitter<void>();

  constructor(
    private cdr: ChangeDetectorRef,
    private aiPromptManagementService: AIPromptManagementService
  ) {
    super();
    this.PromptForm = this.createForm();
  }

  ngOnInit() {
    this.loadInitialData();
    this.setupFormWatching();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private createForm(): FormGroup {
    return new FormGroup({
      name: new FormControl(this.config.initialName || '', [Validators.required]),
      description: new FormControl(''),
      typeID: new FormControl(this.config.initialTypeID || '', [Validators.required]),
      status: new FormControl('Pending'),
      outputType: new FormControl('string'),
      templateMode: new FormControl('new')
    });
  }

  private setupFormWatching() {
    // Watch template mode changes
    this.PromptForm.get('templateMode')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(mode => {
        this.TemplateMode = mode;
        this.HandleTemplateModeChange(mode);
      });
  }

  private async loadInitialData() {
    this.IsLoading$.next(true);
    
    try {
      // Load prompt types
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const typesResult = await rv.RunView<MJAIPromptTypeEntity>({
        EntityName: 'MJ: AI Prompt Types',
        OrderBy: 'Name ASC',
        ResultType: 'entity_object'
      });

      if (typesResult.Success && typesResult.Results) {
        this.AvailablePromptTypes$.next(typesResult.Results);
        
        // Set default type if not specified
        if (!this.config.initialTypeID && typesResult.Results.length > 0) {
          this.PromptForm.patchValue({ typeID: typesResult.Results[0].ID });
        }
      }

      // Create the prompt entity
      const md = this.ProviderToUse;
      this.PromptEntity = await md.GetEntityObject<MJAIPromptEntityExtended>('MJ: AI Prompts');
      this.PromptEntity.NewRecord();
      
      // Set default values
      this.PromptEntity.Status = 'Pending';
      this.PromptEntity.OutputType = 'string';
      this.PromptEntity.ValidationBehavior = 'None';
      this.PromptEntity.EnableCaching = false;

      // Create default template since it's required
      await this.createNewTemplate();
      this.ShowTemplateEditor = true;

    } catch (error) {
      console.error('Error loading prompt creation data:', error);
      MJNotificationService.Instance.CreateSimpleNotification(
        'Error loading data for prompt creation',
        'error',
        3000
      );
    } finally {
      this.IsLoading$.next(false);
    }
  }

  public async HandleTemplateModeChange(mode: string) {
    if (mode === 'new') {
      await this.createNewTemplate();
      this.ShowTemplateEditor = true;
    } else if (mode === 'existing') {
      await this.openTemplateSelector();
    }
    
    this.cdr.detectChanges();
  }

  /** @deprecated Use {@link HandleTemplateModeChange}. */
  public async handleTemplateModeChange(mode: string) {
    return this.HandleTemplateModeChange(mode);
  }

  private async createNewTemplate() {
    if (!this.PromptEntity) return;

    try {
      const md = this.ProviderToUse;
      
      // Create template entity
      this.TemplateEntity = await md.GetEntityObject<MJTemplateEntity>('MJ: Templates');
      this.TemplateEntity.NewRecord();
      
      const promptName = this.PromptForm.get('name')?.value || 'New Prompt';
      this.TemplateEntity.Name = `${promptName} Template`;
      this.TemplateEntity.Description = `Template for ${promptName}`;
      // Set UserID on template (required field)
      this.TemplateEntity.UserID = md.CurrentUser.ID;
      
      // Link template to prompt
      this.PromptEntity.TemplateID = this.TemplateEntity.ID;

    } catch (error) {
      console.error('Error creating new template:', error);
      MJNotificationService.Instance.CreateSimpleNotification(
        'Error creating template',
        'error',
        3000
      );
    }
  }

  public OnTemplateContentChange(contents: MJTemplateContentEntity[]) {
    this.TemplateContents = contents || [];
  }

  /** @deprecated Use {@link OnTemplateContentChange}. */
  public onTemplateContentChange(contents: MJTemplateContentEntity[]) {
    return this.OnTemplateContentChange(contents);
  }

  public async save() {
    if (!this.PromptForm.valid || !this.PromptEntity) {
      MJNotificationService.Instance.CreateSimpleNotification(
        'Please fill in all required fields',
        'warning',
        3000
      );
      return;
    }

    this.IsSaving$.next(true);

    try {
      // Update prompt entity with form values
      const formValue = this.PromptForm.value;
      this.PromptEntity.Name = formValue.name;
      this.PromptEntity.Description = formValue.description || '';
      this.PromptEntity.TypeID = formValue.typeID;
      this.PromptEntity.Status = formValue.status;
      this.PromptEntity.OutputType = formValue.outputType;

      // Get template contents if template editor is active
      if (this.TemplateEditor && this.ShowTemplateEditor) {
        // Get the template contents from the editor without saving
        // The parent form will handle saving in the proper order
        this.TemplateContents = this.TemplateEditor.templateContents || [];
        
        // Ensure the template contents have the correct TemplateID
        if (this.TemplateContents && this.TemplateEntity) {
          this.TemplateContents.forEach(content => {
            content.TemplateID = this.TemplateEntity!.ID;
          });
        }
      }

      // Return the created entities (not saved to database)
      const result: CreatePromptResult = {
        prompt: this.PromptEntity,
        template: this.TemplateEntity || undefined,
        templateContents: this.TemplateContents.length > 0 ? this.TemplateContents : undefined
      };

      this.Result.next(result);
      this.DialogClose.emit();

    } catch (error) {
      console.error('Error preparing prompt for creation:', error);
      MJNotificationService.Instance.CreateSimpleNotification(
        'Error preparing prompt for creation',
        'error',
        3000
      );
    } finally {
      this.IsSaving$.next(false);
    }
  }

  public cancel() {
    this.Result.next(null);
    this.DialogClose.emit();
  }

  /**
   * Opens the template selector dialog to link an existing template
   */
  private async openTemplateSelector() {
    const config: TemplateSelectorConfig = {
      title: 'Select Template for AI Prompt',
      showCreateNew: false,
      multiSelect: false,
      showActiveOnly: true
    };

    try {
      const result = await this.aiPromptManagementService.openTemplateSelectorDialog(config).toPromise();
      
      if (result && result.selectedTemplates && result.selectedTemplates.length > 0) {
        // Link the selected template
        this.TemplateEntity = result.selectedTemplates[0];
        this.PromptEntity!.TemplateID = this.TemplateEntity.ID;
        
        // Update UI to show selected template info
        this.ShowTemplateEditor = false;
        
        MJNotificationService.Instance.CreateSimpleNotification(
          `Template "${this.TemplateEntity.Name}" linked successfully`,
          'success',
          3000
        );
      } else {
        // User cancelled, revert to new template mode
        this.PromptForm.patchValue({ templateMode: 'new' });
        await this.createNewTemplate();
        this.ShowTemplateEditor = true;
      }
    } catch (error) {
      console.error('Error opening template selector:', error);
      MJNotificationService.Instance.CreateSimpleNotification(
        'Error opening template selector',
        'error',
        3000
      );
      
      // Revert to new template mode
      this.PromptForm.patchValue({ templateMode: 'new' });
      await this.createNewTemplate();
      this.ShowTemplateEditor = true;
    }
  }

  // Getter for template debugging
  public get CurrentTemplate(): MJTemplateEntity | null {
    return this.TemplateEntity;
  }

  /** @deprecated Use {@link CurrentTemplate}. */
  public get currentTemplate(): MJTemplateEntity | null {
    return this.CurrentTemplate;
  }
}