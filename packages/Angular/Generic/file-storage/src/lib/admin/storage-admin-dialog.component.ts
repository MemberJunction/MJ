import {
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  ViewContainerRef,
  inject,
  ChangeDetectorRef,
} from '@angular/core';
import {
  Metadata,
  RunView,
  type IMetadataProvider,
} from '@memberjunction/core';
import {
  FileStorageEngineBase,
  MJFileStorageAccountEntity,
  MJFileStorageProviderEntity,
  MJFileStorageAccountPermissionEntity,
  MJCredentialEntity,
  MJRoleEntity,
} from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { CredentialDialogService } from '@memberjunction/ng-credentials';

export type StorageAdminTab = 'accounts' | 'providers';

export interface StorageAccountRow {
  account: MJFileStorageAccountEntity;
  provider?: MJFileStorageProviderEntity;
  credentialName?: string;
  roleCount: number;
}

@Component({
  standalone: false,
  selector: 'mj-storage-admin-dialog',
  templateUrl: './storage-admin-dialog.component.html',
  styleUrls: ['./storage-admin-dialog.component.css'],
})
export class StorageAdminDialogComponent implements OnInit {
  private cdr = inject(ChangeDetectorRef);
  private notifications = inject(MJNotificationService);
  private viewContainerRef = inject(ViewContainerRef);
  private credentialDialog = inject(CredentialDialogService);

  @Input() Visible: boolean = false;
  @Input() ActiveTab: StorageAdminTab = 'accounts';
  @Input() Provider: IMetadataProvider | null = null;

  @Output() Close = new EventEmitter<void>();
  @Output() AccountsChanged = new EventEmitter<void>();

  public get ProviderToUse(): IMetadataProvider {
    return this.Provider ?? Metadata.Provider;
  }

  // ── State ───────────────────────────────────────────────────────────
  public IsLoading: boolean = false;
  public IsSaving: boolean = false;
  public SearchTerm: string = '';

  public Providers: MJFileStorageProviderEntity[] = [];
  public Accounts: MJFileStorageAccountEntity[] = [];
  public Credentials: MJCredentialEntity[] = [];
  public Roles: MJRoleEntity[] = [];
  public AccountPermissions: MJFileStorageAccountPermissionEntity[] = [];

  // ── Account Editor Sub-View / Modal ─────────────────────────────────
  public IsEditingAccount: boolean = false;
  public EditingAccount: MJFileStorageAccountEntity | null = null;
  public EditingAccountName: string = '';
  public EditingAccountDescription: string = '';
  public EditingAccountProviderID: string = '';
  public EditingAccountCredentialID: string = '';
  public EditingAccountIncludeInGlobalSearch: boolean = false;
  public EditingAccountSelectedRoleIDs: string[] = [];

  // ── Delete Confirmation ─────────────────────────────────────────────
  public AccountToDelete: MJFileStorageAccountEntity | null = null;
  public IsDeleting: boolean = false;

  async ngOnInit(): Promise<void> {
    if (this.Visible) {
      await this.LoadAllData();
    }
  }

  public async Open(tab: StorageAdminTab = 'accounts', accountToEdit?: MJFileStorageAccountEntity | null): Promise<void> {
    this.ActiveTab = tab;
    this.Visible = true;
    this.IsEditingAccount = false;
    this.AccountToDelete = null;
    await this.LoadAllData();

    if (accountToEdit) {
      this.StartEditAccount(accountToEdit);
    }
    this.cdr.markForCheck();
  }

  public async LoadAllData(): Promise<void> {
    this.IsLoading = true;
    this.cdr.markForCheck();

    try {
      const md = this.ProviderToUse;
      const rv = RunView.FromMetadataProvider(md);

      // Load providers and accounts via FileStorageEngineBase + RunView
      await FileStorageEngineBase.Instance.Config(true);
      this.Providers = [...FileStorageEngineBase.Instance.Providers].sort(
        (a, b) => (a.Priority ?? 0) - (b.Priority ?? 0) || a.Name.localeCompare(b.Name)
      );
      this.Accounts = [...FileStorageEngineBase.Instance.Accounts].sort((a, b) =>
        a.Name.localeCompare(b.Name)
      );

      // Load Credentials
      const credResult = await rv.RunView<MJCredentialEntity>({
        EntityName: 'MJ: Credentials',
        OrderBy: 'Name',
        ResultType: 'entity_object',
      });
      if (credResult.Success) {
        this.Credentials = credResult.Results;
      }

      // Load Roles
      const roleResult = await rv.RunView<MJRoleEntity>({
        EntityName: 'MJ: Roles',
        OrderBy: 'Name',
        ResultType: 'entity_object',
      });
      if (roleResult.Success) {
        this.Roles = roleResult.Results;
      }

      // Load Account Permissions
      const permResult = await rv.RunView<MJFileStorageAccountPermissionEntity>({
        EntityName: 'MJ: File Storage Account Permissions',
        ResultType: 'entity_object',
      });
      if (permResult.Success) {
        this.AccountPermissions = permResult.Results;
      }
    } catch (err) {
      console.error('[StorageAdminDialogComponent] Error loading storage data:', err);
      this.notifications.CreateSimpleNotification('Failed to load storage configuration.', 'error');
    } finally {
      this.IsLoading = false;
      this.cdr.markForCheck();
    }
  }

  // ── Computed Rows & Filters ─────────────────────────────────────────

  public get FilteredAccountRows(): StorageAccountRow[] {
    const term = (this.SearchTerm || '').toLowerCase().trim();
    const providerMap = new Map<string, MJFileStorageProviderEntity>();
    for (const p of this.Providers) {
      providerMap.set(p.ID, p);
    }

    const credMap = new Map<string, string>();
    for (const c of this.Credentials) {
      credMap.set(c.ID, c.Name);
    }

    return this.Accounts.filter((a) => {
      if (!term) return true;
      const prov = providerMap.get(a.ProviderID);
      const credName = a.CredentialID ? credMap.get(a.CredentialID) || '' : '';
      return (
        a.Name.toLowerCase().includes(term) ||
        (a.Description || '').toLowerCase().includes(term) ||
        (prov?.Name || '').toLowerCase().includes(term) ||
        credName.toLowerCase().includes(term)
      );
    }).map((account) => {
      const provider = providerMap.get(account.ProviderID);
      const credentialName = account.CredentialID ? credMap.get(account.CredentialID) : undefined;
      const roleCount = this.AccountPermissions.filter((p) => UUIDsEqual(p.FileStorageAccountID, account.ID)).length;
      return { account, provider, credentialName, roleCount };
    });
  }

  public get ActiveProviders(): MJFileStorageProviderEntity[] {
    return this.Providers.filter((p) => p.IsActive);
  }

  // ── Account Editing ─────────────────────────────────────────────────

  public StartCreateAccount(): void {
    this.EditingAccount = null;
    this.EditingAccountName = '';
    this.EditingAccountDescription = '';
    this.EditingAccountProviderID = this.ActiveProviders[0]?.ID || (this.Providers[0]?.ID ?? '');
    this.EditingAccountCredentialID = '';
    this.EditingAccountIncludeInGlobalSearch = false;
    this.EditingAccountSelectedRoleIDs = [];
    this.IsEditingAccount = true;
    this.cdr.markForCheck();
  }

  public StartEditAccount(account: MJFileStorageAccountEntity): void {
    this.EditingAccount = account;
    this.EditingAccountName = account.Name || '';
    this.EditingAccountDescription = account.Description || '';
    this.EditingAccountProviderID = account.ProviderID || '';
    this.EditingAccountCredentialID = account.CredentialID || '';
    this.EditingAccountIncludeInGlobalSearch = !!account.IncludeInGlobalSearch;

    const accountPerms = this.AccountPermissions.filter((p) => UUIDsEqual(p.FileStorageAccountID, account.ID));
    this.EditingAccountSelectedRoleIDs = accountPerms
      .map((p) => p.RoleID)
      .filter((roleId): roleId is string => roleId !== null && roleId !== undefined);

    this.IsEditingAccount = true;
    this.cdr.markForCheck();
  }

  public CancelEditAccount(): void {
    this.IsEditingAccount = false;
    this.EditingAccount = null;
    this.cdr.markForCheck();
  }

  public ToggleRoleSelection(roleId: string): void {
    const idx = this.EditingAccountSelectedRoleIDs.findIndex((id) => UUIDsEqual(id, roleId));
    if (idx >= 0) {
      this.EditingAccountSelectedRoleIDs.splice(idx, 1);
    } else {
      this.EditingAccountSelectedRoleIDs.push(roleId);
    }
  }

  public IsRoleSelected(roleId: string): boolean {
    return this.EditingAccountSelectedRoleIDs.some((id) => UUIDsEqual(id, roleId));
  }

  public async OpenCreateCredentialDialog(): Promise<void> {
    try {
      const result = await this.credentialDialog.openDialog(this.viewContainerRef, {
        title: 'Create Credential for Storage Account',
      });
      if (result.success && result.credential) {
        // Refresh credentials list
        const md = this.ProviderToUse;
        const rv = RunView.FromMetadataProvider(md);
        const credResult = await rv.RunView<MJCredentialEntity>({
          EntityName: 'MJ: Credentials',
          OrderBy: 'Name',
          ResultType: 'entity_object',
        });
        if (credResult.Success) {
          this.Credentials = credResult.Results;
        }
        this.EditingAccountCredentialID = result.credential.ID;
        this.notifications.CreateSimpleNotification(`Credential "${result.credential.Name}" created.`, 'success');
        this.cdr.markForCheck();
      }
    } catch (err) {
      console.error('[StorageAdminDialogComponent] Error creating credential:', err);
    }
  }

  public async SaveAccount(): Promise<void> {
    const name = this.EditingAccountName.trim();
    if (!name) {
      this.notifications.CreateSimpleNotification('Account name is required.', 'warning');
      return;
    }
    if (!this.EditingAccountProviderID) {
      this.notifications.CreateSimpleNotification('Storage provider is required.', 'warning');
      return;
    }

    this.IsSaving = true;
    this.cdr.markForCheck();

    try {
      const md = this.ProviderToUse;
      const user = md.CurrentUser;
      let accountEntity: MJFileStorageAccountEntity;

      if (this.EditingAccount) {
        accountEntity = this.EditingAccount;
      } else {
        accountEntity = await md.GetEntityObject<MJFileStorageAccountEntity>(
          'MJ: File Storage Accounts',
          user
        );
      }

      accountEntity.Name = name;
      accountEntity.Description = this.EditingAccountDescription.trim() || null;
      accountEntity.ProviderID = this.EditingAccountProviderID;
      accountEntity.CredentialID = this.EditingAccountCredentialID || '';
      accountEntity.IncludeInGlobalSearch = this.EditingAccountIncludeInGlobalSearch;

      const saved = await accountEntity.Save();
      if (!saved) {
        throw new Error(accountEntity.LatestResult?.Message || 'Failed to save storage account.');
      }

      // Sync Role Permissions
      await this.SyncAccountPermissions(accountEntity.ID, this.EditingAccountSelectedRoleIDs);

      // Force engine refresh
      await FileStorageEngineBase.Instance.Config(true);
      await this.LoadAllData();

      this.IsEditingAccount = false;
      this.EditingAccount = null;
      this.AccountsChanged.emit();
      this.notifications.CreateSimpleNotification(`Storage account "${name}" saved successfully.`, 'success');
    } catch (err) {
      console.error('[StorageAdminDialogComponent] Error saving account:', err);
      const msg = err instanceof Error ? err.message : 'Failed to save storage account.';
      this.notifications.CreateSimpleNotification(msg, 'error');
    } finally {
      this.IsSaving = false;
      this.cdr.markForCheck();
    }
  }

  private async SyncAccountPermissions(accountId: string, desiredRoleIds: string[]): Promise<void> {
    const md = this.ProviderToUse;
    const user = md.CurrentUser;

    const existingPerms = this.AccountPermissions.filter((p) => UUIDsEqual(p.FileStorageAccountID, accountId));
    const existingRoleMap = new Map<string, MJFileStorageAccountPermissionEntity>();
    for (const p of existingPerms) {
      if (p.RoleID) {
        existingRoleMap.set(p.RoleID, p);
      }
    }

    // Delete permissions for unselected roles
    for (const p of existingPerms) {
      if (!p.RoleID || !desiredRoleIds.some((rId) => UUIDsEqual(rId, p.RoleID))) {
        await p.Delete();
      }
    }

    // Add permissions for newly selected roles
    for (const roleId of desiredRoleIds) {
      if (!existingRoleMap.has(roleId)) {
        const newPerm = await md.GetEntityObject<MJFileStorageAccountPermissionEntity>(
          'MJ: File Storage Account Permissions',
          user
        );
        newPerm.FileStorageAccountID = accountId;
        newPerm.Type = 'Role';
        newPerm.RoleID = roleId;
        newPerm.CanRead = true;
        newPerm.CanWrite = true;
        await newPerm.Save();
      }
    }
  }

  // ── Account Deletion ────────────────────────────────────────────────

  public ConfirmDeleteAccount(account: MJFileStorageAccountEntity): void {
    this.AccountToDelete = account;
    this.cdr.markForCheck();
  }

  public CancelDeleteAccount(): void {
    this.AccountToDelete = null;
    this.cdr.markForCheck();
  }

  public async ExecuteDeleteAccount(): Promise<void> {
    if (!this.AccountToDelete) return;
    this.IsDeleting = true;
    this.cdr.markForCheck();

    try {
      const accountName = this.AccountToDelete.Name;
      const accountId = this.AccountToDelete.ID;

      // Delete associated permissions first
      const perms = this.AccountPermissions.filter((p) => UUIDsEqual(p.FileStorageAccountID, accountId));
      for (const p of perms) {
        await p.Delete();
      }

      const deleted = await this.AccountToDelete.Delete();
      if (!deleted) {
        throw new Error('Failed to delete storage account.');
      }

      await FileStorageEngineBase.Instance.Config(true);
      await this.LoadAllData();

      this.AccountToDelete = null;
      this.AccountsChanged.emit();
      this.notifications.CreateSimpleNotification(`Storage account "${accountName}" removed.`, 'info');
    } catch (err) {
      console.error('[StorageAdminDialogComponent] Delete error:', err);
      const msg = err instanceof Error ? err.message : 'Failed to delete storage account.';
      this.notifications.CreateSimpleNotification(msg, 'error');
    } finally {
      this.IsDeleting = false;
      this.cdr.markForCheck();
    }
  }

  // ── Provider Management ─────────────────────────────────────────────

  public async ToggleProviderActive(provider: MJFileStorageProviderEntity): Promise<void> {
    const newState = !provider.IsActive;
    provider.IsActive = newState;
    this.cdr.markForCheck();

    try {
      const saved = await provider.Save();
      if (!saved) {
        provider.IsActive = !newState; // rollback
        throw new Error(provider.LatestResult?.Message || 'Failed to update provider status.');
      }
      await FileStorageEngineBase.Instance.Config(true);
      this.AccountsChanged.emit();
      this.notifications.CreateSimpleNotification(
        `Provider "${provider.Name}" is now ${newState ? 'active' : 'inactive'}.`,
        'info'
      );
    } catch (err) {
      console.error('[StorageAdminDialogComponent] Provider toggle error:', err);
      this.notifications.CreateSimpleNotification('Failed to update provider status.', 'error');
    } finally {
      this.cdr.markForCheck();
    }
  }

  // ── UI Helpers ──────────────────────────────────────────────────────

  public GetProviderIcon(providerName: string): string {
    const name = (providerName || '').toLowerCase();
    if (name.includes('aws') || name.includes('s3')) return 'fa-brands fa-aws';
    if (name.includes('azure')) return 'fa-brands fa-microsoft';
    if (name.includes('google drive')) return 'fa-brands fa-google-drive';
    if (name.includes('google cloud')) return 'fa-brands fa-google';
    if (name.includes('dropbox')) return 'fa-brands fa-dropbox';
    if (name.includes('box')) return 'fa-solid fa-box';
    if (name.includes('sharepoint') || name.includes('onedrive')) return 'fa-brands fa-microsoft';
    return 'fa-solid fa-cloud';
  }

  public OnDialogClose(): void {
    this.Visible = false;
    this.IsEditingAccount = false;
    this.AccountToDelete = null;
    this.Close.emit();
  }
}
