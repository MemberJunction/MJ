import { Component, OnInit, inject } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { IntegrationDataService, IntegrationSummary } from '../../services/integration-data.service';

@RegisterClass(BaseResourceComponent, 'IntegrationControlTower')
@Component({
  standalone: false,
  selector: 'app-control-tower',
  templateUrl: './control-tower.component.html',
  styleUrls: ['./control-tower.component.scss']
})
export class ControlTowerComponent extends BaseResourceComponent implements OnInit {
  Summaries: IntegrationSummary[] = [];
  IsLoading = false;
  ExpandedID: string | null = null;

  private dataService = inject(IntegrationDataService);

  async ngOnInit(): Promise<void> {
    await this.LoadData();
  }

  async LoadData(): Promise<void> {
    this.IsLoading = true;
    try {
      this.Summaries = await this.dataService.LoadIntegrationSummaries();
    } finally {
      this.IsLoading = false;
    }
  }

  async Refresh(): Promise<void> {
    await this.LoadData();
  }

  OnRunNow(integrationID: string): void {
    console.log('[IntegrationControlTower] Run Now clicked for integration:', integrationID);
  }

  OnExpandToggle(integrationID: string): void {
    this.ExpandedID = this.ExpandedID === integrationID ? null : integrationID;
  }

  get TotalCount(): number {
    return this.Summaries.length;
  }

  get HealthyCount(): number {
    return this.Summaries.filter(s => s.StatusColor === 'green').length;
  }

  get WarningCount(): number {
    return this.Summaries.filter(s => s.StatusColor === 'amber').length;
  }

  get FailedCount(): number {
    return this.Summaries.filter(s => s.StatusColor === 'red').length;
  }

  async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Integration Control Tower';
  }

  async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-tower-broadcast';
  }
}

export function LoadIntegrationDashboard(): void {
  // Tree-shaking prevention: importing this module causes
  // @RegisterClass decorators to fire, registering components.
}
