import { Directive, EventEmitter, Input, Output, TemplateRef } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import type { TourSessionView } from '@memberjunction/tours-runtime';
import type {
  TourChoiceEventArgs,
  TourStepIntentEventArgs,
  TourStepSignalEventArgs,
} from '../renderers/base-step-renderer';
import type { TourVoiceBarContext } from './tour-voice-dock.component';

/**
 * Base Angular UX presenter (`Overlay`, `SidePanel`, `Embedded`).
 * Subclasses register with `@RegisterClass(BaseTourPresenter, '<PresenterKey>')`.
 */
@Directive()
export abstract class BaseTourPresenter extends BaseAngularComponent {
  @Input() public Session: TourSessionView | null = null;
  @Input() public AnchorElement: HTMLElement | null = null;
  @Input() public ExtraAnchorElements: ReadonlyArray<HTMLElement> = [];
  @Input() public LiveAnnouncement = '';
  @Input() public VoiceBarTemplate: TemplateRef<TourVoiceBarContext> | null = null;
  @Input() public VoiceGuideAvailable = false;
  @Input() public VoiceGuideActive = false;
  @Input() public EstimatedMinutes: number | undefined = undefined;

  @Output() public NextRequested = new EventEmitter<TourStepIntentEventArgs>();
  @Output() public BackRequested = new EventEmitter<TourStepIntentEventArgs>();
  @Output() public DismissRequested = new EventEmitter<TourStepIntentEventArgs>();
  @Output() public ChoiceMade = new EventEmitter<TourChoiceEventArgs>();
  @Output() public SignalEmitted = new EventEmitter<TourStepSignalEventArgs>();
  @Output() public NextTourRequested = new EventEmitter<string>();
  @Output() public StepSelected = new EventEmitter<string>();
  @Output() public VoiceGuideRequested = new EventEmitter<boolean>();
  @Output() public DemonstrateRequested = new EventEmitter<{ ConfirmedMutation?: boolean }>();
  @Output() public ConfirmDemonstration = new EventEmitter<void>();
  @Output() public CancelDemonstration = new EventEmitter<void>();
}
