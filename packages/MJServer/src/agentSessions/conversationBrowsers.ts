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
import { UUIDsEqual } from '@memberjunction/global';
import { RemoteBrowserEngine } from '@memberjunction/remote-browser-server';

/** How often idle conversation browsers are looked for. */
const REAP_INTERVAL_MS = 60_000;

interface HeldBrowser {
  UserID: string;
  LastUsedAt: number;
  IdleMs: number;
}

export class ConversationBrowserLedger {
  private readonly held = new Map<string, HeldBrowser>();
  private reapTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly now: () => number = Date.now) {}

  /**
   * Records that a conversation's browser is about to be used. A conversation the ledger does not hold
   * yet counts against its owner's cap.
   *
   * @throws when the owner already holds `maxPerUser` conversation browsers.
   */
  public Claim(conversationID: string, userID: string, maxPerUser: number, idleMinutes: number): void {
    const key = conversationID.toLowerCase();
    if (!this.held.has(key)) {
      const count = Array.from(this.held.values()).filter((b) => UUIDsEqual(b.UserID, userID)).length;
      if (count >= maxPerUser) {
        throw new Error(`You already have ${count} conversation browser(s) open, the most this server allows. Close one first.`);
      }
    }
    this.held.set(key, { UserID: userID, LastUsedAt: this.now(), IdleMs: idleMinutes * 60_000 });
    this.startReaper();
  }

  /** Marks a held browser as used (an action, a snapshot poll, human input), which puts off its idle end. */
  public Touch(conversationID: string): void {
    const browser = this.held.get(conversationID.toLowerCase());
    if (browser) {
      browser.LastUsedAt = this.now();
    }
  }

  /** Forgets a conversation's browser once it has been ended. */
  public Release(conversationID: string): void {
    this.held.delete(conversationID.toLowerCase());
  }

  /** Ends every held browser unused for longer than its idle limit. Returns how many were ended. */
  public async ReapIdle(): Promise<number> {
    const now = this.now();
    const idle = Array.from(this.held).filter(([, b]) => now - b.LastUsedAt > b.IdleMs).map(([id]) => id);
    for (const conversationID of idle) {
      this.held.delete(conversationID);
      try {
        await RemoteBrowserEngine.Instance.EndSessionForAgentSession(conversationID);
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

/** The process's ledger. */
export const ConversationBrowsers = new ConversationBrowserLedger();
