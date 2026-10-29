/**
 * @fileoverview The remote browsers this process holds for TEXT conversations: who owns each and when it
 * was last used. Backs the caps (`realtime.conversationBrowser.maxPerUser` and `maxAnonymousTotal`) and ends browsers
 * nobody uses any more, since a reloaded or closed tab never ends its own
 * (`realtime.conversationBrowser.idleMinutes`). Realtime calls' browsers are not tracked here: they end
 * with their session.
 *
 * @module @memberjunction/server/agentSessions
 */
import { GraphQLError } from 'graphql';
import { LogError, LogStatus } from '@memberjunction/core';
import { BaseSingleton, IShutdownable, ShutdownRegistry } from '@memberjunction/global';
import { RemoteBrowserEngine } from '@memberjunction/remote-browser-server';
import type { ConversationBrowserConfig } from '../config.js';

/** How often idle conversation browsers are looked for. */
const REAP_INTERVAL_MS = 60_000;

/** The `extensions.code` of a {@link RemoteBrowserRefusedError}, which a client reads to stop asking. */
export const REMOTE_BROWSER_REFUSED = 'REMOTE_BROWSER_REFUSED';

/**
 * A remote-browser request this server refuses however often it is asked: browsers not enabled, a session
 * that is not the caller's or does not exist, or a cap reached.
 */
export class RemoteBrowserRefusedError extends GraphQLError {
  constructor(message: string) {
    super(message, { extensions: { code: REMOTE_BROWSER_REFUSED } });
    this.name = 'RemoteBrowserRefusedError';
  }
}

/** Who a conversation browser counts against: a user, or an anonymous guest's own scope. */
export interface ConversationBrowserOwner {
  Key: string;
  Anonymous: boolean;
}

interface HeldBrowser {
  Owner: ConversationBrowserOwner;
  LastUsedAt: number;
  IdleMs: number;
}

export class ConversationBrowserLedger extends BaseSingleton<ConversationBrowserLedger> implements IShutdownable {
  public readonly ShutdownName = 'ConversationBrowserLedger';
  private readonly held = new Map<string, HeldBrowser>();
  private reapTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * How an idle browser is ended. The resolver points this at its own end path, so a reaped browser
   * leaves no stream bookkeeping behind; until then the engine ends it directly.
   */
  public EndBrowser: (conversationID: string) => Promise<unknown> = (conversationID) =>
    RemoteBrowserEngine.Instance.EndSessionForAgentSession(conversationID);

  protected constructor() {
    super();
  }

  public static get Instance(): ConversationBrowserLedger {
    return super.getInstance<ConversationBrowserLedger>();
  }

  /**
   * Records that a conversation's browser is about to be used. A conversation the ledger does not hold
   * yet counts against its owner's cap and, for an anonymous guest, against the cap all guests share: a
   * guest can start a new scope cheaply, so its own cap alone bounds nothing.
   *
   * @throws RemoteBrowserRefusedError when the owner already holds `maxPerUser` conversation browsers, or
   * guests together already hold `maxAnonymousTotal`.
   */
  public Claim(conversationID: string, owner: ConversationBrowserOwner, limits: Pick<ConversationBrowserConfig, 'maxPerUser' | 'maxAnonymousTotal' | 'idleMinutes'>): void {
    const key = conversationID.toLowerCase();
    if (!this.held.has(key)) {
      const held = Array.from(this.held.values());
      const count = held.filter((b) => b.Owner.Key === owner.Key).length;
      if (count >= limits.maxPerUser) {
        throw new RemoteBrowserRefusedError(`You already have ${count} conversation browser(s) open, the most this server allows. Close one first.`);
      }
      if (owner.Anonymous && held.filter((b) => b.Owner.Anonymous).length >= limits.maxAnonymousTotal) {
        throw new RemoteBrowserRefusedError('Every conversation browser this server allows for guests is in use. Try again later.');
      }
    }
    this.held.set(key, { Owner: owner, LastUsedAt: Date.now(), IdleMs: limits.idleMinutes * 60_000 });
    this.startReaper();
  }

  /** Marks a held browser as used (an action, a snapshot poll, human input), which puts off its idle end. */
  public Touch(conversationID: string): void {
    const browser = this.held.get(conversationID.toLowerCase());
    if (browser) {
      browser.LastUsedAt = Date.now();
    }
  }

  /** Forgets a conversation's browser once it has been ended. */
  public Release(conversationID: string): void {
    this.held.delete(conversationID.toLowerCase());
  }

  /** Ends every held browser unused for longer than its idle limit. Returns how many were ended. */
  public async ReapIdle(): Promise<number> {
    const now = Date.now();
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

  /** Ends every held browser on a graceful shutdown, so none outlives the server. Idempotent. */
  public async Shutdown(): Promise<void> {
    if (this.reapTimer) {
      clearInterval(this.reapTimer);
      this.reapTimer = null;
    }
    const held = Array.from(this.held.keys());
    this.held.clear();
    await Promise.allSettled(held.map((conversationID) => this.EndBrowser(conversationID)));
  }

  /**
   * One unref'd timer per process, started with the first browser, so the reaper costs nothing until then.
   * The ledger joins the graceful shutdown at the same time.
   */
  private startReaper(): void {
    if (this.reapTimer) {
      return;
    }
    this.reapTimer = setInterval(() => void this.ReapIdle(), REAP_INTERVAL_MS);
    this.reapTimer.unref?.();
    ShutdownRegistry.Instance.Register(this);
  }
}
