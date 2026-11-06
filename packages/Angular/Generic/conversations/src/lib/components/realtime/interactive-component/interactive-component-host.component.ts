import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, Output, ViewChild, inject } from '@angular/core';
import type { IMetadataProvider } from '@memberjunction/core';
import type { ComponentSpec } from '@memberjunction/interactive-component-types';
import { MJReactComponent, MJReactModule, type ReactComponentEvent } from '@memberjunction/ng-react';
import { ReactComponentHandle } from './react-component-handle';
import type { ComponentActivity, IInteractiveComponentHandle } from './interactive-component-types';

/**
 * Hosts ONE interactive component for the Interactive Component channel and reports what the channel needs: a live
 * handle once the component has initialized (and `null` while a new version is loading), and what the user does in
 * it.
 *
 * It exists as its own component because a version swap is just a new `Spec` input: the host drops the handle,
 * lets `mj-react-component` reinitialize in place, and hands out a fresh handle when that finishes. The instance
 * (and so its id, tab and place) never changes.
 */
@Component({
  standalone: true,
  selector: 'mj-interactive-component-host',
  imports: [MJReactModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mj-react-component
      #react
      class="ic-host__component"
      [Component]="Spec"
      [ComponentProps]="Inputs"
      [Provider]="Provider"
      (ComponentEvent)="OnComponentEvent($event)"
      (StateChange)="Activity.emit({ Kind: 'state' })"
      (Initialized)="OnInitialized()"
    ></mj-react-component>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        min-height: 0;
        overflow: auto;
      }
      .ic-host__component {
        display: block;
        height: 100%;
      }
    `,
  ],
})
export class InteractiveComponentHostComponent {
  private _spec!: ComponentSpec;

  /** The component to render. A new value is a new version: the handle is dropped until the new one has initialized. */
  @Input({ required: true })
  public set Spec(value: ComponentSpec) {
    if (this._spec !== undefined && value !== this._spec) {
      this.HandleChange.emit(null);
    }
    this._spec = value;
  }
  public get Spec(): ComponentSpec {
    return this._spec;
  }

  /** Values for the component's own properties. */
  @Input() public Inputs: object = {};

  /** The session's metadata provider, so the component's data access runs as the signed-in user. */
  @Input() public Provider: IMetadataProvider | null = null;

  /** What the user did inside the component. */
  @Output() public Activity = new EventEmitter<ComponentActivity>();

  /** The live handle once the component is ready; `null` when it is not (loading a new version). */
  @Output() public HandleChange = new EventEmitter<IInteractiveComponentHandle | null>();

  @ViewChild('react') private react?: MJReactComponent;

  private readonly hostRef = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The host's element: what a frame capturer rasterizes to show the model the component. */
  public get Element(): HTMLElement {
    return this.hostRef.nativeElement;
  }

  /** The component finished initializing (first load or a new version). */
  public OnInitialized(): void {
    if (this.react) {
      this.HandleChange.emit(new ReactComponentHandle(this.react));
    }
    this.Activity.emit({ Kind: 'initialized' });
  }

  /** A component event: reported with its type and payload. */
  public OnComponentEvent(event: ReactComponentEvent): void {
    this.Activity.emit({ Kind: 'event', Name: event.type, Payload: event.payload });
  }
}
