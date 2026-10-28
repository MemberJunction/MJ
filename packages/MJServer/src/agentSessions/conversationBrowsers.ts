/**
 * @fileoverview The remote browsers this process holds for TEXT conversations: who owns each and when it
 * was last used. Backs the per-user cap (`realtime.conversationBrowser.maxPerUser`) and ends browsers
 * nobody uses any more, since a reloaded or closed tab never ends its own
 * (`realtime.conversationBrowser.idleMinutes`). Realtime calls' browsers are not tracked here: they end
 * with their session.
 *
 * @module @memberjunction/server/agentSessions
 */
import { LogError, LogStatus } from '@memberjunction/core';
import { BaseSingleton } from '@memberjunction/global';
import { RemoteBrowserEngine } from '@memberjunction/remote-browser-server';

/** How often idle conversation browsers are looked for. */
const REAP_INTERVAL_MS = 60_000;

/** A user (or, for an anonymous guest, a scope) already holds the most conversation browsers allowed. */
export class ConversationBrowserLimitError extends Error {
  constructor(count: number) {
    super(`You already have ${count} conversation browser(s) open, the most this server allows. Close one first.`);
    this.name = 'ConversationBrowserLimitError';
  }
}

interface HeldBrowser {
  OwnerKey: string;
  LastUsedAt: number;
  IdleMs: number;
}

export class ConversationBrowserLedger extends BaseSingleton<ConversationBrowserLedger> {
  private readonly held = new Map<string, HeldBrowser>();
  private reapTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * How an idle browser is ended. The resolver points this at its own end path, so a reaped browser
   * leaves no stream bookkeeping behind; until then the engine ends it directly.
   */
  public EndBrowser: (conversationID: string) => Promise<unknown> = (conversationID) =>
    RemoteBrowserEngine.Instance.EndSessionForAgentSession(conversationID);

  /** The clock (a seam for tests). */
  public Now: () => number = () => Date.now();

  protected constructor() {
    super();
  }

  public static get Instance(): ConversationBrowserLedger {
    return super.getInstance<ConversationBrowserLedger>();
  }

  /**
   * Records that a conversation's browser is about to be used. A conversation the ledger does not hold
   * yet counts against its owner's cap. `ownerKey` is who the cap counts: a user, or for an anonymous
   * guest (who all share one Anonymous user) the guest's own scope.
   *
   * @throws ConversationBrowserLimitError when the owner already holds `maxPerUser` conversation browsers.
   */
  public Claim(conversationID: string, ownerKey: string, maxPerUser: number, idleMinutes: number): void {
    const key = conversationID.toLowerCase();
    if (!this.held.has(key)) {
      const count = Array.from(this.held.values()).filter((b) => b.OwnerKey === ownerKey).length;
      if (count >= maxPerUser) {
        throw new ConversationBrowserLimitError(count);
      }
    }
    this.held.set(key, { OwnerKey: ownerKey, LastUsedAt: this.Now(), IdleMs: idleMinutes * 60_000 });
    this.startReaper();
  }

  /** Marks a held browser as used (an action, a snapshot poll, human input), which puts off its idle end. */
  public Touch(conversationID: string): void {
    const browser = this.held.get(conversationID.toLowerCase());
    if (browser) {
      browser.LastUsedAt = this.Now();
    }
  }

  /** Forgets a conversation's browser once it has been ended. */
  public Release(conversationID: string): void {
    this.held.delete(conversationID.toLowerCase());
  }

  /** Ends every held browser unused for longer than its idle limit. Returns how many were ended. */
  public async ReapIdle(): Promise<number> {
    const now = this.Now();
    const idle = Array.from(this.held).filter(([, b]) => now - b.LastUsedAt > b.IdleMs).map(([id]) => id);
    for (const conversationID of idle) {
      this.held.delete(conversationID);
      try {
        await this.EndBrowser(conversationID);
      } catch (err) {
        LogError(`[ConversationBrowsers] Failed to end the idle browser of conversation ${conversationID}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (idle.length > 0) {
      LogStatus(`[ConversationBrowsers] Ended ${idle.length} idle conversation browser(s).`);
    }
    return idle.length;
  }

  /** One unref'd timer per process, started with the first browser, so the reaper costs nothing until then. */
  private startReaper(): void {
    if (this.reapTimer) {
      return;
    }
    this.reapTimer = setInterval(() => void this.ReapIdle(), REAP_INTERVAL_MS);
    this.reapTimer.unref?.();
  }
}
