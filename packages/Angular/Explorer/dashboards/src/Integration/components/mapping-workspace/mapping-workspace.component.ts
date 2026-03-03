import { Component, OnInit, inject } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import {
  IntegrationDataService,
  IntegrationRow,
  IntegrationRunRow,
  EntityMapRow,
  FieldMapRow,
  RunDetailRow
} from '../../services/integration-data.service';

@RegisterClass(BaseResourceComponent, 'IntegrationMappingWorkspace')
@Component({
  standalone: false,
  selector: 'app-mapping-workspace',
  templateUrl: './mapping-workspace.component.html',
  styles: [`
    .mapping-workspace { padding: 24px; height: 100%; display: flex; flex-direction: column; }
    .workspace-header {
      margin-bottom: 16px;
      h2 {
        margin: 0; font-size: 20px; font-weight: 600;
        i { margin-right: 8px; }
      }
    }
    .workspace-splitter { flex: 1; min-height: 500px; }

    .left-panel, .center-panel, .right-panel { padding: 16px; height: 100%; overflow-y: auto; }

    .panel-label {
      font-size: 12px; font-weight: 600; color: #666;
      text-transform: uppercase; letter-spacing: 0.5px;
      margin: 0 0 8px 0; display: block;
    }
    .panel-title {
      margin: 0 0 12px 0; font-size: 16px;
      .field-count { color: #888; font-weight: 400; }
    }
    .panel-section { margin-bottom: 20px; }
    .empty-hint { color: #999; font-size: 13px; font-style: italic; }

    .entity-map-list { display: flex; flex-direction: column; gap: 4px; }
    .entity-map-item {
      padding: 8px 10px; border-radius: 6px;
      cursor: pointer; border: 1px solid #eee; transition: all 0.15s;
    }
    .entity-map-item:hover { background: #f8f9fa; }
    .entity-map-item.selected { background: #f0f4ff; border-color: #4a6cf7; }
    .em-info {
      display: flex; align-items: center; gap: 4px;
      font-size: 13px; margin-bottom: 4px;
    }
    .em-name { font-weight: 600; }
    .em-arrow { color: #999; }
    .em-entity { color: #666; }
    .em-controls {
      display: flex; align-items: center; justify-content: space-between;
      font-size: 11px; color: #888;
    }
    .em-direction {
      background: #f0f0f0; padding: 1px 6px; border-radius: 4px; font-size: 10px;
    }

    .placeholder-message {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; height: 300px; color: #999;
      i { font-size: 36px; margin-bottom: 12px; }
      p { text-align: center; }
    }

    .direction-badge {
      font-size: 11px; background: #f0f0f0; padding: 2px 6px; border-radius: 4px;
    }
    .key-icon { color: #b5850a; font-size: 12px; }
    .status-badge {
      font-size: 11px; padding: 2px 6px; border-radius: 4px; font-weight: 500;
    }
    .status-active { background: #e6f9ed; color: #1b7a3d; }
    .status-inactive { background: #f0f0f0; color: #757575; }

    .run-summary-card {
      background: #f8f9fa; border-radius: 8px; padding: 12px;
    }
    .run-summary-row {
      display: flex; justify-content: space-between;
      padding: 4px 0; font-size: 13px;
      .label { color: #666; font-weight: 500; }
    }
    .run-status {
      font-size: 11px; padding: 2px 6px; border-radius: 4px; font-weight: 600;
    }
    .status-green { background: #e6f9ed; color: #1b7a3d; }
    .status-amber { background: #fff7e0; color: #b5850a; }
    .status-red   { background: #fde8e8; color: #c62828; }

    .entity-stat-card {
      background: #f8f9fa; border-radius: 6px; padding: 10px;
      margin-bottom: 8px;
    }
    .entity-stat-name { font-size: 13px; font-weight: 600; margin-bottom: 6px; }
    .entity-stat-grid { display: flex; gap: 12px; }
    .mini-stat { text-align: center; }
    .mini-val { display: block; font-size: 16px; font-weight: 600; }
    .mini-val.has-errors { color: #c62828; }
    .mini-label { font-size: 10px; color: #888; }
  `]
})
export class MappingWorkspaceComponent extends BaseResourceComponent implements OnInit {
  Integrations: IntegrationRow[] = [];
  EntityMaps: EntityMapRow[] = [];
  FieldMaps: FieldMapRow[] = [];
  RunEntityDetails: RunDetailRow[] = [];
  LatestRun: IntegrationRunRow | null = null;

  SelectedIntegrationID: string = '';
  SelectedEntityMapID: string | null = null;

  IsLoadingIntegrations = false;
  IsLoadingEntityMaps = false;
  IsLoadingFieldMaps = false;
  IsLoadingRunDetails = false;

  private dataService = inject(IntegrationDataService);

  async ngOnInit(): Promise<void> {
    await this.LoadIntegrations();
  }

  async LoadIntegrations(): Promise<void> {
    this.IsLoadingIntegrations = true;
    try {
      const summaries = await this.dataService.LoadIntegrationSummaries();
      this.Integrations = summaries.map(s => s.Integration);
    } finally {
      this.IsLoadingIntegrations = false;
    }
  }

  async OnIntegrationChange(integrationID: string): Promise<void> {
    this.SelectedIntegrationID = integrationID;
    this.SelectedEntityMapID = null;
    this.FieldMaps = [];
    this.RunEntityDetails = [];
    this.LatestRun = null;

    if (!integrationID) return;
    await Promise.all([
      this.LoadEntityMapsForIntegration(integrationID),
      this.LoadLatestRunForIntegration(integrationID)
    ]);
  }

  async LoadEntityMapsForIntegration(integrationID: string): Promise<void> {
    this.IsLoadingEntityMaps = true;
    try {
      this.EntityMaps = await this.dataService.LoadEntityMaps(integrationID);
    } finally {
      this.IsLoadingEntityMaps = false;
    }
  }

  async LoadLatestRunForIntegration(integrationID: string): Promise<void> {
    this.IsLoadingRunDetails = true;
    try {
      const runs = await this.dataService.LoadRunHistory(integrationID, 1);
      this.LatestRun = runs.length > 0 ? runs[0] : null;
      if (this.LatestRun) {
        this.RunEntityDetails = await this.dataService.LoadRunDetails(this.LatestRun.ID);
      }
    } finally {
      this.IsLoadingRunDetails = false;
    }
  }

  async OnEntityMapSelect(em: EntityMapRow): Promise<void> {
    this.SelectedEntityMapID = em.ID;
    this.IsLoadingFieldMaps = true;
    try {
      this.FieldMaps = await this.dataService.LoadFieldMaps(em.ID);
    } finally {
      this.IsLoadingFieldMaps = false;
    }
  }

  OnToggleEntityMap(em: EntityMapRow): void {
    console.log('[MappingWorkspace] Toggle entity map:', em.ID, 'enabled:', em.SyncEnabled);
  }

  get RunStatusColor(): string {
    if (!this.LatestRun) return 'gray';
    if (this.LatestRun.Status === 'Success') return 'green';
    if (this.LatestRun.Status === 'Failed') return 'red';
    return 'amber';
  }

  FormatDate(dateStr: string | null): string {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Mapping Workspace';
  }

  async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-diagram-project';
  }
}

export function LoadMappingWorkspace(): void {
  // Tree-shaking prevention
}
