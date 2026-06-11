import { Subject } from 'rxjs';

/**
 * @fileoverview PROGRESSIVE DISCLOSURE model for the realtime call overlay — the
 * framework-free engine behind the "console that grows with you" UX
 * (`plans/realtime/mockups/redesign-a-progressive.html`).
 *
 * The overlay starts as PURE AUDIO (a breathing orb, three controls, no text) and
 * reveals surfaces along two axes:
 *
 *  - **Content-driven (within a session, panel-only)** — the ONE auto-reveal is a
 *    channel's first agent activity (e.g. the first whiteboard write): the surface panel
 *    opens as a peek with that tab focused, while the left column stays exactly as it
 *    was (pure audio included). Everything else announces itself without grabbing:
 *    finished artifacts land as glowing unfocused tabs; delegations are narrated aloud.
 *  - **Capability-driven (across sessions, ratcheted)** — the thread text, composer,
 *    gear and other chrome unlock as the user demonstrates depth (or asks: the hero's
 *    "Show the conversation", the T-to-type hotkey, the Details peek). Milestones persist
 *    per-user via UserInfoEngine under {@link REALTIME_UX_PREF_KEY}; once a control is
 *    earned it never auto-hides. The gear's Simple / Standard / Pro density control is
 *    the manual escape hatch, writing the same setting.
 *
 * ### Levels
 * | Level | Name        | Adds                                                      |
 * |-------|-------------|-----------------------------------------------------------|
 * | 0     | Pure audio  | hero orb · mute · Details peek · end — nothing to read    |
 * | 1     | Text        | caption thread + captions control + type-to-text hint     |
 * | 2     | Engaged     | surface panel · composer dock · channel strip · gear      |
 * | 3     | Channels    | channel tab revealed (board in play)                      |
 * | 4     | Power       | dev affordances default-available (gear popover unlocks)  |
 *
 * Kept free of Angular runtime imports (like `RealtimeSurfaceTabsModel`) so every rule
 * is unit-testable in isolation; the overlay component owns persistence (UserInfoEngine)
 * and subscribes {@link RealtimeDisclosureModel.Changed$} to re-render.
 */

/** The user's manual interface-density override (the gear's escape hatch). */
export type RealtimeUxDensity = 'auto' | 'simple' | 'standard' | 'pro';

/** Session events that RAISE the volatile disclosure level (never lower it). */
export type RealtimeDisclosureEvent = 'text' | 'engaged' | 'channel' | 'power';

/** The per-user persisted disclosure milestones (the cross-session ratchet). */
export interface RealtimeUxMilestones {
  /** Highest disclosure level EARNED across sessions (0–4). Never decreases. */
  Level: number;
  /** Completed live calls — promotes the auto base to power level at {@link REALTIME_UX_PRO_CALLS}. */
  Calls: number;
  /** Manual density override; `'auto'` follows the earned ratchet. */
  Density: RealtimeUxDensity;
}

/** UserInfoEngine settings key for the persisted milestones (versioned shape). */
export const REALTIME_UX_PREF_KEY = 'mj.realtimeVoice.uxMilestones.v1';

/** The highest disclosure level. */
export const REALTIME_UX_MAX_LEVEL = 4;

/** Completed-call count at which the `auto` base promotes to the full power console. */
export const REALTIME_UX_PRO_CALLS = 3;

/** The level each session event raises the volatile session level to. */
const EVENT_LEVELS: Record<RealtimeDisclosureEvent, number> = {
  text: 1,
  engaged: 2,
  channel: 3,
  power: REALTIME_UX_MAX_LEVEL
};

/** A brand-new user's milestones: nothing earned, auto density. */
export function DefaultUxMilestones(): RealtimeUxMilestones {
  return { Level: 0, Calls: 0, Density: 'auto' };
}

/** Clamps a candidate level into the valid 0–{@link REALTIME_UX_MAX_LEVEL} band. */
export function ClampUxLevel(level: number): number {
  if (!Number.isFinite(level)) {
    return 0;
  }
  return Math.min(REALTIME_UX_MAX_LEVEL, Math.max(0, Math.round(level)));
}

/**
 * Parses a persisted milestones payload. TOLERANT: anything missing/malformed falls back
 * to {@link DefaultUxMilestones} (field-wise) — a bad preference must never break the call UX.
 */
export function ParseUxMilestones(raw: string | null | undefined): RealtimeUxMilestones {
  const defaults = DefaultUxMilestones();
  if (!raw) {
    return defaults;
  }
  try {
    const parsed = JSON.parse(raw) as { level?: unknown; calls?: unknown; density?: unknown } | null;
    if (!parsed || typeof parsed !== 'object') {
      return defaults;
    }
    const density = parsed.density;
    return {
      Level: typeof parsed.level === 'number' ? ClampUxLevel(parsed.level) : defaults.Level,
      Calls: typeof parsed.calls === 'number' && Number.isFinite(parsed.calls)
        ? Math.max(0, Math.round(parsed.calls))
        : defaults.Calls,
      Density: density === 'simple' || density === 'standard' || density === 'pro' || density === 'auto'
        ? density
        : defaults.Density
    };
  } catch {
    return defaults;
  }
}

/** Serializes milestones for persistence (lower-cased keys, versionless — the key carries v1). */
export function SerializeUxMilestones(m: RealtimeUxMilestones): string {
  return JSON.stringify({ level: ClampUxLevel(m.Level), calls: Math.max(0, m.Calls), density: m.Density });
}

/**
 * The BASE disclosure level a fresh session starts at:
 *  - manual density overrides win outright (`simple` → 0, `standard` → 2, `pro` → 4);
 *  - `auto` follows the earned ratchet, promoted to the full console once the user has
 *    completed {@link REALTIME_UX_PRO_CALLS} calls.
 */
export function EffectiveBaseLevel(m: RealtimeUxMilestones): number {
  switch (m.Density) {
    case 'simple': return 0;
    case 'standard': return 2;
    case 'pro': return REALTIME_UX_MAX_LEVEL;
    default:
      return ClampUxLevel(Math.max(m.Level, m.Calls >= REALTIME_UX_PRO_CALLS ? REALTIME_UX_MAX_LEVEL : 0));
  }
}

/**
 * The milestones to persist when a live call ends: the call count increments and the
 * earned level ratchets up to whatever the session reached — never below 1 (a completed
 * first call earns the text thread by default next time), never down.
 */
export function RatchetedMilestones(m: RealtimeUxMilestones, sessionLevel: number): RealtimeUxMilestones {
  return {
    Level: ClampUxLevel(Math.max(m.Level, sessionLevel, 1)),
    Calls: Math.max(0, m.Calls) + 1,
    Density: m.Density
  };
}

/**
 * The volatile + persisted disclosure state for ONE overlay instance. The overlay loads
 * it from UserInfoEngine at construction, calls {@link Raise} as session events land,
 * derives every visibility gate from the getters, and persists {@link RatchetOnSessionEnd}'s
 * result when the call ends.
 */
export class RealtimeDisclosureModel {
  /** The persisted cross-session milestones (replaced immutably on change). */
  public Milestones: RealtimeUxMilestones = DefaultUxMilestones();

  /** The CURRENT session's volatile level — max(base, raised events). */
  public SessionLevel = 0;

  /** Emits after every change so the owning component can mark for check. */
  public readonly Changed$ = new Subject<void>();

  /** Loads persisted milestones (tolerant) and resets the session level to the base. */
  public Load(raw: string | null | undefined): void {
    this.Milestones = ParseUxMilestones(raw);
    this.SessionLevel = EffectiveBaseLevel(this.Milestones);
    this.Changed$.next();
  }

  /** Resets the volatile session level to the base — call at every fresh session start. */
  public BeginSession(): void {
    const base = EffectiveBaseLevel(this.Milestones);
    if (this.SessionLevel !== base) {
      this.SessionLevel = base;
      this.Changed$.next();
    }
  }

  /**
   * RAISES the session level for an event (never lowers it).
   * @returns `true` when the level actually changed.
   */
  public Raise(event: RealtimeDisclosureEvent): boolean {
    const target = EVENT_LEVELS[event];
    if (this.SessionLevel >= target) {
      return false;
    }
    this.SessionLevel = target;
    this.Changed$.next();
    return true;
  }

  /**
   * Applies the gear's manual density override. Takes effect immediately — `simple`
   * returns even a mid-call console to the day-one surface (content tabs keep their
   * content; only the chrome retracts). The caller persists the serialized milestones.
   */
  public SetDensity(density: RealtimeUxDensity): void {
    if (this.Milestones.Density === density) {
      return;
    }
    this.Milestones = { ...this.Milestones, Density: density };
    this.SessionLevel = EffectiveBaseLevel(this.Milestones);
    this.Changed$.next();
  }

  /**
   * Ratchets + replaces the milestones for a completed call and returns the serialized
   * payload for persistence. The session level is left as-is (the overlay is about to
   * close or re-begin).
   */
  public RatchetOnSessionEnd(): string {
    this.Milestones = RatchetedMilestones(this.Milestones, this.SessionLevel);
    return SerializeUxMilestones(this.Milestones);
  }

  // ── Visibility gates (live mode; review mode bypasses disclosure entirely) ──

  /** Level 1+: the caption thread (and the captions control) are visible. */
  public get ShowThread(): boolean {
    return this.SessionLevel >= 1;
  }

  /** Level 2+: the composer dock replaces the big-controls strip. */
  public get ShowComposer(): boolean {
    return this.SessionLevel >= 2;
  }

  /** Level 2+: the surface panel exists (content arrival forces this via 'engaged'/'channel'). */
  public get ShowPanel(): boolean {
    return this.SessionLevel >= 2;
  }

  /** Level 2+: the channel strip + the app-bar gear (density escape hatch lives there). */
  public get ShowGear(): boolean {
    return this.SessionLevel >= 2;
  }

  /** Level 4: developer affordances are offered by default (gear popover still gates them). */
  public get PowerLevel(): boolean {
    return this.SessionLevel >= REALTIME_UX_MAX_LEVEL;
  }
}
