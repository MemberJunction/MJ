import { Component, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'mj-security-permissions',
  template: `
    <div class="security-permissions-placeholder" mjFillContainer>
      <div class="placeholder-content">
        <i class="fa-solid fa-lock"></i>
        <h3>Security & Permissions</h3>
        <p>Action authorization and security management coming soon...</p>
      </div>
    </div>
  `,
  styles: [`
    .security-permissions-placeholder {
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
export class SecurityPermissionsComponent {
  @Output() openEntityRecord = new EventEmitter<{entityName: string; recordId: string}>();
}