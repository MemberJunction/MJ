import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { RunView, Metadata, LogError, LogStatus } from '@memberjunction/core';
import { AIPromptModelEntity } from '@memberjunction/core-entities';
import { Subject, BehaviorSubject } from 'rxjs';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { AIModelEntityExtended, AIPromptEntityExtended } from '@memberjunction/ai-core-plus';

interface PromptModelAssociation {
  promptId: string;
  promptName: string;
  modelId: string;
  modelName: string;
  priority: number;
  status: string;
  association: AIPromptModelEntity | null;
  isNew: boolean;
  isModified: boolean;
}

interface MatrixCell {
  promptId: string;
  modelId: string;
  association: PromptModelAssociation | null;
  canAssign: boolean;
}

@Component({
  selector: 'app-model-prompt-priority-matrix',
  templateUrl: './model-prompt-priority-matrix.component.html',
  styleUrls: ['./model-prompt-priority-matrix.component.css']
})
export class ModelPromptPriorityMatrixComponent implements OnInit, OnDestroy {
  @Input() selectedPrompts: AIPromptEntityExtended[] = [];
  @Input() selectedModels: AIModelEntityExtended[] = [];
  @Input() readonly = false;
  
  @Output() associationsChange = new EventEmitter<PromptModelAssociation[]>();
  @Output() stateChange = new EventEmitter<any>();
  @Output() promptSelected = new EventEmitter<AIPromptEntityExtended>();
  
  // Data
  public prompts: AIPromptEntityExtended[] = [];
  public models: AIModelEntityExtended[] = [];
  public associations: PromptModelAssociation[] = [];
  public matrix: MatrixCell[][] = [];
  
  // UI State
  public isLoading = false;
  public loadingMessage = '';
  public error: string | null = null;
  public viewMode: 'matrix' | 'list' = 'matrix';
  public sortBy: 'prompt' | 'model' | 'priority' = 'priority';
  public sortDirection: 'asc' | 'desc' = 'asc';
  public showInactiveAssociations = false;
  
  // Selection and editing
  public selectedCells: Set<string> = new Set();
  public editingCell: string | null = null;
  public bulkEditMode = false;
  public bulkEditPriority = 1;
  public bulkEditStatus = 'Active';
  
  // Filtering
  public promptFilter$ = new BehaviorSubject<string>('');
  public modelFilter$ = new BehaviorSubject<string>('');
  public statusFilter$ = new BehaviorSubject<string>('all');
  
  // Performance metrics
  public performanceData: { [key: string]: any } = {};
  public showPerformanceOverlay = false;
  
  private destroy$ = new Subject<void>();
  
  constructor(private notificationService: MJNotificationService) {}
  
  ngOnInit(): void {
    this.loadData();
  }
  
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  
  public async loadData(): Promise<void> {
    try {
      this.isLoading = true;
      this.error = null;
      this.loadingMessage = 'Loading prompts, models, and associations...';
      
      const [prompts, models, associations] = await Promise.all([
        this.loadPrompts(),
        this.loadModels(),
        this.loadAssociations()
      ]);
      
      this.prompts = this.selectedPrompts.length > 0 ? this.selectedPrompts : prompts;
      this.models = this.selectedModels.length > 0 ? this.selectedModels : models;
      
      this.buildAssociations(associations);
      this.buildMatrix();
      
      LogStatus('Model-prompt priority matrix loaded successfully');
    } catch (error) {
      this.error = 'Failed to load matrix data. Please try again.';
      LogError('Error loading matrix data', undefined, error);
    } finally {
      this.isLoading = false;
    }
  }
  
  private async loadPrompts(): Promise<AIPromptEntityExtended[]> {
    const rv = new RunView();
    const result = await rv.RunView({
      EntityName: 'AI Prompts',
      ExtraFilter: "Status = 'Active'",
      OrderBy: 'Name',
      UserSearchString: '',
      IgnoreMaxRows: false,
      MaxRows: 500
    });
    
    if (result && result.Success && result.Results) {
      return result.Results as AIPromptEntityExtended[];
    } else {
      throw new Error('Failed to load AI prompts');
    }
  }
  
  private async loadModels(): Promise<AIModelEntityExtended[]> {
    const rv = new RunView();
    const result = await rv.RunView({
      EntityName: 'AI Models',
      ExtraFilter: "IsActive = 1",
      OrderBy: 'Name',
      UserSearchString: '',
      IgnoreMaxRows: false,
      MaxRows: 200
    });
    
    if (result && result.Success && result.Results) {
      return result.Results as AIModelEntityExtended[];
    } else {
      throw new Error('Failed to load AI models');
    }
  }
  
  private async loadAssociations(): Promise<AIPromptModelEntity[]> {
    const rv = new RunView();
    const result = await rv.RunView({
      EntityName: 'MJ: AI Prompt Models',
      ExtraFilter: '',
      OrderBy: 'Priority',
      UserSearchString: '',
      IgnoreMaxRows: false,
      MaxRows: 2000
    });
    
    if (result && result.Success && result.Results) {
      return result.Results as AIPromptModelEntity[];
    } else {
      throw new Error('Failed to load prompt-model associations');
    }
  }
  
  private buildAssociations(dbAssociations: AIPromptModelEntity[]): void {
    this.associations = [];
    
    // Create associations for existing database records
    dbAssociations.forEach(dbAssoc => {
      const prompt = this.prompts.find(p => p.ID === dbAssoc.PromptID);
      const model = this.models.find(m => m.ID === dbAssoc.ModelID);
      
      if (prompt && model) {
        this.associations.push({
          promptId: prompt.ID,
          promptName: prompt.Name,
          modelId: model.ID,
          modelName: model.Name,
          priority: dbAssoc.Priority || 1,
          status: dbAssoc.Status || 'Active',
          association: dbAssoc,
          isNew: false,
          isModified: false
        });
      }
    });
  }
  
  private buildMatrix(): void {
    this.matrix = [];
    
    this.prompts.forEach((prompt, promptIndex) => {
      this.matrix[promptIndex] = [];
      
      this.models.forEach((model, modelIndex) => {
        const association = this.associations.find(a => 
          a.promptId === prompt.ID && a.modelId === model.ID
        );
        
        this.matrix[promptIndex][modelIndex] = {
          promptId: prompt.ID,
          modelId: model.ID,
          association: association || null,
          canAssign: this.canAssignModelToPrompt(prompt, model)
        };
      });
    });
  }
  
  private canAssignModelToPrompt(prompt: AIPromptEntityExtended, model: AIModelEntityExtended): boolean {
    // Check model type compatibility
    if (prompt.OutputType && model.AIModelTypeID) {
      // Add business logic for compatibility checking
      return true;
    }
    return true;
  }
  
  public getCellKey(promptIndex: number, modelIndex: number): string {
    return `${promptIndex}-${modelIndex}`;
  }
  
  public getCellClass(cell: MatrixCell): string {
    const classes = ['matrix-cell'];
    
    if (cell.association) {
      classes.push('has-association');
      classes.push(`priority-${Math.min(cell.association.priority, 5)}`);
      
      if (cell.association.status === 'Inactive') {
        classes.push('inactive');
      }
      
      if (cell.association.isNew) {
        classes.push('new');
      }
      
      if (cell.association.isModified) {
        classes.push('modified');
      }
    } else {
      classes.push('no-association');
    }
    
    if (!cell.canAssign) {
      classes.push('cannot-assign');
    }
    
    const cellKey = this.getCellKey(
      this.prompts.findIndex(p => p.ID === cell.promptId),
      this.models.findIndex(m => m.ID === cell.modelId)
    );
    
    if (this.selectedCells.has(cellKey)) {
      classes.push('selected');
    }
    
    if (this.editingCell === cellKey) {
      classes.push('editing');
    }
    
    return classes.join(' ');
  }
  
  public onCellClick(promptIndex: number, modelIndex: number, event: MouseEvent): void {
    if (this.readonly) return;
    
    const cellKey = this.getCellKey(promptIndex, modelIndex);
    const cell = this.matrix[promptIndex][modelIndex];
    
    if (event.ctrlKey || event.metaKey) {
      // Multi-select mode
      if (this.selectedCells.has(cellKey)) {
        this.selectedCells.delete(cellKey);
      } else {
        this.selectedCells.add(cellKey);
      }
    } else if (event.shiftKey && this.selectedCells.size > 0) {
      // Range select mode
      this.selectRange(promptIndex, modelIndex);
    } else {
      // Single select mode
      this.selectedCells.clear();
      if (cell.canAssign) {
        this.selectedCells.add(cellKey);
      }
    }
  }
  
  public onCellDoubleClick(promptIndex: number, modelIndex: number): void {
    if (this.readonly) return;
    
    const cellKey = this.getCellKey(promptIndex, modelIndex);
    const cell = this.matrix[promptIndex][modelIndex];
    
    if (cell.canAssign) {
      this.editingCell = cellKey;
      
      if (!cell.association) {
        // Create new association
        this.createAssociation(cell.promptId, cell.modelId);
      }
    }
  }
  
  private selectRange(endPromptIndex: number, endModelIndex: number): void {
    const selectedKeys = Array.from(this.selectedCells);
    if (selectedKeys.length === 0) return;
    
    const lastSelectedKey = selectedKeys[selectedKeys.length - 1];
    const [startPromptIndex, startModelIndex] = lastSelectedKey.split('-').map(Number);
    
    const minPromptIndex = Math.min(startPromptIndex, endPromptIndex);
    const maxPromptIndex = Math.max(startPromptIndex, endPromptIndex);
    const minModelIndex = Math.min(startModelIndex, endModelIndex);
    const maxModelIndex = Math.max(startModelIndex, endModelIndex);
    
    this.selectedCells.clear();
    
    for (let p = minPromptIndex; p <= maxPromptIndex; p++) {
      for (let m = minModelIndex; m <= maxModelIndex; m++) {
        const cell = this.matrix[p][m];
        if (cell && cell.canAssign) {
          this.selectedCells.add(this.getCellKey(p, m));
        }
      }
    }
  }
  
  public createAssociation(promptId: string, modelId: string, priority: number = 1): void {
    const prompt = this.prompts.find(p => p.ID === promptId);
    const model = this.models.find(m => m.ID === modelId);
    
    if (!prompt || !model) return;
    
    const newAssociation: PromptModelAssociation = {
      promptId,
      promptName: prompt.Name,
      modelId,
      modelName: model.Name,
      priority,
      status: 'Active',
      association: null,
      isNew: true,
      isModified: false
    };
    
    this.associations.push(newAssociation);
    this.buildMatrix();
    this.associationsChange.emit(this.associations);
  }
  
  public updateAssociation(promptId: string, modelId: string, updates: Partial<PromptModelAssociation>): void {
    const associationIndex = this.associations.findIndex(a => 
      a.promptId === promptId && a.modelId === modelId
    );
    
    if (associationIndex >= 0) {
      const association = this.associations[associationIndex];
      Object.assign(association, updates);
      
      if (!association.isNew) {
        association.isModified = true;
      }
      
      this.buildMatrix();
      this.associationsChange.emit(this.associations);
    }
  }
  
  public removeAssociation(promptId: string, modelId: string): void {
    const associationIndex = this.associations.findIndex(a => 
      a.promptId === promptId && a.modelId === modelId
    );
    
    if (associationIndex >= 0) {
      this.associations.splice(associationIndex, 1);
      this.buildMatrix();
      this.associationsChange.emit(this.associations);
    }
  }
  
  public bulkUpdateSelectedCells(): void {
    if (this.selectedCells.size === 0) return;
    
    this.selectedCells.forEach(cellKey => {
      const [promptIndex, modelIndex] = cellKey.split('-').map(Number);
      const cell = this.matrix[promptIndex][modelIndex];
      
      if (cell && cell.canAssign) {
        if (cell.association) {
          this.updateAssociation(cell.promptId, cell.modelId, {
            priority: this.bulkEditPriority,
            status: this.bulkEditStatus
          });
        } else {
          this.createAssociation(cell.promptId, cell.modelId, this.bulkEditPriority);
        }
      }
    });
    
    this.selectedCells.clear();
    this.bulkEditMode = false;
  }
  
  public bulkRemoveSelectedCells(): void {
    if (this.selectedCells.size === 0) return;
    
    this.selectedCells.forEach(cellKey => {
      const [promptIndex, modelIndex] = cellKey.split('-').map(Number);
      const cell = this.matrix[promptIndex][modelIndex];
      
      if (cell && cell.association) {
        this.removeAssociation(cell.promptId, cell.modelId);
      }
    });
    
    this.selectedCells.clear();
  }
  
  public async saveChanges(): Promise<void> {
    try {
      this.isLoading = true;
      this.loadingMessage = 'Saving associations...';
      
      const md = new Metadata();
      if (!md) throw new Error('Metadata provider not available');
      
      const savePromises: Promise<boolean>[] = [];
      
      for (const association of this.associations) {
        if (association.isNew || association.isModified) {
          let entity: AIPromptModelEntity;
          
          if (association.association) {
            // Update existing
            entity = await md.GetEntityObject<AIPromptModelEntity>('MJ: AI Prompt Models', md.CurrentUser);
            await entity.Load(association.association.ID);
          } else {
            // Create new
            entity = await md.GetEntityObject<AIPromptModelEntity>('MJ: AI Prompt Models', md.CurrentUser);
          }
          
          entity.PromptID = association.promptId;
          entity.ModelID = association.modelId;
          entity.Priority = association.priority;
          entity.Status = association.status as any;
          
          savePromises.push(entity.Save());
        }
      }
      
      const results = await Promise.all(savePromises);
      const failures = results.filter(r => !r).length;
      
      if (failures === 0) {
        this.notificationService.CreateSimpleNotification('All associations saved successfully', 'success', 3000);
        // Reload data to get fresh state
        await this.loadData();
      } else {
        this.notificationService.CreateSimpleNotification(`${failures} association(s) failed to save`, 'warning', 4000);
      }
      
    } catch (error) {
      this.error = 'Failed to save associations. Please try again.';
      LogError('Error saving associations', undefined, error);
      this.notificationService.CreateSimpleNotification('Failed to save associations', 'error', 4000);
    } finally {
      this.isLoading = false;
    }
  }
  
  public hasUnsavedChanges(): boolean {
    return this.associations.some(a => a.isNew || a.isModified);
  }
  
  public discardChanges(): void {
    if (!this.hasUnsavedChanges()) return;
    
    const confirm = window.confirm('Discard all unsaved changes?');
    if (confirm) {
      this.loadData();
    }
  }
  
  public getAssociationCount(): number {
    return this.associations.filter(a => a.status === 'Active').length;
  }
  
  public getModelAssociationCount(modelId: string): number {
    return this.associations.filter(a => a.modelId === modelId && a.status === 'Active').length;
  }
  
  public getPromptAssociationCount(promptId: string): number {
    return this.associations.filter(a => a.promptId === promptId && a.status === 'Active').length;
  }
  
  public getCellTooltip(association: any): string {
    if (!association) return 'No association';
    return `Priority: ${association.priority || 'Not set'}`;
  }

  public getAveragePriority(): number {
    const activeAssociations = this.associations.filter(a => a.status === 'Active');
    if (activeAssociations.length === 0) return 0;
    
    const sum = activeAssociations.reduce((total, a) => total + a.priority, 0);
    return Math.round((sum / activeAssociations.length) * 100) / 100;
  }
  
  public sortAssociations(): void {
    this.associations.sort((a, b) => {
      let comparison = 0;
      
      switch (this.sortBy) {
        case 'prompt':
          comparison = a.promptName.localeCompare(b.promptName);
          break;
        case 'model':
          comparison = a.modelName.localeCompare(b.modelName);
          break;
        case 'priority':
          comparison = a.priority - b.priority;
          break;
      }
      
      return this.sortDirection === 'desc' ? -comparison : comparison;
    });
    
    this.buildMatrix();
  }
  
  public toggleSortDirection(): void {
    this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    this.sortAssociations();
  }
  
  public onViewModeChange(mode: 'matrix' | 'list'): void {
    this.viewMode = mode;
    this.selectedCells.clear();
    this.editingCell = null;
  }
  
  public exportMatrix(): void {
    const exportData = {
      prompts: this.prompts.map(p => ({ id: p.ID, name: p.Name })),
      models: this.models.map(m => ({ id: m.ID, name: m.Name })),
      associations: this.associations.map(a => ({
        promptId: a.promptId,
        promptName: a.promptName,
        modelId: a.modelId,
        modelName: a.modelName,
        priority: a.priority,
        status: a.status
      })),
      exportDate: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prompt-model-matrix-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  public selectPrompt(prompt: AIPromptEntityExtended): void {
    this.promptSelected.emit(prompt);
  }
}