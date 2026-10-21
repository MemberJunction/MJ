/**
 * The page's say over what the agent may SEE, and the event that reports it.
 *
 * Two jobs, both thin over the runtime (which owns exposure policy and the video-source arbiter):
 *
 *  1. `perception` (`on|off|ask`) is the page's PRE-SET of the person's own exposure choice. It is installed
 *     as a layer over the runtime's exposure-preference store, so it is in force BEFORE a channel initializes
 *     (the point at which a channel decides whether to source a video track), and a choice the person makes
 *     afterwards in the "agent can see" control wins over it. It can only LOWER or leave what the server's
 *     policy allows; `on` never raises a ceiling.
 *  2. Every flip of a video source's `Enabled` flag, whoever caused it (the person, the page, the server's
 *     policy), is re-emitted as `mj-perception-changed` so the page can mirror the agent's view.
 *
 * `ask` (the default) installs nothing at all: the runtime behaves exactly as it does without this widget.
 */
import { Subscription } from 'rxjs';
import type { VideoSourceState } from '@memberjunction/ai-realtime-client';
import type { RealtimeChannelExposure } from '@memberjunction/ai-core-plus';
import type { IChannelExposurePreferences, RealtimeSessionRuntime } from '@memberjunction/realtime-runtime';
import type { WidgetOutboundEvent, WidgetPerception, WidgetPerceptionSource } from '../types';

/** What each pre-set means as the person's exposure choice. `ask` pre-fills nothing. */
export function ExposureForPerception(mode: WidgetPerception): RealtimeChannelExposure | undefined {
  switch (mode) {
    case 'on':
      return 'pixels';
    case 'off':
      return 'state';
    case 'ask':
      return undefined;
  }
}

/** A video source as the page sees it. */
export function ToPerceptionSource(state: VideoSourceState): WidgetPerceptionSource {
  return { sourceId: state.SourceID, label: state.Label, channel: state.ChannelKey ?? null, enabled: state.Enabled, active: state.Active };
}

/**
 * The sources whose `Enabled` flag flipped between two snapshots. A source that is new, or gone, is not a
 * toggle (nothing was switched), so it is not reported.
 */
export function FindPerceptionToggles(previous: readonly VideoSourceState[], next: readonly VideoSourceState[]): VideoSourceState[] {
  const before = new Map(previous.map((s) => [s.SourceID, s.Enabled]));
  return next.filter((s) => before.has(s.SourceID) && before.get(s.SourceID) !== s.Enabled);
}

/**
 * The exposure-preference store the widget installs: an explicit choice (the person's, made in this call) wins,
 * then the page's pre-set, then whatever the host's own store remembers. Choices are passed through to the host's
 * store so a signed-in person's persisted preference still works.
 */
export class WidgetExposurePreferences implements IChannelExposurePreferences {
  private readonly explicit = new Map<string, RealtimeChannelExposure | undefined>();
  private applying = false;

  constructor(
    private readonly inner: IChannelExposurePreferences,
    private readonly mode: () => WidgetPerception
  ) {}

  public Get(channelKey: string): RealtimeChannelExposure | undefined {
    const key = channelKey.trim().toLowerCase();
    if (this.explicit.has(key)) {
      return this.explicit.get(key);
    }
    const preset = ExposureForPerception(this.mode());
    return preset !== undefined ? preset : this.inner.Get(channelKey);
  }

  public Set(channelKey: string, level: RealtimeChannelExposure | undefined): void {
    if (this.applying) {
      return; // the page re-applying its own pre-set is not the person's choice
    }
    this.explicit.set(channelKey.trim().toLowerCase(), level);
    this.inner.Set(channelKey, level);
  }

  /** Forgets the person's explicit choices (the page changed its pre-set, so the newest word is the page's). */
  public ForgetChoices(): void {
    this.explicit.clear();
  }

  /** Runs `action` with writes ignored — used while pushing the page's pre-set into live channels. */
  public WhileApplying(action: () => void): void {
    this.applying = true;
    try {
      action();
    } finally {
      this.applying = false;
    }
  }
}

/** Wires the pre-set and the change event to one runtime. */
export class PerceptionBridge {
  private mode: WidgetPerception = 'ask';
  private installed: WidgetExposurePreferences | null = null;
  private original: IChannelExposurePreferences | null = null;
  private sourcesSub: Subscription | null = null;
  private lastSources: readonly VideoSourceState[] = [];

  constructor(
    private readonly runtime: RealtimeSessionRuntime,
    private readonly emit: (event: WidgetOutboundEvent) => void
  ) {}

  /** Applies the page's `perception`. Safe before, during and after a call. */
  public Apply(mode: WidgetPerception): void {
    const changed = mode !== this.mode;
    this.mode = mode;
    if (this.installed === null && mode === 'ask') {
      return; // nothing installed, nothing to say: the runtime behaves as it always did
    }
    const store = this.ensureInstalled();
    if (changed) {
      store.ForgetChoices();
      this.pushIntoLiveChannels(store);
    }
  }

  /** Starts reporting source toggles for the session that is starting. */
  public Start(): void {
    this.Stop();
    this.lastSources = [];
    this.sourcesSub = this.runtime.VideoSources$.subscribe((next) => {
      for (const toggled of FindPerceptionToggles(this.lastSources, next)) {
        this.emit({ name: 'mj-perception-changed', detail: { ...ToPerceptionSource(toggled), sources: next.map(ToPerceptionSource) } });
      }
      this.lastSources = next;
    });
  }

  /** Stops reporting (the session ended). */
  public Stop(): void {
    this.sourcesSub?.unsubscribe();
    this.sourcesSub = null;
    this.lastSources = [];
  }

  /** Stops, and puts the runtime's own store back. */
  public Dispose(): void {
    this.Stop();
    if (this.installed !== null && this.original !== null) {
      this.runtime.SetExposurePreferences(this.original);
    }
    this.installed = null;
    this.original = null;
  }

  private ensureInstalled(): WidgetExposurePreferences {
    if (this.installed === null) {
      this.original = this.runtime.ExposurePreferences;
      this.installed = new WidgetExposurePreferences(this.original, () => this.mode);
      this.runtime.SetExposurePreferences(this.installed);
    }
    return this.installed;
  }

  /** Re-resolves every channel in the call against the new pre-set, without recording it as the person's choice. */
  private pushIntoLiveChannels(store: WidgetExposurePreferences): void {
    const names = [...this.runtime.ActiveChannels, ...this.runtime.AdvertisedChannels].map((c) => c.ChannelName);
    store.WhileApplying(() => {
      for (const name of names) {
        this.runtime.SetUserChannelExposure(name, store.Get(name));
      }
    });
  }
}
