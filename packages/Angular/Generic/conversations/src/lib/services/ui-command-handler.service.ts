import { Injectable, EventEmitter } from '@angular/core';
import {
  ActionableCommand,
  AutomaticCommand,
  RefreshDataCommand,
  OpenURLCommand,
  ComposeEmailCommand,
  BuildMailtoURL
} from '@memberjunction/ai-core-plus';
import { DataCacheService } from './data-cache.service';

export interface ActionableCommandRequest {
  command: ActionableCommand;
  conversationId?: string | null;
  conversationDetailId?: string | null;
}

/**
 * Service for handling UI commands from agents.
 *
 * Generic commands (open:url, and compose:email while it fits in a mailto: URL) are handled
 * directly by this service. App-specific commands (open:resource, and the compose:email
 * over-length fallback) are emitted for the host application to handle.
 */
@Injectable({
  providedIn: 'root'
})
export class UICommandHandlerService {
  /**
   * Event emitted when an actionable command requires host-app handling.
   *
   * open:resource is always emitted. compose:email is emitted ONLY as a fallback, when the draft
   * is too long for a mailto: URL and the host must open the draft artifact instead; a draft
   * within the limit is handled here and never reaches the host. open:url is always handled here.
   */
  public actionableCommandRequested = new EventEmitter<ActionableCommandRequest>();

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
  public async executeActionableCommand(command: ActionableCommand, origin?: Omit<ActionableCommandRequest, 'command'>): Promise<void> {
    if (command.type === 'open:url') {
      this.handleOpenUrl(command);
      return;
    }

    if (command.type === 'compose:email') {
      const openedMailClient = this.handleComposeEmail(command);
      if (openedMailClient) {
        return;
      }
      // Too long for a mailto: URL. Deliberately falls through to the host, which opens the full
      // Email Draft artifact instead of opening a truncated compose window.
    }

    // open:resource (and the compose:email fallback above) require app-specific navigation.
    // compose:email is logged by TYPE ONLY: its body is free-text member correspondence, and the
    // whole command object would otherwise land in the browser console and any console-forwarding
    // telemetry.
    if (command.type === 'compose:email') {
      console.log('📤 Emitting actionable command for host app:', command.type);
    } else {
      console.log('📤 Emitting actionable command for host app:', command);
    }
    this.actionableCommandRequested.emit({
      command,
      conversationId: origin?.conversationId ?? null,
      conversationDetailId: origin?.conversationDetailId ?? null
    });
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
   * Handle compose:email by opening the user's own mail client with the fields pre-filled.
   *
   * NOTHING IS SENT HERE. The agent drafted; the user sends. This only opens a compose window.
   *
   * @returns true when the mail client was opened; false when the draft is too long for a
   *          mailto: URL, in which case the caller must fall back to the host (which opens the
   *          artifact). We do NOT open an over-long URL: a mail client past its limit does not
   *          refuse it, it opens a draft with the body SILENTLY TRUNCATED and the user sends half
   *          a message without noticing.
   */
  private handleComposeEmail(command: ComposeEmailCommand): boolean {
    const { url, withinLimit } = BuildMailtoURL(command);
    if (!withinLimit) {
      // Best-effort convenience so the text is not lost. Unavailable over plain HTTP and deniable
      // by permissions policy, so it must never gate the fallback.
      if (command.body) {
        navigator.clipboard?.writeText(command.body).catch(() => {
          /* clipboard unavailable — the artifact still carries the full draft */
        });
      }
      return false;
    }
    this.openMailto(url);
    return true;
  }

  /**
   * Open a mailto: URL via a synthesized anchor click.
   *
   * Deliberately not window.open: Chrome treats window.open with a non-http scheme as a popup and
   * strands an about:blank tab behind the compose window.
   */
  private openMailto(url: string): void {
    const a = document.createElement('a');
    a.href = url;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
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
