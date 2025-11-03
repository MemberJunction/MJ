import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { ActionableCommand, AutomaticCommand, RefreshDataCommand, ShowNotificationCommand } from '@memberjunction/ai-core-plus';
import { NotificationService } from './notification.service';
import { DataCacheService } from './data-cache.service';

/**
 * Service for handling UI commands from agents
 * Executes both actionable (user-triggered) and automatic (immediate) commands
 */
@Injectable({
  providedIn: 'root'
})
export class UICommandHandlerService {
  constructor(
    private router: Router,
    private notificationService: NotificationService,
    private dataCacheService: DataCacheService
  ) {}

  /**
   * Execute an actionable command (triggered by user clicking a button)
   */
  public async executeActionableCommand(command: ActionableCommand): Promise<void> {
    console.log('Executing actionable command:', command);

    switch (command.type) {
      case 'open:resource':
        await this.handleOpenResource(command);
        break;

      case 'open:url':
        this.handleOpenURL(command);
        break;

      default:
        console.warn('Unknown actionable command type:', (command as any).type);
    }
  }

  /**
   * Execute an automatic command (runs immediately without user interaction)
   */
  public async executeAutomaticCommand(command: AutomaticCommand): Promise<void> {
    console.log('Executing automatic command:', command);

    switch (command.type) {
      case 'refresh:data':
        await this.handleRefreshData(command);
        break;

      case 'notification':
        this.handleShowNotification(command);
        break;

      default:
        console.warn('Unknown automatic command type:', (command as any).type);
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
   * Handle opening a resource (record, dashboard, report, form, view)
   */
  private async handleOpenResource(command: ActionableCommand): Promise<void> {
    if (command.type !== 'open:resource') return;

    const { resourceType, resourceId, mode, parameters } = command;

    // Build route based on resource type
    let route: string;
    const queryParams: Record<string, any> = { ...parameters };

    switch (resourceType) {
      case 'Record':
        route = `/record/${resourceId}`;
        if (mode) {
          queryParams['mode'] = mode;
        }
        break;

      case 'Dashboard':
        route = `/dashboard/${resourceId}`;
        break;

      case 'Report':
        route = `/report/${resourceId}`;
        break;

      case 'Form':
        route = `/form/${resourceId}`;
        if (mode) {
          queryParams['mode'] = mode;
        }
        break;

      case 'View':
        route = `/view/${resourceId}`;
        break;

      default:
        console.warn('Unknown resource type:', resourceType);
        return;
    }

    // Navigate to the resource
    await this.router.navigate([route], { queryParams });
  }

  /**
   * Handle opening a URL in a new tab
   */
  private handleOpenURL(command: ActionableCommand): void {
    if (command.type !== 'open:url') return;

    const { url, openInNewTab } = command;

    if (openInNewTab !== false) {
      // Open in new tab (default behavior)
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      // Navigate in current window
      window.location.href = url;
    }
  }

  /**
   * Handle refreshing data (entity data or caches)
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

  /**
   * Handle showing a notification to the user
   */
  private handleShowNotification(command: ShowNotificationCommand): void {
    const { message, severity, duration } = command;

    this.notificationService.show({
      content: message,
      type: this.mapSeverityToType(severity || 'info'),
      hideAfter: duration || 5000
    });
  }

  /**
   * Map notification severity to Kendo notification type
   */
  private mapSeverityToType(severity: 'success' | 'info' | 'warning' | 'error'): 'success' | 'info' | 'warning' | 'error' {
    return severity;
  }
}
