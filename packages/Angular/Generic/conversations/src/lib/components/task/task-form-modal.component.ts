import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TaskEntity } from '@memberjunction/core-entities';
import { UserInfo, Metadata } from '@memberjunction/core';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'mj-task-form-modal',
  template: `
    <kendo-dialog
      *ngIf="isVisible"
      [title]="task ? 'Edit Task' : 'New Task'"
      [width]="500"
      [height]="450"
      (close)="onCancel()">

      <div class="task-form-content">
        <div class="form-group">
          <label for="task-title" class="required">Title</label>
          <input
            id="task-title"
            kendoTextBox
            [(ngModel)]="formData.title"
            placeholder="Enter task title"
            [class.error]="showValidation && !formData.title"
            (keydown.enter)="onSave()"
          />
          <span class="error-message" *ngIf="showValidation && !formData.title">
            Title is required
          </span>
        </div>

        <div class="form-group">
          <label for="task-description">Description</label>
          <textarea
            id="task-description"
            kendoTextArea
            [(ngModel)]="formData.description"
            placeholder="Enter task description (optional)"
            rows="4">
          </textarea>
        </div>

        <div class="form-group">
          <label for="task-priority">Priority</label>
          <kendo-dropdownlist
            id="task-priority"
            [(ngModel)]="formData.priority"
            [data]="priorities"
            [textField]="'label'"
            [valueField]="'value'">
          </kendo-dropdownlist>
        </div>

        <div class="form-group">
          <label for="task-status">Status</label>
          <kendo-dropdownlist
            id="task-status"
            [(ngModel)]="formData.status"
            [data]="statuses"
            [textField]="'label'"
            [valueField]="'value'">
          </kendo-dropdownlist>
        </div>

        <div class="form-group">
          <label for="task-due-date">Due Date</label>
          <kendo-datepicker
            id="task-due-date"
            [(ngModel)]="formData.dueDate">
          </kendo-datepicker>
        </div>

        <div class="error-message" *ngIf="errorMessage">
          {{ errorMessage }}
        </div>

        <div class="loading-indicator" *ngIf="isSaving">
          <kendo-loader type="infinite-spinner" size="medium"></kendo-loader>
          <span>Saving task...</span>
        </div>
      </div>

      <kendo-dialog-actions>
        <button kendoButton [disabled]="isSaving" (click)="onCancel()">Cancel</button>
        <button kendoButton [primary]="true" [disabled]="isSaving" (click)="onSave()">
          {{ task ? 'Update' : 'Create' }}
        </button>
      </kendo-dialog-actions>
    </kendo-dialog>
  `,
  styles: [`
    .task-form-content {
      padding: 20px;
    }

    .form-group {
      margin-bottom: 20px;
    }

    .form-group label {
      display: block;
      margin-bottom: 5px;
      font-weight: 500;
    }

    .form-group label.required::after {
      content: '*';
      color: #d32f2f;
      margin-left: 4px;
    }

    input[kendoTextBox],
    textarea[kendoTextArea],
    kendo-dropdownlist,
    kendo-datepicker {
      width: 100%;
    }

    .error {
      border-color: #d32f2f;
    }

    .error-message {
      display: block;
      color: #d32f2f;
      font-size: 12px;
      margin-top: 5px;
    }

    .loading-indicator {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 15px;
      color: #666;
    }

    kendo-dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding: 15px 20px;
      border-top: 1px solid #e0e0e0;
    }
  `]
})
export class TaskFormModalComponent {
  @Input() isVisible = false;
  @Input() task?: TaskEntity;
  @Input() conversationId!: string;
  @Input() currentUser!: UserInfo;
  @Output() saved = new EventEmitter<TaskEntity>();
  @Output() cancelled = new EventEmitter<void>();

  formData = {
    title: '',
    description: '',
    priority: 'medium',
    status: 'pending',
    dueDate: null as Date | null
  };

  priorities = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'urgent', label: 'Urgent' }
  ];

  statuses = [
    { value: 'pending', label: 'Pending' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled', label: 'Cancelled' }
  ];

  showValidation = false;
  errorMessage = '';
  isSaving = false;

  constructor(private toastService: ToastService) {}

  ngOnChanges(): void {
    if (this.isVisible) {
      this.loadFormData();
    }
  }

  private loadFormData(): void {
    if (this.task) {
      this.formData = {
        title: this.task.Name || '',
        description: this.task.Description || '',
        priority: 'medium', // Priority not used in Tasks entity
        status: (this.task.Status || 'Pending').toLowerCase().replace(' ', '_'),
        dueDate: this.task.DueAt ? new Date(this.task.DueAt) : null
      };
    } else {
      this.resetForm();
    }
  }

  async onSave(): Promise<void> {
    this.showValidation = true;
    this.errorMessage = '';

    if (!this.formData.title.trim()) {
      return;
    }

    this.isSaving = true;

    try {
      const md = new Metadata();
      const taskEntity = this.task ||
        await md.GetEntityObject<TaskEntity>('MJ: Tasks', this.currentUser);

      taskEntity.Name = this.formData.title;
      taskEntity.Description = this.formData.description || '';
      // Priority field not available in Tasks entity
      const statusValue = this.capitalizeFirst(this.formData.status.replace('_', ' '));
      taskEntity.Status = statusValue as 'Pending' | 'In Progress' | 'Complete' | 'Cancelled' | 'Failed' | 'Blocked' | 'Deferred';
      taskEntity.DueAt = this.formData.dueDate || null;

      if (!this.task) {
        taskEntity.ConversationDetailID = this.conversationId;
        taskEntity.PercentComplete = 0;
      }

      const saved = await taskEntity.Save();
      if (saved) {
        this.toastService.success(
          this.task ? 'Task updated successfully' : 'Task created successfully'
        );
        this.saved.emit(taskEntity);
        this.resetForm();
      } else {
        this.errorMessage = 'Failed to save task';
        this.toastService.error(this.errorMessage);
      }
    } catch (error) {
      console.error('Error saving task:', error);
      this.errorMessage = error instanceof Error ? error.message : 'Failed to save task';
      this.toastService.error(this.errorMessage);
    } finally {
      this.isSaving = false;
    }
  }

  onCancel(): void {
    this.cancelled.emit();
    this.resetForm();
  }

  private resetForm(): void {
    this.formData = {
      title: '',
      description: '',
      priority: 'medium',
      status: 'pending',
      dueDate: null
    };
    this.showValidation = false;
    this.errorMessage = '';
    this.isVisible = false;
  }

  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
