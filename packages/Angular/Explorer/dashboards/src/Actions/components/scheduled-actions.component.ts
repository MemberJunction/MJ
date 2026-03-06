import { Component, OnInit } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
/**
 * Scheduled Actions Resource - displays calendar view and schedule management
 */
@RegisterClass(BaseResourceComponent, 'ActionsScheduleResource')
@Component({
  standalone: false,
  selector: 'mj-scheduled-actions',
  template: `
    <div class="scheduled-actions-placeholder" >
      <div class="placeholder-content">
        <i class="fa-solid fa-clock"></i>
        <h3>Scheduled Actions</h3>
        <p>Calendar view and schedule management coming soon...</p>
      </div>
    </div>
  `,
  styles: [`
    .scheduled-actions-placeholder {
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
export class ScheduledActionsComponent extends BaseResourceComponent implements OnInit {
  constructor(private navigationService: NavigationService) {
    super();
  }

  ngOnInit(): void {
    this.NotifyLoadComplete();
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'MJ: Scheduled Actions';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-clock';
  }
}