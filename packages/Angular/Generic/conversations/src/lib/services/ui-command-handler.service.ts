import { Injectable, EventEmitter } from '@angular/core';
import { ActionableCommand, AutomaticCommand, RefreshDataCommand } from '@memberjunction/ai-core-plus';
import { DataCacheService } from './data-cache.service';

/**
 * Service for handling UI commands from agents
 * Emits events for commands to be handled by the host application
 * This allows the generic conversations package to remain app-agnostic
 */
@Injectable({
  providedIn: 'root'
})
export class UICommandHandlerService {
  /**
   * Event emitted when an actionable command should be executed
   * Host application should subscribe to this and handle the command appropriately
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
   * Execute an actionable command (triggered by user clicking a button)
   * Emits the command for the host application to handle
   */
  public async executeActionableCommand(command: ActionableCommand): Promise<void> {
    console.log('📤 Emitting actionable command for host app:', command);
    this.actionableCommandRequested.emit(command);
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
