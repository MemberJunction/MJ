import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { RunView } from '@memberjunction/core';
import { FileStorageProviderEntity } from '@memberjunction/core-entities';

/**
 * Connection status for a storage provider
 */
export interface ProviderStatus {
  providerID: string;
  isConnected: boolean;
  isChecking: boolean;
  errorMessage?: string;
}

/**
 * Displays a list of configured storage providers for selection.
 * Loads all active FileStorageProvider entities and shows connection status.
 */
@Component({
  selector: 'mj-storage-providers-list',
  templateUrl: './storage-providers-list.component.html',
  styleUrls: ['./storage-providers-list.component.css']
})
export class StorageProvidersListComponent implements OnInit {
  /**
   * Emits when a provider is selected by the user.
   */
  @Output() providerSelected = new EventEmitter<FileStorageProviderEntity>();

  /**
   * List of all active storage providers.
   */
  public providers: FileStorageProviderEntity[] = [];

  /**
   * Currently selected provider.
   */
  public selectedProvider: FileStorageProviderEntity | null = null;

  /**
   * Loading state indicator.
   */
  public isLoading: boolean = false;

  /**
   * Error message if loading fails.
   */
  public errorMessage: string | null = null;

  /**
   * Connection status for each provider
   */
  public providerStatuses: Map<string, ProviderStatus> = new Map();

  constructor() {}

  ngOnInit(): void {
    this.loadProviders();
  }

  /**
   * Loads all active storage providers from the database.
   * Orders by Priority (ascending) so higher priority providers appear first.
   */
  private async loadProviders(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = null;

    try {
      const rv = new RunView();
      const result = await rv.RunView<FileStorageProviderEntity>({
        EntityName: 'File Storage Providers',
        ExtraFilter: 'IsActive=1',
        OrderBy: 'Priority ASC, Name ASC',
        ResultType: 'entity_object'
      });

      if (result.Success) {
        this.providers = result.Results || [];

        // Initialize status for each provider
        this.providers.forEach(provider => {
          this.providerStatuses.set(provider.ID, {
            providerID: provider.ID,
            isConnected: false,
            isChecking: false
          });
        });

        // Auto-select the first provider if available
        if (this.providers.length > 0) {
          this.selectProvider(this.providers[0]);
        }

        // Check connection status for all providers
        this.checkAllProviderConnections();
      } else {
        this.errorMessage = result.ErrorMessage || 'Failed to load storage providers';
        console.error('Error loading storage providers:', result.ErrorMessage);
      }
    } catch (error) {
      this.errorMessage = 'An error occurred while loading storage providers';
      console.error('Exception loading storage providers:', error);
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Checks connection status for all providers.
   * For now, assumes all active providers are connected.
   * TODO: Implement actual connection testing via GraphQL API.
   */
  private async checkAllProviderConnections(): Promise<void> {
    for (const provider of this.providers) {
      const status = this.providerStatuses.get(provider.ID);
      if (status) {
        status.isChecking = true;
      }

      // TODO: Call GraphQL API to test provider connection
      // For now, assume all active providers are connected
      await new Promise(resolve => setTimeout(resolve, 100));

      if (status) {
        status.isChecking = false;
        status.isConnected = true; // Assume connected for now
      }
    }
  }

  /**
   * Gets the connection status for a provider.
   *
   * @param provider - The provider to get status for
   * @returns The provider status object
   */
  public getProviderStatus(provider: FileStorageProviderEntity): ProviderStatus {
    return this.providerStatuses.get(provider.ID) || {
      providerID: provider.ID,
      isConnected: false,
      isChecking: false
    };
  }

  /**
   * Handles provider selection.
   *
   * @param provider - The provider that was clicked
   */
  public selectProvider(provider: FileStorageProviderEntity): void {
    this.selectedProvider = provider;
    this.providerSelected.emit(provider);
  }

  /**
   * Checks if a provider is currently selected.
   *
   * @param provider - The provider to check
   * @returns True if this provider is selected
   */
  public isSelected(provider: FileStorageProviderEntity): boolean {
    return this.selectedProvider?.ID === provider.ID;
  }

  /**
   * Gets the icon class for a provider based on its name.
   * Maps common provider names to appropriate Font Awesome icons.
   *
   * @param provider - The provider entity
   * @returns Font Awesome icon class
   */
  public getProviderIcon(provider: FileStorageProviderEntity): string {
    const name = provider.Name.toLowerCase();

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
}
