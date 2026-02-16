import { Component, OnInit, OnDestroy, ChangeDetectorRef, ViewChild } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { WindowRef } from '@progress/kendo-angular-dialog';
import { Subject, BehaviorSubject, takeUntil } from 'rxjs';
import { Metadata, RunView } from '@memberjunction/core';
import { MJTemplateEntity, MJAIPromptTypeEntity, MJTemplateContentEntity } from '@memberjunction/core-entities';
import { AIPromptEntityExtended } from "@memberjunction/ai-core-plus";
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { TemplateEditorConfig } from '../../shared/components/template-editor.component';
import { AIPromptManagementService } from '../AIPrompts/ai-prompt-management.service';
import { TemplateSelectorConfig } from '../AIPrompts/template-selector-dialog.component';

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
  prompt: AIPromptEntityExtended;
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
export class CreatePromptDialogComponent implements OnInit, OnDestroy {
  
  // Configuration
  config: CreatePromptConfig = {};
  
  // State management
  private destroy$ = new Subject<void>();
  public result = new Subject<CreatePromptResult | null>();
  
  // Form and validation
  promptForm: FormGroup;
  isLoading$ = new BehaviorSubject<boolean>(false);
  isSaving$ = new BehaviorSubject<boolean>(false);
  
  // Data
  availablePromptTypes$ = new BehaviorSubject<MJAIPromptTypeEntity[]>([]);
  
  // Entities (not saved to database)
  promptEntity: AIPromptEntityExtended | null = null;
  templateEntity: MJTemplateEntity | null = null;
  templateContents: MJTemplateContentEntity[] = [];
  
  // Template editor
  @ViewChild('templateEditor') templateEditor: any; // Template editor component reference
  showTemplateEditor = false;
  templateEditorConfig: TemplateEditorConfig = {
    allowEdit: true,
    showRunButton: false,
    compactMode: true  // Compact mode for dialog
  };
  
  // Template state
  templateMode: 'new' | 'existing' = 'new';

  constructor(
    private dialogRef: WindowRef,
    private cdr: ChangeDetectorRef,
    private aiPromptManagementService: AIPromptManagementService
  ) {
    this.promptForm = this.createForm();
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
    this.promptForm.get('templateMode')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(mode => {
        this.templateMode = mode;
        this.handleTemplateModeChange(mode);
      });
  }

  private async loadInitialData() {
    this.isLoading$.next(true);
    
    try {
      // Load prompt types
      const rv = new RunView();
      const typesResult = await rv.RunView<MJAIPromptTypeEntity>({
        EntityName: 'MJ: AI Prompt Types',
        OrderBy: 'Name ASC',
        ResultType: 'entity_object'
      });

      if (typesResult.Success && typesResult.Results) {
        this.availablePromptTypes$.next(typesResult.Results);
        
        // Set default type if not specified
        if (!this.config.initialTypeID && typesResult.Results.length > 0) {
          this.promptForm.patchValue({ typeID: typesResult.Results[0].ID });
        }
      }

      // Create the prompt entity
      const md = new Metadata();
      this.promptEntity = await md.GetEntityObject<AIPromptEntityExtended>('MJ: AI Prompts');
      this.promptEntity.NewRecord();
      
      // Set default values
      this.promptEntity.Status = 'Pending';
      this.promptEntity.OutputType = 'string';
      this.promptEntity.ValidationBehavior = 'None';
      this.promptEntity.EnableCaching = false;

      // Create default template since it's required
      await this.createNewTemplate();
      this.showTemplateEditor = true;

    } catch (error) {
      console.error('Error loading prompt creation data:', error);
      MJNotificationService.Instance.CreateSimpleNotification(
        'Error loading data for prompt creation',
        'error',
        3000
      );
    } finally {
      this.isLoading$.next(false);
    }
  }

  public async handleTemplateModeChange(mode: string) {
    if (mode === 'new') {
      await this.createNewTemplate();
      this.showTemplateEditor = true;
    } else if (mode === 'existing') {
      await this.openTemplateSelector();
    }
    
    this.cdr.detectChanges();
  }

  private async createNewTemplate() {
    if (!this.promptEntity) return;

    try {
      const md = new Metadata();
      
      // Create template entity
      this.templateEntity = await md.GetEntityObject<MJTemplateEntity>('MJ: Templates');
      this.templateEntity.NewRecord();
      
      const promptName = this.promptForm.get('name')?.value || 'New Prompt';
      this.templateEntity.Name = `${promptName} Template`;
      this.templateEntity.Description = `Template for ${promptName}`;
      // Set UserID on template (required field)
      this.templateEntity.UserID = md.CurrentUser.ID;
      
      // Link template to prompt
      this.promptEntity.TemplateID = this.templateEntity.ID;

    } catch (error) {
      console.error('Error creating new template:', error);
      MJNotificationService.Instance.CreateSimpleNotification(
        'Error creating template',
        'error',
        3000
      );
    }
  }

  public onTemplateContentChange(contents: MJTemplateContentEntity[]) {
    this.templateContents = contents || [];
  }

  public async save() {
    if (!this.promptForm.valid || !this.promptEntity) {
      MJNotificationService.Instance.CreateSimpleNotification(
        'Please fill in all required fields',
        'warning',
        3000
      );
      return;
    }

    this.isSaving$.next(true);

    try {
      // Update prompt entity with form values
      const formValue = this.promptForm.value;
      this.promptEntity.Name = formValue.name;
      this.promptEntity.Description = formValue.description || '';
      this.promptEntity.TypeID = formValue.typeID;
      this.promptEntity.Status = formValue.status;
      this.promptEntity.OutputType = formValue.outputType;

      // Get template contents if template editor is active
      if (this.templateEditor && this.showTemplateEditor) {
        // Get the template contents from the editor without saving
        // The parent form will handle saving in the proper order
        this.templateContents = this.templateEditor.templateContents || [];
        
        // Ensure the template contents have the correct TemplateID
        if (this.templateContents && this.templateEntity) {
          this.templateContents.forEach(content => {
            content.TemplateID = this.templateEntity!.ID;
          });
        }
      }

      // Return the created entities (not saved to database)
      const result: CreatePromptResult = {
        prompt: this.promptEntity,
        template: this.templateEntity || undefined,
        templateContents: this.templateContents.length > 0 ? this.templateContents : undefined
      };

      this.result.next(result);
      this.dialogRef.close();

    } catch (error) {
      console.error('Error preparing prompt for creation:', error);
      MJNotificationService.Instance.CreateSimpleNotification(
        'Error preparing prompt for creation',
        'error',
        3000
      );
    } finally {
      this.isSaving$.next(false);
    }
  }

  public cancel() {
    this.result.next(null);
    this.dialogRef.close();
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
        this.templateEntity = result.selectedTemplates[0];
        this.promptEntity!.TemplateID = this.templateEntity.ID;
        
        // Update UI to show selected template info
        this.showTemplateEditor = false;
        
        MJNotificationService.Instance.CreateSimpleNotification(
          `Template "${this.templateEntity.Name}" linked successfully`,
          'success',
          3000
        );
      } else {
        // User cancelled, revert to new template mode
        this.promptForm.patchValue({ templateMode: 'new' });
        await this.createNewTemplate();
        this.showTemplateEditor = true;
      }
    } catch (error) {
      console.error('Error opening template selector:', error);
      MJNotificationService.Instance.CreateSimpleNotification(
        'Error opening template selector',
        'error',
        3000
      );
      
      // Revert to new template mode
      this.promptForm.patchValue({ templateMode: 'new' });
      await this.createNewTemplate();
      this.showTemplateEditor = true;
    }
  }

  // Getter for template debugging
  public get currentTemplate(): MJTemplateEntity | null {
    return this.templateEntity;
  }
}