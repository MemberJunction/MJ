import { Directive, EventEmitter, Input, Output } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import type { TourSessionView } from '@memberjunction/tours-runtime';
import type {
  TourChoiceEventArgs,
  TourStepIntentEventArgs,
  TourStepSignalEventArgs,
} from '../renderers/base-step-renderer';

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

  @Output() public NextRequested = new EventEmitter<TourStepIntentEventArgs>();
  @Output() public BackRequested = new EventEmitter<TourStepIntentEventArgs>();
  @Output() public DismissRequested = new EventEmitter<TourStepIntentEventArgs>();
  @Output() public ChoiceMade = new EventEmitter<TourChoiceEventArgs>();
  @Output() public SignalEmitted = new EventEmitter<TourStepSignalEventArgs>();
  @Output() public NextTourRequested = new EventEmitter<string>();
}
