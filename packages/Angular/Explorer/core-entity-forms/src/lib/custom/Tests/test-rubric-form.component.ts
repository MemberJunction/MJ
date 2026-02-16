import { Component, ChangeDetectionStrategy } from '@angular/core';
import { MJTestRubricEntity } from '@memberjunction/core-entities';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { RegisterClass } from '@memberjunction/global';
import { MJTestRubricFormComponent } from '../../generated/Entities/MJTestRubric/mjtestrubric.form.component';

@RegisterClass(BaseFormComponent, 'MJ: Test Rubrics')
@Component({
  standalone: false,
  selector: 'mj-test-rubric-form',
  template: `
    <div class="rubric-form">
      <div class="rubric-header">
        <h2><i class="fas fa-clipboard-list"></i> {{ record.Name || 'Test Rubric' }}</h2>
        <span class="status-badge" [style.background-color]="record.Status === 'Active' ? '#4caf50' : '#9e9e9e'">
          {{ record.Status }}
        </span>
      </div>
      <div class="rubric-content">
        <div class="field-group">
          <label>Name</label>
          <input type="text" [(ngModel)]="record.Name" />
        </div>
        <div class="field-group">
          <label>Description</label>
          <textarea [(ngModel)]="record.Description" rows="4"></textarea>
        </div>
        <div class="field-group">
          <label>Prompt Template</label>
          <textarea [(ngModel)]="record.PromptTemplate" rows="12" class="json-editor"></textarea>
        </div>
        <div class="field-group">
          <label>Status</label>
          <select [(ngModel)]="record.Status">
            <option value="Active">Active</option>
            <option value="Disabled">Disabled</option>
          </select>
        </div>
        <div class="metadata">
          <div><strong>Created:</strong> {{ record.__mj_CreatedAt | date:'medium' }}</div>
          <div><strong>Updated:</strong> {{ record.__mj_UpdatedAt | date:'medium' }}</div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .rubric-form { padding: 20px; }
    .rubric-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
    .rubric-header h2 { margin: 0; font-size: 20px; display: flex; align-items: center; gap: 12px; }
    .status-badge { padding: 4px 12px; border-radius: 12px; color: white; font-size: 12px; font-weight: 600; }
    .rubric-content { background: white; padding: 24px; border-radius: 8px; }
    .field-group { margin-bottom: 20px; }
    .field-group label { display: block; margin-bottom: 8px; font-weight: 600; color: #333; }
    .field-group input, .field-group textarea, .field-group select { width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; }
    .json-editor { font-family: 'Courier New', monospace; font-size: 13px; }
    .metadata { margin-top: 24px; padding-top: 16px; border-top: 1px solid #e0e0e0; display: flex; gap: 24px; font-size: 13px; color: #666; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TestRubricFormComponentExtended extends MJTestRubricFormComponent {
  public override record!: MJTestRubricEntity;
}
