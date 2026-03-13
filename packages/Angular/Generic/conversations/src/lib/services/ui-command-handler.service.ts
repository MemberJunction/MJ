import { Injectable, EventEmitter } from '@angular/core';
import { ActionableCommand, AutomaticCommand, RefreshDataCommand, OpenURLCommand } from '@memberjunction/ai-core-plus';
import { DataCacheService } from './data-cache.service';

/**
 * Service for handling UI commands from agents.
 *
 * Generic commands (open:url) are handled directly by this service.
 * App-specific commands (open:resource) are emitted for the host application to handle.
 */
@Injectable({
  providedIn: 'root'
})
export class UICommandHandlerService {
  /**
   * Event emitted when an actionable command requires host-app handling.
   * Currently only open:resource commands are emitted — open:url is handled directly.
   */
  public actionableCommandRequested = new EventEmitter<ActionableCommand>();

  /**
   * Event emitted when an automatic command should be executed
   * Host application should subscribe to this and handle the command appropriately
   */
  public automaticCommandRequested = new EventEmitter<AutomaticCommand>();

  constructor(
    private dataCacheService: DataCacheService
  ) {}

  /**
   * Execute an actionable command (triggered by user clicking a button).
   * Generic commands like open:url are handled directly; others are emitted to the host.
   */
  public async executeActionableCommand(command: ActionableCommand): Promise<void> {
    if (command.type === 'open:url') {
      this.handleOpenUrl(command);
    } else {
      // open:resource requires app-specific navigation — emit for host to handle
      console.log('📤 Emitting actionable command for host app:', command);
      this.actionableCommandRequested.emit(command);
    }
  }

  /**
   * Handle open:url commands directly by opening the URL in a browser tab.
   * Data URIs are converted to Blob URLs because Chrome blocks window.open with data: URIs.
   */
  private handleOpenUrl(command: OpenURLCommand): void {
    const url = command.url;
    const newTab = command.newTab !== false;

    if (url.startsWith('data:')) {
      this.openDataUri(url);
    } else {
      const target = newTab ? '_blank' : '_self';
      window.open(url, target, target === '_blank' ? 'noopener,noreferrer' : undefined);
    }
  }

  /**
   * Open a data URI by converting it to a Blob URL.
   * Chrome blocks window.open('data:...') for security, so we create a Blob URL instead.
   */
  private openDataUri(dataUri: string): void {
    const [header, base64Data] = dataUri.split(',');
    const mimeMatch = header.match(/data:([^;]+)/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'application/octet-stream';

    const byteString = atob(base64Data);
    const byteArray = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) {
      byteArray[i] = byteString.charCodeAt(i);
    }

    const blob = new Blob([byteArray], { type: mimeType });
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, '_blank');
  }

  /**
   * Execute an automatic command (runs immediately without user interaction)
   * Special handling: refresh:data commands execute locally, others emit to host
   */
  public async executeAutomaticCommand(command: AutomaticCommand): Promise<void> {
    console.log('Executing automatic command:', command);

    if (command.type === 'refresh:data') {
      // Handle data refresh locally as it's a generic operation
      await this.handleRefreshData(command);
    } else {
      // Emit other automatic commands (like notifications) for host to handle
      console.log('📤 Emitting automatic command for host app:', command);
      this.automaticCommandRequested.emit(command);
    }
  }

  /**
   * Execute all automatic commands from an agent result
   */
  public async executeAutomaticCommands(commands: AutomaticCommand[]): Promise<void> {
    if (!commands || commands.length === 0) {
      return;
    }

    for (const command of commands) {
      try {
        await this.executeAutomaticCommand(command);
      } catch (error) {
        console.error('Error executing automatic command:', command, error);
      }
    }
  }

  /**
   * Handle refreshing data (entity data or caches)
   * This is handled locally as it's a generic operation that doesn't require host app knowledge
   */
  private async handleRefreshData(command: RefreshDataCommand): Promise<void> {
    const { scope, entityNames, cacheName } = command;

    if (scope === 'entity' && entityNames && entityNames.length > 0) {
      // Refresh specific entity data
      for (const entityName of entityNames) {
        await this.dataCacheService.refreshEntity(entityName);
      }
      console.log('Refreshed entity data:', entityNames);
    } else if (scope === 'cache' && cacheName) {
      // Refresh a specific cache
      await this.dataCacheService.refreshCache(cacheName);
      console.log('Refreshed cache:', cacheName);
    } else {
      console.warn('Invalid refresh:data command parameters:', command);
    }
  }
}
