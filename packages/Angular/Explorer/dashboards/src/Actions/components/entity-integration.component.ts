import { Component, OnInit } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';

/**
 * Tree-shaking prevention function
 */
export function LoadActionsEntitiesResource() {
  // Force inclusion in production builds
}

/**
 * Entity Integration Resource - displays entity-action mappings
 */
@RegisterClass(BaseResourceComponent, 'ActionsEntitiesResource')
@Component({
  standalone: false,
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
export class EntityIntegrationComponent extends BaseResourceComponent implements OnInit {
  constructor(private navigationService: NavigationService) {
    super();
  }

  ngOnInit(): void {
    this.NotifyLoadComplete();
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Entity Integration';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-sitemap';
  }
}