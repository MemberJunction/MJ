import { Component, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'mj-code-management',
  template: `
    <div class="code-management-placeholder" >
      <div class="placeholder-content">
        <i class="fa-solid fa-code"></i>
        <h3>Code Management</h3>
        <p>AI code generation approval workflow coming soon...</p>
      </div>
    </div>
  `,
  styles: [`
    .code-management-placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      
      .placeholder-content {
        text-align: center;
        color: var(--kendo-color-subtle);
        
        i {
          font-size: 3rem;
          margin-bottom: 1rem;
          opacity: 0.5;
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
export class CodeManagementComponent {
  @Output() openEntityRecord = new EventEmitter<{entityName: string; recordId: string}>();
}