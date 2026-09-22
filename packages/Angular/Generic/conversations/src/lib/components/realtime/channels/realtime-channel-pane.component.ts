import { Component, ComponentRef, Input, OnDestroy, OnInit, Type, ViewContainerRef, inject } from '@angular/core';
import { BaseRealtimeChannelClient } from '@memberjunction/realtime-runtime';

/**
 * Generic pane host for an interactive channel's surface inside the overlay's tabbed
 * surface panel. Given the per-session channel {@link Plugin}, it:
 *
 *  1. dynamically creates the plugin's surface component
 *     ({@link BaseRealtimeChannelClient.GetSurfaceComponent}) into its own view container;
 *  2. immediately hands the created instance to
 *     {@link BaseRealtimeChannelClient.BindSurface} — synchronously, BEFORE the surface's
 *     first change detection, so inputs the plugin sets are visible in its `ngOnInit`;
 *  3. notifies {@link BaseRealtimeChannelClient.UnbindSurface} when the pane is destroyed
 *     (panel collapsed / overlay torn down), flipping the plugin back into its
 *     no-surface tool-execution mode.
 *
 * This is how channel surfaces render with ZERO channel-specific wiring in the overlay:
 * the host never knows the surface component's type or API — the plugin wires its own
 * inputs/outputs in `BindSurface`.
 *
 * The created component is inserted as a SIBLING of this host element (standard
 * `ViewContainerRef` semantics), so it participates directly in the pane's flex layout;
 * the host element itself renders nothing (`display: none`).
 */
@Component({
  standalone: true,
  selector: 'mj-realtime-channel-pane',
  template: '',
  styles: [':host { display: none; }']
})
export class RealtimeChannelPaneComponent implements OnInit, OnDestroy {
  /** The per-session channel plugin whose surface this pane hosts. */
  @Input({ required: true }) Plugin!: BaseRealtimeChannelClient;

  private viewContainer = inject(ViewContainerRef);
  private surfaceRef: ComponentRef<object> | null = null;

  ngOnInit(): void {
    // Server-only channels have no surface (GetSurfaceComponent === null). The overlay should not
    // register a pane for them, but guard here too so a stray registration never crashes the panel.
    const surface = this.Plugin.GetSurfaceComponent();
    if (!surface) {
      return;
    }
    // The runtime carries the surface as an opaque component class — it has no business knowing
    // what a component is in any given framework. This is the single point that does, so the
    // Angular narrowing belongs here rather than as a structural claim in the shared contract.
    this.surfaceRef = this.viewContainer.createComponent(surface as Type<object>);
    // Bind BEFORE the created component's first change detection — inputs the plugin sets
    // here are in place when the surface's ngOnInit runs.
    this.Plugin.BindSurface(this.surfaceRef.instance);
    this.surfaceRef.changeDetectorRef.markForCheck();
  }

  ngOnDestroy(): void {
    this.Plugin.UnbindSurface();
    this.surfaceRef?.destroy();
    this.surfaceRef = null;
  }
}
