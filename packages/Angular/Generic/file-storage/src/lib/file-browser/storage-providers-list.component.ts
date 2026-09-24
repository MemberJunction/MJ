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
  @Output() AccountSelected = new EventEmitter<StorageAccountWithProvider | null>();

  /**
   * @deprecated Use {@link AccountSelected}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (accountSelected) keeps working. Must stay AFTER AccountSelected: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() accountSelected = this.AccountSelected;

  /**
   * All available storage accounts with their provider details.
   */
  public Accounts: StorageAccountWithProvider[] = [];

  /** @deprecated Use {@link Accounts}. */
  public get accounts(): StorageAccountWithProvider[] {
    return this.Accounts;
  }
  /** @deprecated Use {@link Accounts}. */
  public set accounts(value: StorageAccountWithProvider[]) {
    this.Accounts = value;
  }

  /**
   * Currently selected account.
   */
  public SelectedAccount: StorageAccountWithProvider | null = null;

  /** @deprecated Use {@link SelectedAccount}. */
  public get selectedAccount(): StorageAccountWithProvider | null {
    return this.SelectedAccount;
  }
  /** @deprecated Use {@link SelectedAccount}. */
  public set selectedAccount(value: StorageAccountWithProvider | null) {
    this.SelectedAccount = value;
  }

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
  public UserCanManage: boolean = false;

  /** @deprecated Use {@link UserCanManage}. */
  public get userCanManage(): boolean {
    return this.UserCanManage;
  }
  /** @deprecated Use {@link UserCanManage}. */
  public set userCanManage(value: boolean) {
    this.UserCanManage = value;
  }

  /**
   * Admin dialog state
   */
  public IsManageDialogOpen: boolean = false;

  /** @deprecated Use {@link IsManageDialogOpen}. */
  public get isManageDialogOpen(): boolean {
    return this.IsManageDialogOpen;
  }
  /** @deprecated Use {@link IsManageDialogOpen}. */
  public set isManageDialogOpen(value: boolean) {
    this.IsManageDialogOpen = value;
  }
  public AdminDialogTab: StorageAdminTab = 'accounts';

  /** @deprecated Use {@link AdminDialogTab}. */
  public get adminDialogTab(): StorageAdminTab {
    return this.AdminDialogTab;
  }
  /** @deprecated Use {@link AdminDialogTab}. */
  public set adminDialogTab(value: StorageAdminTab) {
    this.AdminDialogTab = value;
  }
  public AccountToEdit: MJFileStorageAccountEntity | null = null;

  /** @deprecated Use {@link AccountToEdit}. */
  public get accountToEdit(): MJFileStorageAccountEntity | null {
    return this.AccountToEdit;
  }
  /** @deprecated Use {@link AccountToEdit}. */
  public set accountToEdit(value: MJFileStorageAccountEntity | null) {
    this.AccountToEdit = value;
  }

  public Provider: IMetadataProvider | null = null;

  public get ProviderToUse(): IMetadataProvider {
    return this.Provider ?? Metadata.Provider;
  }

  constructor() {}

  ngOnInit(): void {
    if (!this.UserCanManage) {
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

      this.UserCanManage = !!(provCanManage || acctCanManage);
    } catch {
      this.UserCanManage = false;
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
      this.Accounts = engine.AccountsWithProviders.filter(a => a.provider.IsActive !== false);

      if (this.Accounts.length === 0 && !forceRefresh) {
        await engine.Config(true);
        this.Accounts = engine.AccountsWithProviders.filter(a => a.provider.IsActive !== false);
      }

      console.log('[StorageAccountsList] Loaded accounts:', this.Accounts.map(a => ({
        name: a.account.Name,
        provider: a.provider.Name,
        hasCredential: !!a.account.CredentialID
      })));

      // Auto-select first account if available
      if (this.Accounts.length > 0) {
        this.SelectAccount(this.Accounts[0]);
      } else {
        this.AccountSelected.emit(null);
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
  public SelectAccount(accountWithProvider: StorageAccountWithProvider): void {
    this.SelectedAccount = accountWithProvider;
    this.AccountSelected.emit(accountWithProvider);
  }

  /** @deprecated Use {@link SelectAccount}. */
  public selectAccount(accountWithProvider: StorageAccountWithProvider): void {
    return this.SelectAccount(accountWithProvider);
  }

  /**
   * Checks if an account is currently selected.
   */
  public IsSelected(accountWithProvider: StorageAccountWithProvider): boolean {
    return UUIDsEqual(this.SelectedAccount?.account.ID, accountWithProvider.account.ID);
  }

  /** @deprecated Use {@link IsSelected}. */
  public isSelected(accountWithProvider: StorageAccountWithProvider): boolean {
    return this.IsSelected(accountWithProvider);
  }

  /**
   * Gets the icon class for a provider based on its name.
   */
  public GetProviderIcon(providerName: string): string {
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

  /** @deprecated Use {@link GetProviderIcon}. */
  public getProviderIcon(providerName: string): string {
    return this.GetProviderIcon(providerName);
  }

  /**
   * Refreshes the accounts list by forcing a reload from the database.
   */
  public Refresh(): void {
    void this.loadAccounts(true);
  }

  /** @deprecated Use {@link Refresh}. */
  public refresh(): void {
    return this.Refresh();
  }

  /**
   * Opens the storage administration dialog
   */
  public OpenAdminDialog(tab: StorageAdminTab = 'accounts', account?: MJFileStorageAccountEntity | null): void {
    this.AdminDialogTab = tab;
    this.AccountToEdit = account ?? null;
    this.IsManageDialogOpen = true;
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link OpenAdminDialog}. */
  public openAdminDialog(tab: StorageAdminTab = 'accounts', account?: MJFileStorageAccountEntity | null): void {
    return this.OpenAdminDialog(tab, account);
  }

  /**
   * Closes the storage administration dialog
   */
  public CloseAdminDialog(): void {
    this.IsManageDialogOpen = false;
    this.AccountToEdit = null;
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link CloseAdminDialog}. */
  public closeAdminDialog(): void {
    return this.CloseAdminDialog();
  }

  /**
   * Handles storage configuration changes from the admin dialog
   */
  public OnAdminAccountsChanged(): void {
    this.Refresh();
  }

  /** @deprecated Use {@link OnAdminAccountsChanged}. */
  public onAdminAccountsChanged(): void {
    return this.OnAdminAccountsChanged();
  }

  /**
   * Handles inline edit click on an account item
   */
  public OnEditAccountClick(item: StorageAccountWithProvider, event: MouseEvent): void {
    event.stopPropagation();
    this.OpenAdminDialog('accounts', item.account);
  }

  /** @deprecated Use {@link OnEditAccountClick}. */
  public onEditAccountClick(item: StorageAccountWithProvider, event: MouseEvent): void {
    return this.OnEditAccountClick(item, event);
  }
}
