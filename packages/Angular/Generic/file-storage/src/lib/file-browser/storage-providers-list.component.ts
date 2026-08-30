import { Component, EventEmitter, OnInit, Output, ChangeDetectorRef, inject } from '@angular/core';
import { FileStorageEngineBase, StorageAccountWithProvider, MJFileStorageAccountEntity } from '@memberjunction/core-entities';
import { Metadata, type IMetadataProvider } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { StorageAdminTab } from '../admin/storage-admin-dialog.component';

/**
 * Displays a list of organizational file storage accounts.
 * In the enterprise model, accounts are configured by administrators
 * and available to users based on permissions. Users no longer manage
 * their own OAuth connections - credentials are handled at the org level.
 */
@Component({
  standalone: false,
  selector: 'mj-storage-providers-list',
  templateUrl: './storage-providers-list.component.html',
  styleUrls: ['./storage-providers-list.component.css']
})
export class StorageProvidersListComponent implements OnInit {
  private cdr = inject(ChangeDetectorRef);

  /**
   * Emits when an account is selected by the user, or null when no accounts are available.
   * Emits the full account-with-provider object for downstream components to use.
   */
  @Output() accountSelected = new EventEmitter<StorageAccountWithProvider | null>();

  /**
   * All available storage accounts with their provider details.
   */
  public accounts: StorageAccountWithProvider[] = [];

  /**
   * Currently selected account.
   */
  public selectedAccount: StorageAccountWithProvider | null = null;

  /**
   * Loading state indicator.
   */
  public isLoading: boolean = false;

  /**
   * Error message if loading fails.
   */
  public errorMessage: string | null = null;

  /**
   * Whether current user has admin rights to configure storage accounts or providers.
   */
  public userCanManage: boolean = false;

  /**
   * Admin dialog state
   */
  public isManageDialogOpen: boolean = false;
  public adminDialogTab: StorageAdminTab = 'accounts';
  public accountToEdit: MJFileStorageAccountEntity | null = null;

  public Provider: IMetadataProvider | null = null;

  public get ProviderToUse(): IMetadataProvider {
    return this.Provider ?? Metadata.Provider;
  }

  constructor() {}

  ngOnInit(): void {
    if (!this.userCanManage) {
      this.checkPermissions();
    }
    this.loadAccounts();
  }

  /**
   * Checks if current user has create or update permissions on storage entities.
   */
  private checkPermissions(): void {
    try {
      const md = this.ProviderToUse;
      const user = md.CurrentUser;
      if (!user) {
        return;
      }

      const provEntity = md.Entities.find(e => e.Name === 'MJ: File Storage Providers');
      const acctEntity = md.Entities.find(e => e.Name === 'MJ: File Storage Accounts');

      const provCanManage = provEntity ? provEntity.GetUserPermisions(user).CanCreate || provEntity.GetUserPermisions(user).CanUpdate : false;
      const acctCanManage = acctEntity ? acctEntity.GetUserPermisions(user).CanCreate || acctEntity.GetUserPermisions(user).CanUpdate : false;

      this.userCanManage = !!(provCanManage || acctCanManage);
    } catch {
      this.userCanManage = false;
    }
  }

  /**
   * Loads all available file storage accounts with their provider details.
   * Uses FileStorageEngineBase for centralized, cached access.
   */
  private async loadAccounts(forceRefresh = false): Promise<void> {
    this.isLoading = true;
    this.errorMessage = null;

    try {
      const engine = FileStorageEngineBase.Instance;
      await engine.Config(forceRefresh);

      // Only show accounts whose provider is active
      this.accounts = engine.AccountsWithProviders.filter(a => a.provider.IsActive !== false);

      if (this.accounts.length === 0 && !forceRefresh) {
        await engine.Config(true);
        this.accounts = engine.AccountsWithProviders.filter(a => a.provider.IsActive !== false);
      }

      console.log('[StorageAccountsList] Loaded accounts:', this.accounts.map(a => ({
        name: a.account.Name,
        provider: a.provider.Name,
        hasCredential: !!a.account.CredentialID
      })));

      // Auto-select first account if available
      if (this.accounts.length > 0) {
        this.selectAccount(this.accounts[0]);
      } else {
        this.accountSelected.emit(null);
      }

    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Failed to load storage accounts';
      console.error('[StorageProvidersList] Error loading accounts:', error);
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Handles account selection by the user.
   */
  public selectAccount(accountWithProvider: StorageAccountWithProvider): void {
    this.selectedAccount = accountWithProvider;
    this.accountSelected.emit(accountWithProvider);
  }

  /**
   * Checks if an account is currently selected.
   */
  public isSelected(accountWithProvider: StorageAccountWithProvider): boolean {
    return UUIDsEqual(this.selectedAccount?.account.ID, accountWithProvider.account.ID);
  }

  /**
   * Gets the icon class for a provider based on its name.
   */
  public getProviderIcon(providerName: string): string {
    const name = providerName.toLowerCase();

    if (name.includes('aws') || name.includes('s3')) {
      return 'fa-brands fa-aws';
    } else if (name.includes('azure')) {
      return 'fa-brands fa-microsoft';
    } else if (name.includes('google drive')) {
      return 'fa-brands fa-google-drive';
    } else if (name.includes('google cloud')) {
      return 'fa-brands fa-google';
    } else if (name.includes('dropbox')) {
      return 'fa-brands fa-dropbox';
    } else if (name.includes('box')) {
      return 'fa-solid fa-box';
    } else if (name.includes('sharepoint') || name.includes('onedrive')) {
      return 'fa-brands fa-microsoft';
    } else {
      return 'fa-solid fa-cloud';
    }
  }

  /**
   * Refreshes the accounts list by forcing a reload from the database.
   */
  public refresh(): void {
    void this.loadAccounts(true);
  }

  /**
   * Opens the storage administration dialog
   */
  public openAdminDialog(tab: StorageAdminTab = 'accounts', account?: MJFileStorageAccountEntity | null): void {
    this.adminDialogTab = tab;
    this.accountToEdit = account ?? null;
    this.isManageDialogOpen = true;
    this.cdr.markForCheck();
  }

  /**
   * Closes the storage administration dialog
   */
  public closeAdminDialog(): void {
    this.isManageDialogOpen = false;
    this.accountToEdit = null;
    this.cdr.markForCheck();
  }

  /**
   * Handles storage configuration changes from the admin dialog
   */
  public onAdminAccountsChanged(): void {
    this.refresh();
  }

  /**
   * Handles inline edit click on an account item
   */
  public onEditAccountClick(item: StorageAccountWithProvider, event: MouseEvent): void {
    event.stopPropagation();
    this.openAdminDialog('accounts', item.account);
  }
}
