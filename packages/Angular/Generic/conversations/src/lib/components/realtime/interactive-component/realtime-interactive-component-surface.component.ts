import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, Input, OnDestroy, OnInit, inject } from '@angular/core';
import { Subscription } from 'rxjs';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { InteractiveComponentHostComponent } from './interactive-component-host.component';
import { ComponentInstanceEngine, type ComponentInstanceRecord } from './component-instance-engine';
import type { ComponentActivity, IInteractiveComponentHandle } from './interactive-component-types';

/**
 * The LIVE surface of the Interactive Component channel (`mj-realtime-interactive-component-surface`): one tab per
 * open component and the active component's pane under it. Every open component stays mounted (hidden when not
 * active) so switching tabs never loses what the user was doing in one.
 *
 * Purely a view of the channel's {@link ComponentInstanceEngine}: the agent's actions mutate the engine through the
 * channel, and this re-renders. What the user does (selecting a tab, closing one, anything inside a component) is
 * reported back through {@link ActivityHandler}.
 */
@Component({
  standalone: true,
  selector: 'mj-realtime-interactive-component-surface',
  imports: [InteractiveComponentHostComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './realtime-interactive-component-surface.component.html',
  styleUrls: ['./realtime-interactive-component-surface.component.css'],
})
export class RealtimeInteractiveComponentSurfaceComponent extends BaseAngularComponent implements OnInit, OnDestroy {
  private _engine: ComponentInstanceEngine | null = null;

  /** The channel's instance engine (set by the channel's `BindSurface` before first change detection). */
  @Input()
  public set Engine(value: ComponentInstanceEngine | null) {
    if (value === this._engine) {
      return;
    }
    this._engine = value;
    this.resubscribe();
  }
  public get Engine(): ComponentInstanceEngine | null {
    return this._engine;
  }

  /** Display name of the agent fronting the session, for the empty-state copy. */
  @Input() public AgentName = 'The agent';

  /** Reports what the user does (tab selection, closing a tab, activity inside a component) to the channel. */
  public ActivityHandler: ((instanceId: string, activity: ComponentActivity) => void) | null = null;

  /** The open components, in open order. */
  public Instances: readonly ComponentInstanceRecord[] = [];

  /** The id of the component the user is looking at. */
  public ActiveID: string | null = null;

  /** The component the user is looking at, or `null`. */
  public get ActiveRecord(): ComponentInstanceRecord | null {
    return this.Instances.find((r) => r.InstanceID === this.ActiveID) ?? null;
  }

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private subscription: Subscription | null = null;

  ngOnInit(): void {
    this.resubscribe();
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
  }

  /** The active component's pane element, for frame capture; `null` when nothing is open. */
  public GetActiveElement(): HTMLElement | null {
    if (this.ActiveID === null) {
      return null;
    }
    return this.elementRef.nativeElement.querySelector<HTMLElement>(`[data-instance="${this.ActiveID}"]`);
  }

  /** Tab click. */
  public SelectTab(instanceId: string): void {
    if (this.ActivityHandler) {
      this.ActivityHandler(instanceId, { Kind: 'selected' });
    } else {
      this._engine?.SetActive(instanceId);
    }
  }

  /** The close button: closes the component the user is looking at. */
  public CloseTab(event: Event, instanceId: string): void {
    event.stopPropagation();
    if (this.ActivityHandler) {
      this.ActivityHandler(instanceId, { Kind: 'closed' });
    } else {
      this._engine?.Remove(instanceId);
    }
  }

  /** Keyboard navigation along the tab list (left/right/home/end), as the tabs pattern expects. */
  public OnTabKeydown(event: KeyboardEvent, index: number): void {
    const last = this.Instances.length - 1;
    const targets: Record<string, number> = { ArrowRight: Math.min(index + 1, last), ArrowLeft: Math.max(index - 1, 0), Home: 0, End: last };
    const next = targets[event.key];
    if (next === undefined) {
      return;
    }
    event.preventDefault();
    this.SelectTab(this.Instances[next].InstanceID);
  }

  /** A component's live handle appeared (or went away while a new version loads). */
  public OnHandleChange(instanceId: string, handle: IInteractiveComponentHandle | null): void {
    this._engine?.AttachHandle(instanceId, handle);
  }

  /** Something happened inside a component. */
  public OnActivity(instanceId: string, activity: ComponentActivity): void {
    this.ActivityHandler?.(instanceId, activity);
  }

  /** `track` function: instances are identified by id across version swaps. */
  public TrackByInstance(_index: number, record: ComponentInstanceRecord): string {
    return record.InstanceID;
  }

  /** (Re)subscribes to the engine and pulls its current state. */
  private resubscribe(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
    this.refresh();
    if (this._engine) {
      this.subscription = this._engine.Changed$.subscribe(() => this.refresh());
    }
  }

  private refresh(): void {
    this.Instances = this._engine ? this._engine.Instances : [];
    this.ActiveID = this._engine ? this._engine.ActiveID : null;
    this.cdr.markForCheck();
  }
}
