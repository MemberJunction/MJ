import { Component, ComponentRef, Input, OnDestroy, OnInit, Type, ViewContainerRef, inject } from '@angular/core';
import { BaseRealtimeChannelClient } from '@memberjunction/realtime-runtime';

/**
 * Generic host for an interactive channel's surface on the call overlay's stage. Given the per-session channel
 * {@link Plugin}, it:
 *
 *  1. dynamically creates the plugin's surface component
 *     ({@link BaseRealtimeChannelClient.GetSurfaceComponent}) into its own view container;
 *  2. immediately hands the created instance to
 *     {@link BaseRealtimeChannelClient.BindSurface} — synchronously, BEFORE the surface's
 *     first change detection, so inputs the plugin sets are visible in its `ngOnInit`;
 *  3. tells the plugin whether the surface is on screen
 *     ({@link BaseRealtimeChannelClient.OnSurfaceVisibilityChange}) right after binding and whenever
 *     {@link Visible} changes, so it can pause work nobody sees;
 *  4. notifies {@link BaseRealtimeChannelClient.UnbindSurface} when the pane is destroyed
 *     (the channel left the session / the overlay was torn down) or handed another plugin,
 *     flipping the plugin back into its no-surface tool-execution mode.
 *
 * This is how channel surfaces render with ZERO channel-specific wiring in the overlay:
 * the host never knows the surface component's type or API — the plugin wires its own
 * inputs/outputs in `BindSurface`.
 *
 * The created component is inserted as a SIBLING of this host element (standard
 * `ViewContainerRef` semantics), so it participates directly in its container's layout;
 * the host element itself renders nothing (`display: none`).
 */
@Component({
  standalone: true,
  selector: 'mj-realtime-channel-pane',
  template: '',
  styles: [':host { display: none; }']
})
export class RealtimeChannelPaneComponent implements OnInit, OnDestroy {
  private viewContainer = inject(ViewContainerRef);
  private surfaceRef: ComponentRef<object> | null = null;
  private plugin!: BaseRealtimeChannelClient;
  private initialized = false;
  private visible = true;

  /**
   * The per-session channel plugin whose surface this pane hosts. Handing the pane another plugin (the same channel
   * in a new session) releases the old plugin's surface and creates the new one's.
   */
  @Input({ required: true })
  set Plugin(value: BaseRealtimeChannelClient) {
    if (value === this.plugin) {
      return;
    }
    if (this.initialized) {
      this.releaseSurface();
    }
    this.plugin = value;
    if (this.initialized) {
      this.createSurface();
    }
  }
  get Plugin(): BaseRealtimeChannelClient {
    return this.plugin;
  }

  /** Whether the surface is on screen. The plugin hears of every change while its surface is bound. */
  @Input()
  set Visible(value: boolean) {
    if (value === this.visible) {
      return;
    }
    this.visible = value;
    if (this.surfaceRef) {
      this.plugin.OnSurfaceVisibilityChange(value);
    }
  }
  get Visible(): boolean {
    return this.visible;
  }

  ngOnInit(): void {
    this.initialized = true;
    this.createSurface();
  }

  ngOnDestroy(): void {
    this.releaseSurface();
  }

  private createSurface(): void {
    // Server-only channels have no surface (GetSurfaceComponent === null). The overlay should not
    // register a pane for them, but guard here too so a stray registration never crashes the panel.
    const surface = this.plugin.GetSurfaceComponent();
    if (!surface) {
      return;
    }
    // The runtime carries the surface as an opaque component class — it has no business knowing
    // what a component is in any given framework. This is the single point that does, so the
    // Angular narrowing belongs here rather than as a structural claim in the shared contract.
    this.surfaceRef = this.viewContainer.createComponent(surface as Type<object>);
    // Bind BEFORE the created component's first change detection — inputs the plugin sets
    // here are in place when the surface's ngOnInit runs.
    this.plugin.BindSurface(this.surfaceRef.instance);
    this.plugin.OnSurfaceVisibilityChange(this.visible);
    this.surfaceRef.changeDetectorRef.markForCheck();
  }

  private releaseSurface(): void {
    this.plugin.UnbindSurface();
    this.surfaceRef?.destroy();
    this.surfaceRef = null;
  }
}
