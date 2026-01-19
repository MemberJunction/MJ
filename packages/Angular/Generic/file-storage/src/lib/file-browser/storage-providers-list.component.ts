import { Component, EventEmitter, OnInit, Output, ChangeDetectorRef } from '@angular/core';
import { RunView } from '@memberjunction/core';
import { FileStorageAccountEntity, FileStorageProviderEntity } from '@memberjunction/core-entities';

/**
 * Storage account with its associated provider details for display.
 * In the enterprise model, accounts are organizational resources that link
 * to a provider type and credentials managed at the admin level.
 */
export interface StorageAccountWithProvider {
  /** The FileStorageAccount entity */
  account: FileStorageAccountEntity;
  /** The associated FileStorageProvider entity (for icon, name, capabilities) */
  provider: FileStorageProviderEntity;
}

/**
 * Displays a list of organizational file storage accounts.
 * In the enterprise model, accounts are configured by administrators
 * and available to users based on permissions. Users no longer manage
 * their own OAuth connections - credentials are handled at the org level.
 */
@Component({
  selector: 'mj-storage-providers-list',
  templateUrl: './storage-providers-list.component.html',
  styleUrls: ['./storage-providers-list.component.css']
})
export class StorageProvidersListComponent implements OnInit {
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

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.loadAccounts();
  }

  /**
   * Loads all available file storage accounts with their provider details.
   * Uses RunViews for efficient batch loading.
   */
  private async loadAccounts(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = null;

    try {
      const rv = new RunView();

      // Load accounts and providers in parallel using RunViews
      const [accountsResult, providersResult] = await rv.RunViews([
        {
          EntityName: 'MJ: File Storage Accounts',
          ExtraFilter: '',
          OrderBy: 'Name ASC',
          ResultType: 'entity_object'
        },
        {
          EntityName: 'File Storage Providers',
          ExtraFilter: 'IsActive = 1',
          OrderBy: 'Name ASC',
          ResultType: 'entity_object'
        }
      ]);

      if (!accountsResult.Success) {
        throw new Error(accountsResult.ErrorMessage || 'Failed to load storage accounts');
      }

      if (!providersResult.Success) {
        throw new Error(providersResult.ErrorMessage || 'Failed to load storage providers');
      }

      const accountEntities = accountsResult.Results as FileStorageAccountEntity[];
      const providerEntities = providersResult.Results as FileStorageProviderEntity[];

      // Create a map for quick provider lookup
      const providerMap = new Map<string, FileStorageProviderEntity>();
      providerEntities.forEach(p => providerMap.set(p.ID, p));

      // Combine accounts with their providers
      this.accounts = accountEntities
        .map(account => {
          const provider = providerMap.get(account.ProviderID);
          if (!provider) {
            console.warn(`Provider not found for account "${account.Name}" (ProviderID: ${account.ProviderID})`);
            return null;
          }
          return { account, provider };
        })
        .filter((item): item is StorageAccountWithProvider => item !== null);

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
      this.errorMessage = 'An error occurred while loading storage accounts';
      console.error('Exception loading storage accounts:', error);
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
    return this.selectedAccount?.account.ID === accountWithProvider.account.ID;
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
   * Refreshes the accounts list.
   */
  public refresh(): void {
    this.loadAccounts();
  }
}
