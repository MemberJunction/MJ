/**
 * A fake call for the shell's tests: what the call chunk would hand back, driven by the test. Nothing here
 * touches Angular, the runtime or the network, which is the point: the shell's rules are testable without them.
 */
import type { JSONObject } from '@memberjunction/ai';
import { DefaultWidgetConfig } from '../lib/config';
import type { WidgetChannelClass, WidgetChannelResult } from '../lib/session/widget-controller';
import type { WidgetConfig, WidgetOutboundEvent, WidgetPhase } from '../lib/types';
import type { Subscribable, WidgetSessionHandle, WidgetSessionOptions } from '../shell/session-contract';
import { ShellController, type ShellControllerPorts } from '../shell/shell-controller';

/** A tiny observable the fake session exposes. */
export class FakeStream<T> implements Subscribable<T> {
  private readonly listeners = new Set<(value: T) => void>();
  public subscribe(next: (value: T) => void): { unsubscribe(): void } {
    this.listeners.add(next);
    return { unsubscribe: () => this.listeners.delete(next) };
  }
  public next(value: T): void {
    for (const listener of [...this.listeners]) {
      listener(value);
    }
  }
  public get Count(): number {
    return this.listeners.size;
  }
}

export class FakeSession implements WidgetSessionHandle {
  public ErrorMessage = '';
  public readonly Phase$ = new FakeStream<WidgetPhase>();
  public readonly Events$ = new FakeStream<WidgetOutboundEvent>();
  public Configs: WidgetConfig[] = [];
  public Starts = 0;
  public Ends = 0;
  public Disposed = false;
  public Notes: string[] = [];
  public Spoken: string[] = [];
  public Opens: Array<{ channel: string; inputs: JSONObject }> = [];
  public Registered: WidgetChannelClass[] = [];
  public Mounted: HTMLElement[] = [];
  public Unmounts = 0;
  public PageHides: boolean[] = [];
  public OpenResult: WidgetChannelResult = { success: true };
  /** What `Start()` does: by default it goes live. */
  public OnStart: () => void = () => this.Phase$.next('live');

  public Configure(config: WidgetConfig): void {
    this.Configs.push(config);
  }
  public async Start(): Promise<void> {
    this.Starts++;
    this.OnStart();
  }
  public async End(): Promise<void> {
    this.Ends++;
  }
  public async OpenChannel(channel: string, inputs: JSONObject): Promise<WidgetChannelResult> {
    this.Opens.push({ channel, inputs });
    return this.OpenResult;
  }
  public SendContextNote(text: string): void {
    this.Notes.push(text);
  }
  public RequestSpokenResponse(text: string): boolean {
    this.Spoken.push(text);
    return true;
  }
  public RegisterChannel(channelClass: WidgetChannelClass): void {
    this.Registered.push(channelClass);
  }
  public OnPageHide(persisted: boolean): void {
    this.PageHides.push(persisted);
  }
  public MountOverlay(container: HTMLElement): void {
    this.Mounted.push(container);
  }
  public UnmountOverlay(): void {
    this.Unmounts++;
  }
  public Dispose(): void {
    this.Disposed = true;
  }
}

export interface ShellHarness {
  controller: ShellController;
  config: WidgetConfig;
  events: WidgetOutboundEvent[];
  phases: () => WidgetPhase[];
  /** The session the controller created, once it has (the code "loaded"). */
  session: FakeSession;
  /** How many times the code was asked for. */
  loads: () => number;
  /** Holds the "download" until released; returns the release (or rejection) functions. */
  hold: () => { release: () => void; fail: (error: Error) => void };
}

export function buildShell(overrides: Partial<WidgetConfig> = {}): ShellHarness {
  const config: WidgetConfig = { ...DefaultWidgetConfig(), requireConsent: false, ...overrides };
  const events: WidgetOutboundEvent[] = [];
  const session = new FakeSession();
  let loadCount = 0;
  let gate: Promise<void> | null = null;
  let rejection: Error | null = null;
  const ports: ShellControllerPorts = {
    GetConfig: () => harness.config,
    GetNonce: () => null,
    Emit: (event) => events.push(event),
    CreateSession: async (_options: WidgetSessionOptions) => {
      loadCount++;
      if (gate) {
        await gate;
      }
      if (rejection) {
        const error = rejection;
        rejection = null;
        throw error;
      }
      return session;
    }
  };
  const controller = new ShellController(ports);
  const harness: ShellHarness = {
    controller,
    config,
    events,
    session,
    phases: () => events.flatMap((e) => (e.name === 'mj-phase-changed' ? [e.detail.phase] : [])),
    loads: () => loadCount,
    hold: () => {
      let release: () => void = () => undefined;
      gate = new Promise<void>((resolve) => (release = resolve));
      return {
        release: () => {
          release();
          gate = null;
        },
        fail: (error) => {
          rejection = error;
          release();
          gate = null;
        }
      };
    }
  };
  return harness;
}

export const flushMicrotasks = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
