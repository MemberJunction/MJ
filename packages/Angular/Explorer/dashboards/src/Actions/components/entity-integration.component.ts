import { Component, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'mj-entity-integration',
  template: `
    <div class="entity-integration-placeholder" >
      <div class="placeholder-content">
        <i class="fa-solid fa-sitemap"></i>
        <h3>Entity Integration</h3>
        <p>Entity-action mapping and relationship management coming soon...</p>
      </div>
    </div>
  `,
  styles: [`
    .entity-integration-placeholder {
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
export class EntityIntegrationComponent {
  @Output() openEntityRecord = new EventEmitter<{entityName: string; recordId: string}>();
}