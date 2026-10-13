import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { RunView, LogError, LogStatus } from '@memberjunction/core';
import { MJAIPromptModelEntity } from '@memberjunction/core-entities';
import { Subject, BehaviorSubject } from 'rxjs';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { MJConfirmService } from '@memberjunction/ng-ui-components';
import { MJAIModelEntityExtended, MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { UUIDsEqual } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

interface PromptModelAssociation {
  promptId: string;
  promptName: string;
  modelId: string;
  modelName: string;
  priority: number;
  status: string;
  association: MJAIPromptModelEntity | null;
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
  standalone: false,
  selector: 'app-model-prompt-priority-matrix',
  templateUrl: './model-prompt-priority-matrix.component.html',
  styleUrls: ['./model-prompt-priority-matrix.component.css']
})
export class ModelPromptPriorityMatrixComponent extends BaseAngularComponent implements OnInit, OnDestroy {
  @Input() SelectedPrompts: MJAIPromptEntityExtended[] = [];

  /** @deprecated Use {@link SelectedPrompts}. */
  @Input() set selectedPrompts(value: MJAIPromptEntityExtended[]) {
    this.SelectedPrompts = value;
  }
  /** @deprecated Use {@link SelectedPrompts}. */
  get selectedPrompts(): MJAIPromptEntityExtended[] {
    return this.SelectedPrompts;
  }
  @Input() SelectedModels: MJAIModelEntityExtended[] = [];

  /** @deprecated Use {@link SelectedModels}. */
  @Input() set selectedModels(value: MJAIModelEntityExtended[]) {
    this.SelectedModels = value;
  }
  /** @deprecated Use {@link SelectedModels}. */
  get selectedModels(): MJAIModelEntityExtended[] {
    return this.SelectedModels;
  }
  @Input() readonly = false;
  
  @Output() AssociationsChange = new EventEmitter<PromptModelAssociation[]>();

  /**
   * @deprecated Use {@link AssociationsChange}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (associationsChange) keeps working. Must stay AFTER AssociationsChange: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() associationsChange = this.AssociationsChange;
  @Output() StateChange = new EventEmitter<any>();

  /**
   * @deprecated Use {@link StateChange}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (stateChange) keeps working. Must stay AFTER StateChange: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() stateChange = this.StateChange;
  @Output() PromptSelected = new EventEmitter<MJAIPromptEntityExtended>();

  /**
   * @deprecated Use {@link PromptSelected}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (promptSelected) keeps working. Must stay AFTER PromptSelected: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() promptSelected = this.PromptSelected;
  
  // Data
  public Prompts: MJAIPromptEntityExtended[] = [];

  /** @deprecated Use {@link Prompts}. */
  public get prompts(): MJAIPromptEntityExtended[] {
    return this.Prompts;
  }
  /** @deprecated Use {@link Prompts}. */
  public set prompts(value: MJAIPromptEntityExtended[]) {
    this.Prompts = value;
  }
  public Models: MJAIModelEntityExtended[] = [];

  /** @deprecated Use {@link Models}. */
  public get models(): MJAIModelEntityExtended[] {
    return this.Models;
  }
  /** @deprecated Use {@link Models}. */
  public set models(value: MJAIModelEntityExtended[]) {
    this.Models = value;
  }
  public Associations: PromptModelAssociation[] = [];

  /** @deprecated Use {@link Associations}. */
  public get associations(): PromptModelAssociation[] {
    return this.Associations;
  }
  /** @deprecated Use {@link Associations}. */
  public set associations(value: PromptModelAssociation[]) {
    this.Associations = value;
  }
  public Matrix: MatrixCell[][] = [];

  /** @deprecated Use {@link Matrix}. */
  public get matrix(): MatrixCell[][] {
    return this.Matrix;
  }
  /** @deprecated Use {@link Matrix}. */
  public set matrix(value: MatrixCell[][]) {
    this.Matrix = value;
  }
  
  // UI State
  public isLoading = false;
  public LoadingMessage = '';

  /** @deprecated Use {@link LoadingMessage}. */
  public get loadingMessage() {
    return this.LoadingMessage;
  }
  /** @deprecated Use {@link LoadingMessage}. */
  public set loadingMessage(value) {
    this.LoadingMessage = value;
  }
  public error: string | null = null;
  public ViewMode: 'matrix' | 'list' = 'matrix';

  /** @deprecated Use {@link ViewMode}. */
  public get viewMode(): 'matrix' | 'list' {
    return this.ViewMode;
  }
  /** @deprecated Use {@link ViewMode}. */
  public set viewMode(value: 'matrix' | 'list') {
    this.ViewMode = value;
  }
  public SortBy: 'prompt' | 'model' | 'priority' = 'priority';

  /** @deprecated Use {@link SortBy}. */
  public get sortBy(): 'prompt' | 'model' | 'priority' {
    return this.SortBy;
  }
  /** @deprecated Use {@link SortBy}. */
  public set sortBy(value: 'prompt' | 'model' | 'priority') {
    this.SortBy = value;
  }
  public SortDirection: 'asc' | 'desc' = 'asc';

  /** @deprecated Use {@link SortDirection}. */
  public get sortDirection(): 'asc' | 'desc' {
    return this.SortDirection;
  }
  /** @deprecated Use {@link SortDirection}. */
  public set sortDirection(value: 'asc' | 'desc') {
    this.SortDirection = value;
  }
  public ShowInactiveAssociations = false;

  /** @deprecated Use {@link ShowInactiveAssociations}. */
  public get showInactiveAssociations() {
    return this.ShowInactiveAssociations;
  }
  /** @deprecated Use {@link ShowInactiveAssociations}. */
  public set showInactiveAssociations(value) {
    this.ShowInactiveAssociations = value;
  }
  
  // Selection and editing
  public SelectedCells: Set<string> = new Set();

  /** @deprecated Use {@link SelectedCells}. */
  public get selectedCells(): Set<string> {
    return this.SelectedCells;
  }
  /** @deprecated Use {@link SelectedCells}. */
  public set selectedCells(value: Set<string>) {
    this.SelectedCells = value;
  }
  public EditingCell: string | null = null;

  /** @deprecated Use {@link EditingCell}. */
  public get editingCell(): string | null {
    return this.EditingCell;
  }
  /** @deprecated Use {@link EditingCell}. */
  public set editingCell(value: string | null) {
    this.EditingCell = value;
  }
  public BulkEditMode = false;

  /** @deprecated Use {@link BulkEditMode}. */
  public get bulkEditMode() {
    return this.BulkEditMode;
  }
  /** @deprecated Use {@link BulkEditMode}. */
  public set bulkEditMode(value) {
    this.BulkEditMode = value;
  }
  public BulkEditPriority = 1;

  /** @deprecated Use {@link BulkEditPriority}. */
  public get bulkEditPriority() {
    return this.BulkEditPriority;
  }
  /** @deprecated Use {@link BulkEditPriority}. */
  public set bulkEditPriority(value) {
    this.BulkEditPriority = value;
  }
  public BulkEditStatus = 'Active';

  /** @deprecated Use {@link BulkEditStatus}. */
  public get bulkEditStatus() {
    return this.BulkEditStatus;
  }
  /** @deprecated Use {@link BulkEditStatus}. */
  public set bulkEditStatus(value) {
    this.BulkEditStatus = value;
  }
  
  // Filtering
  public PromptFilter$ = new BehaviorSubject<string>('');

  /** @deprecated Use {@link PromptFilter$}. */
  public get promptFilter$() {
    return this.PromptFilter$;
  }
  /** @deprecated Use {@link PromptFilter$}. */
  public set promptFilter$(value) {
    this.PromptFilter$ = value;
  }
  public ModelFilter$ = new BehaviorSubject<string>('');

  /** @deprecated Use {@link ModelFilter$}. */
  public get modelFilter$() {
    return this.ModelFilter$;
  }
  /** @deprecated Use {@link ModelFilter$}. */
  public set modelFilter$(value) {
    this.ModelFilter$ = value;
  }
  public StatusFilter$ = new BehaviorSubject<string>('all');

  /** @deprecated Use {@link StatusFilter$}. */
  public get statusFilter$() {
    return this.StatusFilter$;
  }
  /** @deprecated Use {@link StatusFilter$}. */
  public set statusFilter$(value) {
    this.StatusFilter$ = value;
  }
  
  // Performance metrics
  public PerformanceData: { [key: string]: any } = {};

  /** @deprecated Use {@link PerformanceData}. */
  public get performanceData(): { [key: string]: any } {
    return this.PerformanceData;
  }
  /** @deprecated Use {@link PerformanceData}. */
  public set performanceData(value: { [key: string]: any }) {
    this.PerformanceData = value;
  }
  public ShowPerformanceOverlay = false;

  /** @deprecated Use {@link ShowPerformanceOverlay}. */
  public get showPerformanceOverlay() {
    return this.ShowPerformanceOverlay;
  }
  /** @deprecated Use {@link ShowPerformanceOverlay}. */
  public set showPerformanceOverlay(value) {
    this.ShowPerformanceOverlay = value;
  }
  
  private destroy$ = new Subject<void>();
  
  constructor(private notificationService: MJNotificationService, private confirmService: MJConfirmService) { super(); }
  
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
      this.LoadingMessage = 'Loading prompts, models, and associations...';
      
      const [prompts, models, associations] = await Promise.all([
        this.loadPrompts(),
        this.loadModels(),
        this.loadAssociations()
      ]);
      
      this.Prompts = this.SelectedPrompts.length > 0 ? this.SelectedPrompts : prompts;
      this.Models = this.SelectedModels.length > 0 ? this.SelectedModels : models;
      
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
  
  private async loadPrompts(): Promise<MJAIPromptEntityExtended[]> {
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const result = await rv.RunView({
      EntityName: 'MJ: AI Prompts',
      ExtraFilter: "Status = 'Active'",
      OrderBy: 'Name',
      UserSearchString: '',
      IgnoreMaxRows: false,
      MaxRows: 500
    });
    
    if (result && result.Success && result.Results) {
      return result.Results as MJAIPromptEntityExtended[];
    } else {
      throw new Error('Failed to load AI prompts');
    }
  }
  
  private async loadModels(): Promise<MJAIModelEntityExtended[]> {
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const result = await rv.RunView({
      EntityName: 'MJ: AI Models',
      ExtraFilter: "IsActive = 1",
      OrderBy: 'Name',
      UserSearchString: '',
      IgnoreMaxRows: false,
      MaxRows: 200
    });
    
    if (result && result.Success && result.Results) {
      return result.Results as MJAIModelEntityExtended[];
    } else {
      throw new Error('Failed to load AI models');
    }
  }
  
  private async loadAssociations(): Promise<MJAIPromptModelEntity[]> {
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const result = await rv.RunView({
      EntityName: 'MJ: AI Prompt Models',
      ExtraFilter: '',
      OrderBy: 'Priority',
      UserSearchString: '',
      IgnoreMaxRows: false,
      MaxRows: 2000
    });
    
    if (result && result.Success && result.Results) {
      return result.Results as MJAIPromptModelEntity[];
    } else {
      throw new Error('Failed to load prompt-model associations');
    }
  }
  
  private buildAssociations(dbAssociations: MJAIPromptModelEntity[]): void {
    this.Associations = [];
    
    // Create associations for existing database records
    dbAssociations.forEach(dbAssoc => {
      const prompt = this.Prompts.find(p => UUIDsEqual(p.ID, dbAssoc.PromptID));
      const model = this.Models.find(m => UUIDsEqual(m.ID, dbAssoc.ModelID));
      
      if (prompt && model) {
        this.Associations.push({
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
    this.Matrix = [];
    
    this.Prompts.forEach((prompt, promptIndex) => {
      this.Matrix[promptIndex] = [];
      
      this.Models.forEach((model, modelIndex) => {
        const association = this.Associations.find(a => 
          UUIDsEqual(a.promptId, prompt.ID) && UUIDsEqual(a.modelId, model.ID)
        );
        
        this.Matrix[promptIndex][modelIndex] = {
          promptId: prompt.ID,
          modelId: model.ID,
          association: association || null,
          canAssign: this.canAssignModelToPrompt(prompt, model)
        };
      });
    });
  }
  
  private canAssignModelToPrompt(prompt: MJAIPromptEntityExtended, model: MJAIModelEntityExtended): boolean {
    // Check model type compatibility
    if (prompt.OutputType && model.AIModelTypeID) {
      // Add business logic for compatibility checking
      return true;
    }
    return true;
  }
  
  public GetCellKey(promptIndex: number, modelIndex: number): string {
    return `${promptIndex}-${modelIndex}`;
  }

  /** @deprecated Use {@link GetCellKey}. */
  public getCellKey(promptIndex: number, modelIndex: number): string {
    return this.GetCellKey(promptIndex, modelIndex);
  }
  
  public GetCellClass(cell: MatrixCell): string {
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
    
    const cellKey = this.GetCellKey(
      this.Prompts.findIndex(p => UUIDsEqual(p.ID, cell.promptId)),
      this.Models.findIndex(m => UUIDsEqual(m.ID, cell.modelId))
    );
    
    if (this.SelectedCells.has(cellKey)) {
      classes.push('selected');
    }
    
    if (this.EditingCell === cellKey) {
      classes.push('editing');
    }
    
    return classes.join(' ');
  }

  /** @deprecated Use {@link GetCellClass}. */
  public getCellClass(cell: MatrixCell): string {
    return this.GetCellClass(cell);
  }
  
  public OnCellClick(promptIndex: number, modelIndex: number, event: MouseEvent): void {
    if (this.readonly) return;
    
    const cellKey = this.GetCellKey(promptIndex, modelIndex);
    const cell = this.Matrix[promptIndex][modelIndex];
    
    if (event.ctrlKey || event.metaKey) {
      // Multi-select mode
      if (this.SelectedCells.has(cellKey)) {
        this.SelectedCells.delete(cellKey);
      } else {
        this.SelectedCells.add(cellKey);
      }
    } else if (event.shiftKey && this.SelectedCells.size > 0) {
      // Range select mode
      this.selectRange(promptIndex, modelIndex);
    } else {
      // Single select mode
      this.SelectedCells.clear();
      if (cell.canAssign) {
        this.SelectedCells.add(cellKey);
      }
    }
  }

  /** @deprecated Use {@link OnCellClick}. */
  public onCellClick(promptIndex: number, modelIndex: number, event: MouseEvent): void {
    return this.OnCellClick(promptIndex, modelIndex, event);
  }
  
  public OnCellDoubleClick(promptIndex: number, modelIndex: number): void {
    if (this.readonly) return;
    
    const cellKey = this.GetCellKey(promptIndex, modelIndex);
    const cell = this.Matrix[promptIndex][modelIndex];
    
    if (cell.canAssign) {
      this.EditingCell = cellKey;
      
      if (!cell.association) {
        // Create new association
        this.CreateAssociation(cell.promptId, cell.modelId);
      }
    }
  }

  /** @deprecated Use {@link OnCellDoubleClick}. */
  public onCellDoubleClick(promptIndex: number, modelIndex: number): void {
    return this.OnCellDoubleClick(promptIndex, modelIndex);
  }
  
  private selectRange(endPromptIndex: number, endModelIndex: number): void {
    const selectedKeys = Array.from(this.SelectedCells);
    if (selectedKeys.length === 0) return;
    
    const lastSelectedKey = selectedKeys[selectedKeys.length - 1];
    const [startPromptIndex, startModelIndex] = lastSelectedKey.split('-').map(Number);
    
    const minPromptIndex = Math.min(startPromptIndex, endPromptIndex);
    const maxPromptIndex = Math.max(startPromptIndex, endPromptIndex);
    const minModelIndex = Math.min(startModelIndex, endModelIndex);
    const maxModelIndex = Math.max(startModelIndex, endModelIndex);
    
    this.SelectedCells.clear();
    
    for (let p = minPromptIndex; p <= maxPromptIndex; p++) {
      for (let m = minModelIndex; m <= maxModelIndex; m++) {
        const cell = this.Matrix[p][m];
        if (cell && cell.canAssign) {
          this.SelectedCells.add(this.GetCellKey(p, m));
        }
      }
    }
  }
  
  public CreateAssociation(promptId: string, modelId: string, priority: number = 1): void {
    const prompt = this.Prompts.find(p => UUIDsEqual(p.ID, promptId));
    const model = this.Models.find(m => UUIDsEqual(m.ID, modelId));
    
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
    
    this.Associations.push(newAssociation);
    this.buildMatrix();
    this.AssociationsChange.emit(this.Associations);
  }

  /** @deprecated Use {@link CreateAssociation}. */
  public createAssociation(promptId: string, modelId: string, priority: number = 1): void {
    return this.CreateAssociation(promptId, modelId, priority);
  }
  
  public UpdateAssociation(promptId: string, modelId: string, updates: Partial<PromptModelAssociation>): void {
    const associationIndex = this.Associations.findIndex(a => 
      a.promptId === promptId && a.modelId === modelId
    );
    
    if (associationIndex >= 0) {
      const association = this.Associations[associationIndex];
      Object.assign(association, updates);
      
      if (!association.isNew) {
        association.isModified = true;
      }
      
      this.buildMatrix();
      this.AssociationsChange.emit(this.Associations);
    }
  }

  /** @deprecated Use {@link UpdateAssociation}. */
  public updateAssociation(promptId: string, modelId: string, updates: Partial<PromptModelAssociation>): void {
    return this.UpdateAssociation(promptId, modelId, updates);
  }
  
  public RemoveAssociation(promptId: string, modelId: string): void {
    const associationIndex = this.Associations.findIndex(a => 
      a.promptId === promptId && a.modelId === modelId
    );
    
    if (associationIndex >= 0) {
      this.Associations.splice(associationIndex, 1);
      this.buildMatrix();
      this.AssociationsChange.emit(this.Associations);
    }
  }

  /** @deprecated Use {@link RemoveAssociation}. */
  public removeAssociation(promptId: string, modelId: string): void {
    return this.RemoveAssociation(promptId, modelId);
  }
  
  public BulkUpdateSelectedCells(): void {
    if (this.SelectedCells.size === 0) return;
    
    this.SelectedCells.forEach(cellKey => {
      const [promptIndex, modelIndex] = cellKey.split('-').map(Number);
      const cell = this.Matrix[promptIndex][modelIndex];
      
      if (cell && cell.canAssign) {
        if (cell.association) {
          this.UpdateAssociation(cell.promptId, cell.modelId, {
            priority: this.BulkEditPriority,
            status: this.BulkEditStatus
          });
        } else {
          this.CreateAssociation(cell.promptId, cell.modelId, this.BulkEditPriority);
        }
      }
    });
    
    this.SelectedCells.clear();
    this.BulkEditMode = false;
  }

  /** @deprecated Use {@link BulkUpdateSelectedCells}. */
  public bulkUpdateSelectedCells(): void {
    return this.BulkUpdateSelectedCells();
  }
  
  public BulkRemoveSelectedCells(): void {
    if (this.SelectedCells.size === 0) return;
    
    this.SelectedCells.forEach(cellKey => {
      const [promptIndex, modelIndex] = cellKey.split('-').map(Number);
      const cell = this.Matrix[promptIndex][modelIndex];
      
      if (cell && cell.association) {
        this.RemoveAssociation(cell.promptId, cell.modelId);
      }
    });
    
    this.SelectedCells.clear();
  }

  /** @deprecated Use {@link BulkRemoveSelectedCells}. */
  public bulkRemoveSelectedCells(): void {
    return this.BulkRemoveSelectedCells();
  }
  
  public async SaveChanges(): Promise<void> {
    try {
      this.isLoading = true;
      this.LoadingMessage = 'Saving associations...';
      
      const md = this.ProviderToUse;
      if (!md) throw new Error('Metadata provider not available');
      
      const savePromises: Promise<boolean>[] = [];
      
      for (const association of this.Associations) {
        if (association.isNew || association.isModified) {
          let entity: MJAIPromptModelEntity;
          
          if (association.association) {
            // Update existing
            entity = await md.GetEntityObject<MJAIPromptModelEntity>('MJ: AI Prompt Models', md.CurrentUser);
            await entity.Load(association.association.ID);
          } else {
            // Create new
            entity = await md.GetEntityObject<MJAIPromptModelEntity>('MJ: AI Prompt Models', md.CurrentUser);
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

  /** @deprecated Use {@link SaveChanges}. */
  public async saveChanges(): Promise<void> {
    return this.SaveChanges();
  }
  
  public HasUnsavedChanges(): boolean {
    return this.Associations.some(a => a.isNew || a.isModified);
  }

  /** @deprecated Use {@link HasUnsavedChanges}. */
  public hasUnsavedChanges(): boolean {
    return this.HasUnsavedChanges();
  }
  
  public async DiscardChanges(): Promise<void> {
    if (!this.HasUnsavedChanges()) return;

    const confirmed = await this.confirmService.Confirm('Discard all unsaved changes?');
    if (confirmed) {
      this.loadData();
    }
  }

  /** @deprecated Use {@link DiscardChanges}. */
  public async discardChanges(): Promise<void> {
    return this.DiscardChanges();
  }
  
  public GetAssociationCount(): number {
    return this.Associations.filter(a => a.status === 'Active').length;
  }

  /** @deprecated Use {@link GetAssociationCount}. */
  public getAssociationCount(): number {
    return this.GetAssociationCount();
  }
  
  public GetModelAssociationCount(modelId: string): number {
    return this.Associations.filter(a => a.modelId === modelId && a.status === 'Active').length;
  }

  /** @deprecated Use {@link GetModelAssociationCount}. */
  public getModelAssociationCount(modelId: string): number {
    return this.GetModelAssociationCount(modelId);
  }
  
  public GetPromptAssociationCount(promptId: string): number {
    return this.Associations.filter(a => a.promptId === promptId && a.status === 'Active').length;
  }

  /** @deprecated Use {@link GetPromptAssociationCount}. */
  public getPromptAssociationCount(promptId: string): number {
    return this.GetPromptAssociationCount(promptId);
  }
  
  public GetCellTooltip(association: any): string {
    if (!association) return 'No association';
    return `Priority: ${association.priority || 'Not set'}`;
  }

  /** @deprecated Use {@link GetCellTooltip}. */
  public getCellTooltip(association: any): string {
    return this.GetCellTooltip(association);
  }

  public GetAveragePriority(): number {
    const activeAssociations = this.Associations.filter(a => a.status === 'Active');
    if (activeAssociations.length === 0) return 0;
    
    const sum = activeAssociations.reduce((total, a) => total + a.priority, 0);
    return Math.round((sum / activeAssociations.length) * 100) / 100;
  }

  /** @deprecated Use {@link GetAveragePriority}. */
  public getAveragePriority(): number {
    return this.GetAveragePriority();
  }
  
  public SortAssociations(): void {
    this.Associations.sort((a, b) => {
      let comparison = 0;
      
      switch (this.SortBy) {
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
      
      return this.SortDirection === 'desc' ? -comparison : comparison;
    });
    
    this.buildMatrix();
  }

  /** @deprecated Use {@link SortAssociations}. */
  public sortAssociations(): void {
    return this.SortAssociations();
  }
  
  public ToggleSortDirection(): void {
    this.SortDirection = this.SortDirection === 'asc' ? 'desc' : 'asc';
    this.SortAssociations();
  }

  /** @deprecated Use {@link ToggleSortDirection}. */
  public toggleSortDirection(): void {
    return this.ToggleSortDirection();
  }
  
  public OnViewModeChange(mode: 'matrix' | 'list'): void {
    this.ViewMode = mode;
    this.SelectedCells.clear();
    this.EditingCell = null;
  }

  /** @deprecated Use {@link OnViewModeChange}. */
  public onViewModeChange(mode: 'matrix' | 'list'): void {
    return this.OnViewModeChange(mode);
  }
  
  public ExportMatrix(): void {
    const exportData = {
      prompts: this.Prompts.map(p => ({ id: p.ID, name: p.Name })),
      models: this.Models.map(m => ({ id: m.ID, name: m.Name })),
      associations: this.Associations.map(a => ({
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

  /** @deprecated Use {@link ExportMatrix}. */
  public exportMatrix(): void {
    return this.ExportMatrix();
  }

  public SelectPrompt(prompt: MJAIPromptEntityExtended): void {
    this.PromptSelected.emit(prompt);
  }

  /** @deprecated Use {@link SelectPrompt}. */
  public selectPrompt(prompt: MJAIPromptEntityExtended): void {
    return this.SelectPrompt(prompt);
  }
}