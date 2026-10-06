import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, Output, inject } from '@angular/core';
import type { Subscription } from 'rxjs';
import type { RealtimeCaptureKind } from '@memberjunction/realtime-runtime';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { SelfViewComponent, SharePreviewComponent } from '@memberjunction/ng-realtime-media';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import type { RealtimeCaptureModel, RealtimeCaptureView } from './realtime-capture-model';

/** What the surface says for each capture. */
interface CaptureWording {
  Icon: string;
  Asks: string;
  Off: string;
  Start: string;
  Starting: string;
  Hint: string;
}

const WORDING: Record<RealtimeCaptureKind, CaptureWording> = {
  camera: {
    Icon: 'fa-solid fa-video',
    Asks: 'asks to see your camera',
    Off: 'Your camera is off',
    Start: 'Turn on camera',
    Starting: 'Waiting for your camera…',
    Hint: 'Only you can turn your camera on or off.',
  },
  screen: {
    Icon: 'fa-solid fa-display',
    Asks: 'asks to see your screen',
    Off: 'Nothing is shared',
    Start: 'Share your screen',
    Starting: "Choose what to share in your browser's window.",
    Hint: 'Only you choose what to share, and you can stop at any time.',
  },
};

/**
 * `mj-realtime-capture-surface`: the Camera or Screen Share channel's surface. While the capture is off it is the ask:
 * what the agent wants to see and why, with Turn on camera (or Share your screen) and, while the agent's request stands,
 * Not now. While on, it is the user's own view of it: their camera mirrored (`mj-self-view`), or what they share
 * (`mj-share-preview`, with Stop sharing and Change). It owns no rules: the {@link RealtimeCaptureModel} decides what it
 * shows, and the channel runs the user's buttons.
 */
@Component({
  standalone: true,
  selector: 'mj-realtime-capture-surface',
  imports: [MJButtonDirective, SelfViewComponent, SharePreviewComponent, SharedGenericModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './realtime-capture-surface.component.html',
  styleUrls: ['./realtime-capture-surface.component.css'],
})
export class RealtimeCaptureSurfaceComponent implements OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);
  private model: RealtimeCaptureModel | null = null;
  private viewSub: Subscription | null = null;

  /** What the surface shows now, or `null` until a model is bound. */
  public View: RealtimeCaptureView | null = null;

  /** The agent's name, for "Sage asks to see your camera". */
  @Input() AgentName = 'The assistant';

  /** The channel's state. */
  @Input()
  public set Model(value: RealtimeCaptureModel | null) {
    if (value === this.model) {
      return;
    }
    this.viewSub?.unsubscribe();
    this.model = value;
    this.viewSub =
      value?.View$.subscribe((view) => {
        this.View = view;
        this.cdr.markForCheck();
      }) ?? null;
  }
  public get Model(): RealtimeCaptureModel | null {
    return this.model;
  }

  /** The user asked to turn the camera on, or to share a screen. */
  @Output() StartRequested = new EventEmitter<void>();
  /** The user said "Not now" to the agent's request. */
  @Output() DeclineRequested = new EventEmitter<void>();
  /** The user turned the camera off, or stopped sharing. */
  @Output() StopRequested = new EventEmitter<void>();
  /** The user asked to share something else. */
  @Output() ChangeRequested = new EventEmitter<void>();

  /** The words for this capture. */
  public get Wording(): CaptureWording {
    return WORDING[this.View?.Kind ?? 'camera'];
  }

  /** The card's heading: the agent's request while it stands, else that the capture is off. */
  public get Heading(): string {
    return this.View?.Reason !== null && this.View?.Reason !== undefined ? `${this.AgentName} ${this.Wording.Asks}` : this.Wording.Off;
  }

  public ngOnDestroy(): void {
    this.viewSub?.unsubscribe();
    this.viewSub = null;
  }
}
