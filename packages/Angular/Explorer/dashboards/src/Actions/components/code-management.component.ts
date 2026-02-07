import { Component, OnInit } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
/**
 * Code Management Resource - displays AI code generation workflow
 */
@RegisterClass(BaseResourceComponent, 'ActionsCodeResource')
@Component({
  standalone: false,
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
export class CodeManagementComponent extends BaseResourceComponent implements OnInit {
  constructor(private navigationService: NavigationService) {
    super();
  }

  ngOnInit(): void {
    this.NotifyLoadComplete();
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Code Management';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-code';
  }
}