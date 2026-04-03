import {
  Component,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  OnInit,
  OnDestroy,
  inject,
} from '@angular/core';
import { CompositeKey, Metadata, RunView } from '@memberjunction/core';

/** Represents an archive configuration record */
export interface ArchiveConfig {
  ID: string;
  Name: string;
  Description: string;
  Status: string;
  StorageAccountID: string;
  StorageAccountName: string;
  RootPath: string;
  DefaultRetentionDays: number;
  DefaultBatchSize: number;
  DefaultArchiveMode: string;
  ArchiveRecordChanges: boolean;
  EntityCount: number;
  LastRunDate: string;
  IsDirty: boolean;
}

/** Represents an entity within a configuration */
export interface ArchiveConfigEntity {
  ID: string;
  ConfigurationID: string;
  EntityName: string;
  ArchiveMode: string;
  RetentionDays: number;
  BatchSize: number;
  DateFieldName: string;
  IsActive: boolean;
  IsNew: boolean;
  IsDirty: boolean;
}

/** Storage account option for the dropdown */
export interface StorageAccountOption {
  ID: string;
  Name: string;
}

@Component({
  standalone: false,
  selector: 'mj-archive-config-admin',
  templateUrl: './archive-config-admin.component.html',
  styleUrls: ['./archive-config-admin.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArchiveConfigAdminComponent implements OnInit, OnDestroy {
  private cdr = inject(ChangeDetectorRef);

  /** All configurations */
  Configs: ArchiveConfig[] = [];

  /** Currently selected configuration */
  SelectedConfig: ArchiveConfig | null = null;

  /** Entities for the selected configuration */
  ConfigEntities: ArchiveConfigEntity[] = [];

  /** Available storage accounts for dropdown */
  StorageAccounts: StorageAccountOption[] = [];

  /** Available archive modes */
  ArchiveModes: string[] = ['Full', 'Incremental', 'Selective'];

  /** Whether the list is loading */
  IsLoading = true;

  /** Whether the detail panel is loading */
  IsDetailLoading = false;

  /** Whether a save operation is in progress */
  IsSaving = false;

  /** Status message for feedback */
  StatusMessage = '';

  /** Status type for styling */
  StatusType: 'success' | 'error' | '' = '';

  private destroyed = false;

  ngOnInit(): void {
    this.loadAllData();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
  }

  /** Select a configuration and load its entities */
  async SelectConfig(config: ArchiveConfig): Promise<void> {
    this.SelectedConfig = { ...config };
    this.clearStatus();
    await this.loadConfigEntities(config.ID);
  }

  /** Check if a config is the currently selected one */
  IsSelectedConfig(config: ArchiveConfig): boolean {
    return this.SelectedConfig?.ID === config.ID;
  }

  /** Add a new empty entity row */
  AddEntity(): void {
    if (!this.SelectedConfig) return;

    const newEntity: ArchiveConfigEntity = {
      ID: `new-${Date.now()}`,
      ConfigurationID: this.SelectedConfig.ID,
      EntityName: '',
      ArchiveMode: this.SelectedConfig.DefaultArchiveMode || 'Full',
      RetentionDays: this.SelectedConfig.DefaultRetentionDays || 90,
      BatchSize: this.SelectedConfig.DefaultBatchSize || 100,
      DateFieldName: '',
      IsActive: true,
      IsNew: true,
      IsDirty: true,
    };
    this.ConfigEntities = [...this.ConfigEntities, newEntity];
    this.cdr.markForCheck();
  }

  /** Remove an entity row */
  RemoveEntity(entity: ArchiveConfigEntity): void {
    this.ConfigEntities = this.ConfigEntities.filter((e) => e.ID !== entity.ID);
    this.cdr.markForCheck();
  }

  /** Mark an entity as dirty when edited */
  OnEntityChanged(entity: ArchiveConfigEntity): void {
    entity.IsDirty = true;
    this.cdr.markForCheck();
  }

  /** Mark the selected config as dirty */
  OnConfigFieldChanged(): void {
    if (this.SelectedConfig) {
      this.SelectedConfig.IsDirty = true;
      this.cdr.markForCheck();
    }
  }

  /** Save the selected configuration and its entities */
  async Save(): Promise<void> {
    if (!this.SelectedConfig) return;

    this.IsSaving = true;
    this.clearStatus();
    this.cdr.markForCheck();

    try {
      await this.saveConfiguration();
      await this.saveConfigEntities();
      this.setStatus('Configuration saved successfully.', 'success');
      await this.refreshConfigList();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Save failed. Please try again.';
      this.setStatus(message, 'error');
    } finally {
      this.IsSaving = false;
      this.markForCheckIfAlive();
    }
  }

  /** Cancel changes and reload the selected config */
  async Cancel(): Promise<void> {
    if (!this.SelectedConfig) return;

    const configId = this.SelectedConfig.ID;
    this.clearStatus();

    // Reload from the original data
    const original = this.Configs.find((c) => c.ID === configId);
    if (original) {
      this.SelectedConfig = { ...original };
      await this.loadConfigEntities(configId);
    }
  }

  /** Add a new configuration */
  AddConfiguration(): void {
    const newConfig: ArchiveConfig = {
      ID: `new-${Date.now()}`,
      Name: 'New Configuration',
      Description: '',
      Status: 'Inactive',
      StorageAccountID: '',
      StorageAccountName: '',
      RootPath: '/archives',
      DefaultRetentionDays: 90,
      DefaultBatchSize: 100,
      DefaultArchiveMode: 'Full',
      ArchiveRecordChanges: false,
      EntityCount: 0,
      LastRunDate: '',
      IsDirty: true,
    };
    this.Configs = [newConfig, ...this.Configs];
    this.SelectConfig(newConfig);
  }

  /** Get a display label for the status */
  GetStatusLabel(status: string): string {
    return status === 'Active' ? 'Active' : 'Inactive';
  }

  /** Load all initial data using batched RunViews */
  private async loadAllData(): Promise<void> {
    this.IsLoading = true;
    this.cdr.markForCheck();

    try {
      const rv = new RunView();
      const [configResult, storageResult] = await rv.RunViews([
        {
          EntityName: 'MJ: Archive Configurations',
          ExtraFilter: '',
          OrderBy: 'Name',
          ResultType: 'simple',
        },
        {
          EntityName: 'Storage Accounts',
          ExtraFilter: '',
          OrderBy: 'Name',
          ResultType: 'simple',
          Fields: ['ID', 'Name'],
        },
      ]);

      this.Configs = this.mapConfigRecords(configResult);
      this.StorageAccounts = this.mapStorageAccounts(storageResult);

      if (this.Configs.length > 0) {
        await this.SelectConfig(this.Configs[0]);
      }
    } catch {
      this.setStatus('Failed to load configurations.', 'error');
    } finally {
      this.IsLoading = false;
      this.markForCheckIfAlive();
    }
  }

  /** Map raw config records to typed objects */
  private mapConfigRecords(result: { Success: boolean; Results: Record<string, unknown>[] }): ArchiveConfig[] {
    if (!result.Success) return [];
    return result.Results.map((r) => ({
      ID: String(r['ID'] ?? ''),
      Name: String(r['Name'] ?? ''),
      Description: String(r['Description'] ?? ''),
      Status: String(r['Status'] ?? 'Inactive'),
      StorageAccountID: String(r['StorageAccountID'] ?? ''),
      StorageAccountName: String(r['StorageAccountName'] ?? ''),
      RootPath: String(r['RootPath'] ?? ''),
      DefaultRetentionDays: Number(r['DefaultRetentionDays'] ?? 90),
      DefaultBatchSize: Number(r['DefaultBatchSize'] ?? 100),
      DefaultArchiveMode: String(r['DefaultArchiveMode'] ?? 'Full'),
      ArchiveRecordChanges: Boolean(r['ArchiveRecordChanges']),
      EntityCount: Number(r['EntityCount'] ?? 0),
      LastRunDate: String(r['LastRunDate'] ?? ''),
      IsDirty: false,
    }));
  }

  /** Map raw storage account records */
  private mapStorageAccounts(result: { Success: boolean; Results: Record<string, unknown>[] }): StorageAccountOption[] {
    if (!result.Success) return [];
    return result.Results.map((r) => ({
      ID: String(r['ID'] ?? ''),
      Name: String(r['Name'] ?? ''),
    }));
  }

  /** Load entities for a specific configuration */
  private async loadConfigEntities(configId: string): Promise<void> {
    this.IsDetailLoading = true;
    this.cdr.markForCheck();

    try {
      const rv = new RunView();
      const escapedId = configId.replace(/'/g, "''");
      const result = await rv.RunView<Record<string, unknown>>({
        EntityName: 'MJ: Archive Configuration Entities',
        ExtraFilter: `ConfigurationID='${escapedId}'`,
        OrderBy: 'EntityName',
        ResultType: 'simple',
      });

      this.ConfigEntities = this.mapEntityRecords(result);
    } catch {
      this.ConfigEntities = [];
    } finally {
      this.IsDetailLoading = false;
      this.markForCheckIfAlive();
    }
  }

  /** Map raw entity records to typed objects */
  private mapEntityRecords(result: { Success: boolean; Results: Record<string, unknown>[] }): ArchiveConfigEntity[] {
    if (!result.Success) return [];
    return result.Results.map((r) => ({
      ID: String(r['ID'] ?? ''),
      ConfigurationID: String(r['ConfigurationID'] ?? ''),
      EntityName: String(r['EntityName'] ?? ''),
      ArchiveMode: String(r['ArchiveMode'] ?? 'Full'),
      RetentionDays: Number(r['RetentionDays'] ?? 90),
      BatchSize: Number(r['BatchSize'] ?? 100),
      DateFieldName: String(r['DateFieldName'] ?? ''),
      IsActive: Boolean(r['IsActive']),
      IsNew: false,
      IsDirty: false,
    }));
  }

  /** Save the configuration record */
  private async saveConfiguration(): Promise<void> {
    if (!this.SelectedConfig?.IsDirty) return;

    const md = new Metadata();
    const entity = await md.GetEntityObject('MJ: Archive Configurations');

    if (!this.SelectedConfig.ID.startsWith('new-')) {
      await entity.InnerLoad(CompositeKey.FromKeyValuePair('ID', this.SelectedConfig.ID));
    } else {
      entity.NewRecord();
    }

    this.applyConfigToEntity(entity);
    const saved = await entity.Save();
    if (!saved) {
      throw new Error('Failed to save configuration.');
    }

    this.SelectedConfig.IsDirty = false;
  }

  /** Apply config fields to an entity object for saving */
  private applyConfigToEntity(entity: {
    Set: (field: string, value: unknown) => void;
  }): void {
    if (!this.SelectedConfig) return;
    entity.Set('Name', this.SelectedConfig.Name);
    entity.Set('Description', this.SelectedConfig.Description);
    entity.Set('Status', this.SelectedConfig.Status);
    entity.Set('StorageAccountID', this.SelectedConfig.StorageAccountID);
    entity.Set('RootPath', this.SelectedConfig.RootPath);
    entity.Set('DefaultRetentionDays', this.SelectedConfig.DefaultRetentionDays);
    entity.Set('DefaultBatchSize', this.SelectedConfig.DefaultBatchSize);
    entity.Set('DefaultArchiveMode', this.SelectedConfig.DefaultArchiveMode);
    entity.Set('ArchiveRecordChanges', this.SelectedConfig.ArchiveRecordChanges);
  }

  /** Save all dirty/new entity records */
  private async saveConfigEntities(): Promise<void> {
    const dirtyEntities = this.ConfigEntities.filter((e) => e.IsDirty);
    for (const configEntity of dirtyEntities) {
      await this.saveConfigEntity(configEntity);
    }
  }

  /** Save a single config entity record */
  private async saveConfigEntity(configEntity: ArchiveConfigEntity): Promise<void> {
    const md = new Metadata();
    const entity = await md.GetEntityObject('MJ: Archive Configuration Entities');

    if (!configEntity.IsNew) {
      await entity.InnerLoad(CompositeKey.FromKeyValuePair('ID', configEntity.ID));
    } else {
      entity.NewRecord();
    }

    entity.Set('ConfigurationID', configEntity.ConfigurationID);
    entity.Set('EntityName', configEntity.EntityName);
    entity.Set('ArchiveMode', configEntity.ArchiveMode);
    entity.Set('RetentionDays', configEntity.RetentionDays);
    entity.Set('BatchSize', configEntity.BatchSize);
    entity.Set('DateFieldName', configEntity.DateFieldName);
    entity.Set('IsActive', configEntity.IsActive);

    const saved = await entity.Save();
    if (!saved) {
      throw new Error(`Failed to save entity "${configEntity.EntityName}".`);
    }

    configEntity.IsDirty = false;
    configEntity.IsNew = false;
  }

  /** Refresh the config list after a save */
  private async refreshConfigList(): Promise<void> {
    const rv = new RunView();
    const result = await rv.RunView<Record<string, unknown>>({
      EntityName: 'MJ: Archive Configurations',
      ExtraFilter: '',
      OrderBy: 'Name',
      ResultType: 'simple',
    });
    this.Configs = this.mapConfigRecords(result);
  }

  /** Set a status message */
  private setStatus(message: string, type: 'success' | 'error'): void {
    this.StatusMessage = message;
    this.StatusType = type;
  }

  /** Clear status message */
  private clearStatus(): void {
    this.StatusMessage = '';
    this.StatusType = '';
  }

  /** Mark for check only if not destroyed */
  private markForCheckIfAlive(): void {
    if (!this.destroyed) {
      this.cdr.markForCheck();
    }
  }
}
