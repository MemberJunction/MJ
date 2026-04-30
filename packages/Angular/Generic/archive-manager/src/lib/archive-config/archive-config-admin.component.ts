import {
  Component,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  OnInit,
  OnDestroy,
  inject,
} from '@angular/core';
import { CompositeKey, RunView } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import {
  MJArchiveConfigurationEntity,
  MJArchiveConfigurationEntityEntity,
  MJArchiveConfigurationEntityType,
  MJArchiveConfigurationEntityEntityType,
} from '@memberjunction/core-entities';

type ArchiveStatus = MJArchiveConfigurationEntityType['Status'];
type ArchiveMode = MJArchiveConfigurationEntityType['DefaultMode'];
type EntityMode = MJArchiveConfigurationEntityEntityType['Mode'];

/** Represents an archive configuration record */
export interface ArchiveConfig {
  ID: string;
  Name: string;
  Description: string;
  Status: ArchiveStatus;
  StorageAccountID: string;
  StorageAccountName: string;
  RootPath: string;
  DefaultRetentionDays: number;
  DefaultBatchSize: number;
  DefaultMode: ArchiveMode;
  ArchiveRelatedRecordChanges: boolean;
  IsDirty: boolean;
}

/** Represents an entity within a configuration */
export interface ArchiveConfigEntity {
  ID: string;
  ArchiveConfigurationID: string;
  EntityName: string;
  Mode: EntityMode;
  RetentionDays: number;
  BatchSize: number;
  DateField: string;
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
export class ArchiveConfigAdminComponent extends BaseAngularComponent implements OnInit, OnDestroy {
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
  ArchiveModes: string[] = ['StripFields', 'SoftDelete', 'HardDelete', 'ArchiveOnly'];

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
    return UUIDsEqual(this.SelectedConfig?.ID, config.ID);
  }

  /** Add a new empty entity row */
  AddEntity(): void {
    if (!this.SelectedConfig) return;

    const newEntity: ArchiveConfigEntity = {
      ID: `new-${Date.now()}`,
      ArchiveConfigurationID: this.SelectedConfig.ID,
      EntityName: '',
      Mode: this.SelectedConfig.DefaultMode ?? 'StripFields',
      RetentionDays: this.SelectedConfig.DefaultRetentionDays || 365,
      BatchSize: this.SelectedConfig.DefaultBatchSize || 100,
      DateField: '__mj_CreatedAt',
      IsActive: true,
      IsNew: true,
      IsDirty: true,
    };
    this.ConfigEntities = [...this.ConfigEntities, newEntity];
    this.cdr.markForCheck();
  }

  /** Remove an entity row */
  RemoveEntity(entity: ArchiveConfigEntity): void {
    this.ConfigEntities = this.ConfigEntities.filter((e) => !UUIDsEqual(e.ID, entity.ID));
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

    const original = this.Configs.find((c) => UUIDsEqual(c.ID, configId));
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
      Status: 'Disabled',
      StorageAccountID: '',
      StorageAccountName: '',
      RootPath: '/archives',
      DefaultRetentionDays: 365,
      DefaultBatchSize: 100,
      DefaultMode: 'StripFields',
      ArchiveRelatedRecordChanges: false,
      IsDirty: true,
    };
    this.Configs = [newConfig, ...this.Configs];
    this.SelectConfig(newConfig);
  }

  /** Get a display label for the status */
  GetStatusLabel(status: string | undefined): string {
    switch (status) {
      case 'Idle': return 'Idle';
      case 'Running': return 'Running';
      case 'Error': return 'Error';
      default: return 'Disabled';
    }
  }

  /** Load all initial data using batched RunViews */
  private async loadAllData(): Promise<void> {
    this.IsLoading = true;
    this.cdr.markForCheck();

    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const [configResult, storageResult] = await rv.RunViews([
        {
          EntityName: 'MJ: Archive Configurations',
          ExtraFilter: '',
          OrderBy: 'Name',
          ResultType: 'simple',
        },
        {
          EntityName: 'MJ: File Storage Accounts',
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
      Status: (r['Status'] as ArchiveStatus) ?? 'Disabled',
      StorageAccountID: String(r['StorageAccountID'] ?? ''),
      StorageAccountName: String(r['StorageAccount'] ?? ''),
      RootPath: String(r['RootPath'] ?? ''),
      DefaultRetentionDays: Number(r['DefaultRetentionDays'] ?? 365),
      DefaultBatchSize: Number(r['DefaultBatchSize'] ?? 100),
      DefaultMode: (r['DefaultMode'] as ArchiveMode) ?? 'StripFields',
      ArchiveRelatedRecordChanges: Boolean(r['ArchiveRelatedRecordChanges']),
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
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const escapedId = configId.replace(/'/g, "''");
      const result = await rv.RunView<Record<string, unknown>>({
        EntityName: 'MJ: Archive Configuration Entities',
        ExtraFilter: `ArchiveConfigurationID='${escapedId}'`,
        OrderBy: 'Entity',
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
      ArchiveConfigurationID: String(r['ArchiveConfigurationID'] ?? ''),
      EntityName: String(r['Entity'] ?? ''),
      Mode: (r['Mode'] as EntityMode) ?? 'StripFields',
      RetentionDays: Number(r['RetentionDays'] ?? 365),
      BatchSize: Number(r['BatchSize'] ?? 100),
      DateField: String(r['DateField'] ?? '__mj_CreatedAt'),
      IsActive: Boolean(r['IsActive']),
      IsNew: false,
      IsDirty: false,
    }));
  }

  /** Save the configuration record using strongly-typed entity */
  private async saveConfiguration(): Promise<void> {
    if (!this.SelectedConfig?.IsDirty) return;

    const md = this.ProviderToUse;
    const entity = await md.GetEntityObject<MJArchiveConfigurationEntity>('MJ: Archive Configurations', md.CurrentUser);

    if (!this.SelectedConfig.ID.startsWith('new-')) {
      await entity.InnerLoad(CompositeKey.FromKeyValuePair('ID', this.SelectedConfig.ID));
    } else {
      entity.NewRecord();
    }

    entity.Name = this.SelectedConfig.Name;
    entity.Description = this.SelectedConfig.Description;
    entity.Status = this.SelectedConfig.Status ?? 'Disabled';
    if (this.SelectedConfig.StorageAccountID) {
      entity.StorageAccountID = this.SelectedConfig.StorageAccountID;
    }
    entity.RootPath = this.SelectedConfig.RootPath;
    entity.DefaultRetentionDays = this.SelectedConfig.DefaultRetentionDays;
    entity.DefaultBatchSize = this.SelectedConfig.DefaultBatchSize;
    entity.DefaultMode = this.SelectedConfig.DefaultMode ?? 'StripFields';
    entity.ArchiveRelatedRecordChanges = this.SelectedConfig.ArchiveRelatedRecordChanges;

    const saved = await entity.Save();
    if (!saved) {
      throw new Error('Failed to save configuration.');
    }

    // Update the ID if this was a new record
    if (this.SelectedConfig.ID.startsWith('new-')) {
      this.SelectedConfig.ID = entity.ID;
    }
    this.SelectedConfig.IsDirty = false;
  }

  /** Save all dirty/new entity records */
  private async saveConfigEntities(): Promise<void> {
    const dirtyEntities = this.ConfigEntities.filter((e) => e.IsDirty);
    for (const configEntity of dirtyEntities) {
      await this.saveConfigEntity(configEntity);
    }
  }

  /** Save a single config entity record using strongly-typed entity */
  private async saveConfigEntity(configEntity: ArchiveConfigEntity): Promise<void> {
    const md = this.ProviderToUse;
    const entity = await md.GetEntityObject<MJArchiveConfigurationEntityEntity>('MJ: Archive Configuration Entities', md.CurrentUser);

    if (!configEntity.IsNew) {
      await entity.InnerLoad(CompositeKey.FromKeyValuePair('ID', configEntity.ID));
    } else {
      entity.NewRecord();
    }

    entity.ArchiveConfigurationID = configEntity.ArchiveConfigurationID;
    entity.Mode = configEntity.Mode ?? null;
    entity.RetentionDays = configEntity.RetentionDays;
    entity.BatchSize = configEntity.BatchSize;
    entity.DateField = configEntity.DateField;
    entity.IsActive = configEntity.IsActive;

    const saved = await entity.Save();
    if (!saved) {
      throw new Error(`Failed to save entity "${configEntity.EntityName}".`);
    }

    configEntity.IsDirty = false;
    configEntity.IsNew = false;
  }

  /** Refresh the config list after a save */
  private async refreshConfigList(): Promise<void> {
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
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
