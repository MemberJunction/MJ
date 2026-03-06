import { Component, Output, EventEmitter } from '@angular/core';

@Component({
  standalone: false,
  selector: 'mj-executions-list-view',
  template: `
    <div class="executions-list-placeholder" >
      <div class="placeholder-content">
        <i class="fa-solid fa-list"></i>
        <h3>Executions List View</h3>
        <p>Detailed execution history with filtering and sorting coming soon...</p>
      </div>
    </div>
  `,
  styles: [`
    .executions-list-placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      background: var(--kendo-color-app-surface);
      
      .placeholder-content {
        text-align: center;
        color: var(--kendo-color-subtle);
        
        i {
          font-size: 3rem;
          margin-bottom: 1rem;
          opacity: 0.5;
          color: var(--kendo-color-primary);
        }
        
        h3 {
          margin: 0 0 0.5rem 0;
          font-size: 1.25rem;
          font-weight: 600;
        }
        
        p {
          margin: 0;
          font-size: 0.875rem;
        }
      }
    }
  `]
})
export class ExecutionsListViewComponent {
  @Output() openEntityRecord = new EventEmitter<{entityName: string; recordId: string}>();
}