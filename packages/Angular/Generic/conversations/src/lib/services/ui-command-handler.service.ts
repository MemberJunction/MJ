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
  /**
   * Set only on the compose:email over-length fallback: whether the draft body is now on the
   * user's clipboard. The copy overwrites whatever the user had copied, so the host must say it
   * happened, and must not claim it when this is false (no body, clipboard unavailable over plain
   * HTTP, or denied by permissions policy).
   */
  DraftCopiedToClipboard?: boolean;
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
   * within the limit is handled here and never reaches the host. On that fallback the host also
   * owns telling the user why their mail client did not open, because only the host knows whether
   * a draft artifact opened (see {@link ActionableCommandRequest.DraftCopiedToClipboard}).
   * open:url is always handled here.
   */
  public ActionableCommandRequested = new EventEmitter<ActionableCommandRequest>();

  /** @deprecated Use {@link ActionableCommandRequested}. */
  public get actionableCommandRequested() {
    return this.ActionableCommandRequested;
  }
  /** @deprecated Use {@link ActionableCommandRequested}. */
  public set actionableCommandRequested(value) {
    this.ActionableCommandRequested = value;
  }

  /**
   * Event emitted when an automatic command should be executed
   * Host application should subscribe to this and handle the command appropriately
   */
  public AutomaticCommandRequested = new EventEmitter<AutomaticCommand>();

  /** @deprecated Use {@link AutomaticCommandRequested}. */
  public get automaticCommandRequested() {
    return this.AutomaticCommandRequested;
  }
  /** @deprecated Use {@link AutomaticCommandRequested}. */
  public set automaticCommandRequested(value) {
    this.AutomaticCommandRequested = value;
  }

  constructor(
    private dataCacheService: DataCacheService
  ) {}

  /**
   * Execute an actionable command (triggered by user clicking a button).
   * Generic commands like open:url are handled directly; others are emitted to the host.
   */
  public async ExecuteActionableCommand(command: ActionableCommand, origin?: Omit<ActionableCommandRequest, 'command'>): Promise<void> {
    if (command.type === 'open:url') {
      this.handleOpenUrl(command);
      return;
    }

    const request: ActionableCommandRequest = {
      command,
      conversationId: origin?.conversationId ?? null,
      conversationDetailId: origin?.conversationDetailId ?? null
    };

    if (command.type === 'compose:email') {
      const { url, withinLimit } = BuildMailtoURL(command);
      if (withinLimit) {
        this.openMailto(url);
        return;
      }
      // Too long for a mailto: URL. We do NOT open it: a mail client past its limit does not
      // refuse the URL, it opens a draft with the body SILENTLY TRUNCATED and the user sends half
      // a message without noticing. Falls through to the host, which opens the full draft
      // artifact and tells the user what happened.
      request.DraftCopiedToClipboard = await this.copyDraftBody(command);
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
    this.ActionableCommandRequested.emit(request);
  }

  /** @deprecated Use {@link ExecuteActionableCommand}. */
  public async executeActionableCommand(command: ActionableCommand, origin?: Omit<ActionableCommandRequest, 'command'>): Promise<void> {
    return this.ExecuteActionableCommand(command, origin);
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
   * Best-effort copy of an over-length draft's body, so the text is not lost even when the host
   * cannot open the draft artifact.
   *
   * Never rejects, so a clipboard that is unavailable (plain HTTP) or denied by permissions policy
   * cannot stop the fallback. Nothing on the click path awaits before writeText is called, so it
   * still runs inside the click's user activation; the fallback then awaits the outcome only so
   * the host's notice can say whether the copy happened.
   *
   * @returns true only when the body is on the clipboard, so the host never claims a copy that
   *          did not happen.
   */
  private async copyDraftBody(command: ComposeEmailCommand): Promise<boolean> {
    if (!command.body || !navigator.clipboard) {
      return false;
    }
    try {
      await navigator.clipboard.writeText(command.body);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Open the user's own mail client with a compose:email draft's fields pre-filled, via a
   * synthesized anchor click.
   *
   * NOTHING IS SENT HERE. The agent drafted; the user sends. This only opens a compose window.
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
  public async ExecuteAutomaticCommand(command: AutomaticCommand): Promise<void> {
    console.log('Executing automatic command:', command);

    if (command.type === 'refresh:data') {
      // Handle data refresh locally as it's a generic operation
      await this.handleRefreshData(command);
    } else {
      // Emit other automatic commands (like notifications) for host to handle
      console.log('📤 Emitting automatic command for host app:', command);
      this.AutomaticCommandRequested.emit(command);
    }
  }

  /** @deprecated Use {@link ExecuteAutomaticCommand}. */
  public async executeAutomaticCommand(command: AutomaticCommand): Promise<void> {
    return this.ExecuteAutomaticCommand(command);
  }

  /**
   * Execute all automatic commands from an agent result
   */
  public async ExecuteAutomaticCommands(commands: AutomaticCommand[]): Promise<void> {
    if (!commands || commands.length === 0) {
      return;
    }

    for (const command of commands) {
      try {
        await this.ExecuteAutomaticCommand(command);
      } catch (error) {
        console.error('Error executing automatic command:', command, error);
      }
    }
  }

  /** @deprecated Use {@link ExecuteAutomaticCommands}. */
  public async executeAutomaticCommands(commands: AutomaticCommand[]): Promise<void> {
    return this.ExecuteAutomaticCommands(commands);
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
