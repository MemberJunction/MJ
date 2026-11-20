import { AfterViewInit, ChangeDetectionStrategy, Component } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';

/**
 * Explorer resource wrapper for the Communications V2 Compliance & Admin Dashboard.
 */
@RegisterClass(BaseResourceComponent, 'CommunicationComplianceAdminResource')
@Component({
  standalone: false,
  selector: 'mj-communication-compliance-admin-resource',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<mj-communications-admin-dashboard [Provider]="Provider"></mj-communications-admin-dashboard>`,
})
export class CommunicationComplianceAdminResourceComponent extends BaseResourceComponent implements AfterViewInit {
  public ngAfterViewInit(): void {
    this.NotifyLoadComplete();
  }

  public override async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Compliance & Admin';
  }

  public override async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-shield-halved';
  }
}
