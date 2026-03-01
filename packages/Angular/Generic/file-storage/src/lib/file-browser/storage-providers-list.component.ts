import { Component, EventEmitter, OnInit, Output, ChangeDetectorRef } from '@angular/core';
import { FileStorageEngine, StorageAccountWithProvider } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';

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
   * Uses FileStorageEngine for centralized, cached access.
   */
  private async loadAccounts(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = null;

    try {
      const engine = FileStorageEngine.Instance;
      await engine.Config(false);  // Use cached data if available

      this.accounts = engine.AccountsWithProviders;

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
    return UUIDsEqual(this.selectedAccount?.account.ID, accountWithProvider.account.ID)
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
    FileStorageEngine.Instance.Config(true).then(() => this.loadAccounts());
  }
}
