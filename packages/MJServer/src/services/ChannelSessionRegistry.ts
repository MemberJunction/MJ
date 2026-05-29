/**
 * Process-wide registry of live `ChannelSession` instances.
 *
 * Looks up sessions started via `StartChannelSession` so that `EndChannelSession`
 * can call `Stop()` on the same instance. Backed by `BaseSingleton<T>` (MJ
 * convention) so the registry survives module duplication across bundler code
 * paths — see CLAUDE.md rule 7.
 *
 * See plans/audio-agent-architecture.md section "7. Where the runtime lives".
 */
import { BaseSingleton } from '@memberjunction/global';
import type { ChannelSession } from '@memberjunction/ai-agent-channel-runtime';

export class ChannelSessionRegistry extends BaseSingleton<ChannelSessionRegistry> {
    private sessions = new Map<string, ChannelSession>();

    protected constructor() {
        super();
    }

    public static get Instance(): ChannelSessionRegistry {
        return super.getInstance<ChannelSessionRegistry>();
    }

    /** Register a session keyed by its `SessionID`. Idempotent. */
    public Register(session: ChannelSession): void {
        this.sessions.set(session.SessionID, session);
    }

    /** Look up a session by ID. Returns `undefined` if not found (already ended). */
    public Get(sessionID: string): ChannelSession | undefined {
        return this.sessions.get(sessionID);
    }

    /** Remove a session from the registry. Returns `true` if it was present. */
    public Unregister(sessionID: string): boolean {
        return this.sessions.delete(sessionID);
    }

    /** Live count — primarily for diagnostics. */
    public get Count(): number {
        return this.sessions.size;
    }
}
