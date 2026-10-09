/**
 * @fileoverview The meeting room's notice that an agent's avatar can't be shown. Everyone in the room sees it, once per
 * agent per join, from the agent's bot's attribute (`LiveKitParticipantView.AvatarAudioOnly`, read by the room core).
 * Its words are `ng-realtime-media`'s `AvatarNoticeText` in the meeting form, which names the agent, since a meeting
 * can have several.
 *
 * @module @memberjunction/ng-mj-livekit-room
 */

import type { LiveKitAvatarAudioOnly, LiveKitParticipantView, LiveKitRoomState } from '@memberjunction/livekit-room-core';

/** How long a notice shows before it hides itself, in milliseconds. */
export const AGENT_AVATAR_NOTICE_HIDE_MS = 10_000;

/** A reason the room can name (`RealtimeAvatarUnavailableReason` in `@memberjunction/ai`). */
type AvatarAudioOnlyReason = NonNullable<LiveKitAvatarAudioOnly['Reason']>;

/** A notice over the room: the agent it is about, and why its avatar can't be shown. */
export interface AgentAvatarNotice {
  /** The agent's participant identity. */
  Identity: string;
  /** The agent's name, as the room shows it. */
  AgentName: string;
  /** Why, when the agent's bot gave a reason the room knows. */
  Reason?: AvatarAudioOnlyReason;
}

/**
 * The notices that agents' avatars can't be shown, for one meeting room. A notice shows from the first room state in
 * which the agent's bot says audio only, until the user dismisses it, {@link AGENT_AVATAR_NOTICE_HIDE_MS} passes or the
 * agent leaves, and not again in the same join: a reconnect is the same join, and only {@link Reset} starts a new one.
 */
export class AgentAvatarNotices {
  /** The agents that have had their notice in this join. */
  private readonly noticed = new Set<string>();
  /** The hide timer of each notice showing, by agent. */
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private visible: readonly AgentAvatarNotice[] = [];

  /**
   * @param changed Called whenever the notices showing change, including when one hides itself.
   * @param hideAfterMs How long a notice shows before it hides itself.
   */
  constructor(
    private readonly changed: () => void,
    private readonly hideAfterMs: number = AGENT_AVATAR_NOTICE_HIDE_MS,
  ) {}

  /** The notices showing now, oldest first. */
  public get Visible(): readonly AgentAvatarNotice[] {
    return this.visible;
  }

  /** Shows a notice for each agent newly audio only in this join, and drops the notices of agents who left. */
  public Update(state: LiveKitRoomState): void {
    const present = new Set(state.Remote.map((p) => p.Identity));
    const kept = this.visible.filter((notice) => present.has(notice.Identity));
    this.visible.filter((notice) => !present.has(notice.Identity)).forEach((notice) => this.stopTimer(notice.Identity));
    const added = state.Remote.flatMap((p) => this.noticeFor(p));
    if (added.length === 0 && kept.length === this.visible.length) {
      return;
    }
    this.visible = [...kept, ...added];
    this.changed();
  }

  /** Hides an agent's notice; it does not show again in this join. */
  public Dismiss(identity: string): void {
    if (this.visible.some((notice) => notice.Identity === identity)) {
      this.hide(identity);
    }
  }

  /** Starts a new join: no notice shows now, and each agent's can show once more. */
  public Reset(): void {
    this.noticed.clear();
    [...this.timers.keys()].forEach((identity) => this.stopTimer(identity));
    if (this.visible.length > 0) {
      this.visible = [];
      this.changed();
    }
  }

  /** Stops the hide timers, for a room that is going away. */
  public Dispose(): void {
    [...this.timers.keys()].forEach((identity) => this.stopTimer(identity));
  }

  /** A new notice for an agent newly audio only in this join, with its hide timer started; none for anyone else. */
  private noticeFor(participant: LiveKitParticipantView): AgentAvatarNotice[] {
    const audioOnly = participant.AvatarAudioOnly;
    if (participant.Role !== 'agent' || !audioOnly || this.noticed.has(participant.Identity)) {
      return [];
    }
    this.noticed.add(participant.Identity);
    this.timers.set(participant.Identity, setTimeout(() => this.hide(participant.Identity), this.hideAfterMs));
    return [{ Identity: participant.Identity, AgentName: participant.DisplayName, ...(audioOnly.Reason ? { Reason: audioOnly.Reason } : {}) }];
  }

  private hide(identity: string): void {
    this.stopTimer(identity);
    this.visible = this.visible.filter((notice) => notice.Identity !== identity);
    this.changed();
  }

  private stopTimer(identity: string): void {
    const timer = this.timers.get(identity);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(identity);
    }
  }
}
