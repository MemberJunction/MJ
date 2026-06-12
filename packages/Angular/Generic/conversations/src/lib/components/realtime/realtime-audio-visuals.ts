import { RealtimeAudioActivity } from '@memberjunction/ai-realtime-client';

/**
 * @fileoverview AUDIO-REACTIVE VISUAL SMOOTHING for the call overlay — the framework-free
 * math between raw per-frame {@link RealtimeAudioActivity} samples and the CSS variables
 * that make the hero orb vibrate like a speaker cone and the EQ render a true spectrum.
 *
 * Raw analyser levels are jittery; rendering them directly strobes. This module applies:
 *  - **Attack/decay envelope smoothing** ({@link SmoothLevel}) — fast attack so speech
 *    onset feels instant, slow decay so the cone "rings down" instead of snapping shut.
 *  - **Direction resolution with hysteresis** — who is audibly speaking (`agent` / `user` /
 *    `none`) with a presence floor and a hold window, so the direction color never
 *    flickers across syllable gaps.
 *
 * Owned by the overlay's requestAnimationFrame loop (outside Angular); kept pure so every
 * rule unit-tests without Web Audio or a browser clock.
 */

/** Who is audibly speaking right now (drives the orb/EQ direction color). */
export type RealtimeVoiceDirection = 'agent' | 'user' | 'none';

/** One smoothed, render-ready visual frame. */
export interface RealtimeAudioVisualFrame {
  /** Smoothed agent-output level, 0..1. */
  OutputLevel: number;
  /** Smoothed user-mic level, 0..1. */
  InputLevel: number;
  /** Smoothed spectrum bins (length {@link AUDIO_VISUAL_BIN_COUNT}) of the dominant direction. */
  Bins: number[];
  /** Resolved speaking direction (hysteresis-stable). */
  Direction: RealtimeVoiceDirection;
}

/** Number of EQ bars the hero renders (matches the meter's bin count). */
export const AUDIO_VISUAL_BIN_COUNT = 9;

/** Levels below this are treated as silence for direction purposes. */
export const AUDIO_PRESENCE_FLOOR = 0.045;

/** How long a direction is HELD after its audio drops below the floor (syllable-gap proofing). */
export const AUDIO_DIRECTION_HOLD_MS = 280;

/** The factor by which the other side must dominate to steal the direction mid-speech. */
export const AUDIO_DIRECTION_STEAL_FACTOR = 1.15;

/**
 * One smoothing step: fast attack (speech onset reads instantly), slow decay (the level
 * rings down like a speaker cone instead of snapping). Pure.
 */
export function SmoothLevel(previous: number, next: number, attack: number = 0.5, decay: number = 0.12): number {
  const factor = next > previous ? attack : decay;
  const value = previous + (next - previous) * factor;
  return Math.min(1, Math.max(0, value));
}

/**
 * Per-overlay smoothing state machine. Feed it one raw {@link RealtimeAudioActivity}
 * sample per animation frame via {@link Next}; render the returned frame. `null` in →
 * `null` out (the driver attached no meters — the host keeps turn-state visuals).
 */
export class RealtimeAudioVisualSmoother {
  private outputLevel = 0;
  private inputLevel = 0;
  private bins: number[] = new Array<number>(AUDIO_VISUAL_BIN_COUNT).fill(0);
  private direction: RealtimeVoiceDirection = 'none';
  /** Last time (ms) the current direction's level was at/above the presence floor. */
  private directionHeldAt = 0;

  /** Resets all smoothing state (call between sessions). */
  public Reset(): void {
    this.outputLevel = 0;
    this.inputLevel = 0;
    this.bins = new Array<number>(AUDIO_VISUAL_BIN_COUNT).fill(0);
    this.direction = 'none';
    this.directionHeldAt = 0;
  }

  /**
   * Advances the smoother with one raw sample.
   * @param raw The client's current audio activity (`null` = no metering capability).
   * @param nowMs A monotonic clock reading (e.g. `performance.now()`).
   * @returns The render-ready frame, or `null` when un-metered.
   */
  public Next(raw: RealtimeAudioActivity | null, nowMs: number): RealtimeAudioVisualFrame | null {
    if (!raw) {
      return null;
    }
    this.outputLevel = SmoothLevel(this.outputLevel, raw.OutputLevel ?? 0);
    this.inputLevel = SmoothLevel(this.inputLevel, raw.InputLevel ?? 0);
    this.smoothBins(this.pickRawBins(raw));
    this.resolveDirection(nowMs);
    return {
      OutputLevel: this.outputLevel,
      InputLevel: this.inputLevel,
      Bins: [...this.bins],
      Direction: this.direction
    };
  }

  /** The spectrum follows whichever direction is louder (falling back to whichever exists). */
  private pickRawBins(raw: RealtimeAudioActivity): number[] | null {
    if (raw.OutputBins && raw.InputBins) {
      return this.outputLevel >= this.inputLevel ? raw.OutputBins : raw.InputBins;
    }
    return raw.OutputBins ?? raw.InputBins;
  }

  private smoothBins(rawBins: number[] | null): void {
    if (!rawBins) {
      // No spectrum available — decay the bars toward silence.
      this.bins = this.bins.map(b => SmoothLevel(b, 0));
      return;
    }
    this.bins = this.bins.map((prev, i) => SmoothLevel(prev, rawBins[i] ?? 0));
  }

  /**
   * Direction rules (hysteresis):
   *  - silence adopts nothing; speech from silence adopts the louder side immediately;
   *  - a live direction RENEWS its hold while at/above the presence floor;
   *  - the other side steals the direction only by dominating ({@link AUDIO_DIRECTION_STEAL_FACTOR});
   *  - a direction releases to `none` only after {@link AUDIO_DIRECTION_HOLD_MS} of silence —
   *    syllable gaps never flicker the color.
   */
  private resolveDirection(nowMs: number): void {
    const out = this.outputLevel;
    const inp = this.inputLevel;
    const audible = out >= AUDIO_PRESENCE_FLOOR || inp >= AUDIO_PRESENCE_FLOOR;
    const louder: RealtimeVoiceDirection = out >= inp ? 'agent' : 'user';

    if (this.direction === 'none') {
      if (audible) {
        this.direction = louder;
        this.directionHeldAt = nowMs;
      }
      return;
    }

    const currentLevel = this.direction === 'agent' ? out : inp;
    const otherLevel = this.direction === 'agent' ? inp : out;
    if (currentLevel >= AUDIO_PRESENCE_FLOOR) {
      this.directionHeldAt = nowMs;
    }
    if (otherLevel >= AUDIO_PRESENCE_FLOOR && otherLevel >= currentLevel * AUDIO_DIRECTION_STEAL_FACTOR) {
      this.direction = this.direction === 'agent' ? 'user' : 'agent';
      this.directionHeldAt = nowMs;
      return;
    }
    if (!audible && nowMs - this.directionHeldAt > AUDIO_DIRECTION_HOLD_MS) {
      this.direction = 'none';
    }
  }
}
