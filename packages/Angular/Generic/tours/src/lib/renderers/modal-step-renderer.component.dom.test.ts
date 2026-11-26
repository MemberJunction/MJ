import { TestBed } from '@angular/core/testing';
import type {
  IModalStepConfig,
  ITourStepConfiguration,
  TourSessionView,
  TourStepView,
} from '@memberjunction/tours-runtime';
import { describe, expect, it, vi } from 'vitest';
import { ModalStepRenderer } from './modal-step-renderer.component';

type ModalStepConfig = IModalStepConfig & ITourStepConfiguration;

function makeModalStep(
  config: ModalStepConfig = {},
  overrides: Partial<TourStepView<ModalStepConfig>> = {},
): TourStepView<ModalStepConfig> {
  return {
    StepKey: 'modal-1',
    Sequence: 10,
    StepIndex: 0,
    TotalSteps: 4,
    StepType: 'Modal',
    Title: 'Welcome to MemberJunction',
    Body: 'Explore workspaces at your pace.',
    Placement: 'center',
    Mode: 'Guide',
    IsOptional: false,
    Anchor: null,
    AnchorResolved: true,
    AnchorResolution: 'Registered',
    Configuration: config,
    WaitingForCompletion: false,
    ...overrides,
  };
}

function makeSession(step: TourStepView<ModalStepConfig>, canGoBack = false): TourSessionView {
  return {
    RunID: 'run-modal-1',
    TourKey: 'core.modal',
    TourName: 'Modal Tour',
    TourVersionID: 'ver-1',
    Status: 'In Progress',
    GuideMode: 'Visual',
    DirectorType: 'Visual',
    PresenterClass: 'Overlay',
    CurrentStep: step,
    CompletedStepKeys: [],
    PathTaken: [step.StepKey],
    CanGoBack: canGoBack,
    CanAdvance: true,
    StepIndex: step.StepIndex,
    StepCount: step.TotalSteps,
    IsPaused: false,
    GoalMet: false,
  };
}

describe('ModalStepRenderer', () => {
  it('renders welcome hero dialog with aria-labelledby/aria-describedby, mode cards, mjt-mode-card--selected, and aria-pressed', () => {
    const step = makeModalStep({ Variant: 'welcome', PrimaryButtonText: 'Begin Tour' });
    const fixture = TestBed.createComponent(ModalStepRenderer);
    fixture.componentRef.setInput('Step', step);
    fixture.componentRef.setInput('Session', makeSession(step));
    fixture.componentRef.setInput('VoiceGuideAvailable', true);
    fixture.componentRef.setInput('VoiceGuideActive', false);
    fixture.componentRef.setInput('EstimatedMinutes', 3);
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    const h2 = fixture.nativeElement.querySelector('h2') as HTMLElement;
    const body = fixture.nativeElement.querySelector('.mjt-body') as HTMLElement;

    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe(h2.id);
    expect(dialog.getAttribute('aria-describedby')).toBe(body.id);
    expect(fixture.nativeElement.querySelector('.mjt-duration-pill')?.textContent).toContain('~3 min · 4 steps');

    const modeCards = fixture.nativeElement.querySelectorAll('.mjt-mode-card') as NodeListOf<HTMLButtonElement>;
    expect(modeCards.length).toBe(2);
    expect(modeCards[0].classList.contains('mjt-mode-card--selected')).toBe(true);
    expect(modeCards[0].getAttribute('aria-pressed')).toBe('true');
    expect(modeCards[1].getAttribute('aria-pressed')).toBe('false');

    modeCards[1].click();
    fixture.detectChanges();
    expect(modeCards[1].classList.contains('mjt-mode-card--selected')).toBe(true);
    expect(modeCards[1].getAttribute('aria-pressed')).toBe('true');

    const voiceSpy = vi.fn();
    const nextSpy = vi.fn();
    fixture.componentInstance.VoiceGuideToggled.subscribe(voiceSpy);
    fixture.componentInstance.NextRequested.subscribe(nextSpy);

    const startBtn = fixture.nativeElement.querySelector('button[variant="primary"]') as HTMLButtonElement;
    expect(startBtn.textContent?.trim()).toBe('Begin Tour');
    startBtn.click();
    expect(voiceSpy).toHaveBeenCalledWith(true);
    expect(nextSpy).toHaveBeenCalledWith({ StepKey: 'modal-1' });
  });

  it('syncs selected mode when VoiceGuideActive input changes', () => {
    const step = makeModalStep({ Variant: 'welcome' });
    const fixture = TestBed.createComponent(ModalStepRenderer);
    fixture.componentRef.setInput('Step', step);
    fixture.componentRef.setInput('Session', makeSession(step));
    fixture.componentRef.setInput('VoiceGuideAvailable', true);
    fixture.componentRef.setInput('VoiceGuideActive', true);
    fixture.detectChanges();

    const modeCards = fixture.nativeElement.querySelectorAll('.mjt-mode-card') as NodeListOf<HTMLButtonElement>;
    expect(modeCards[1].classList.contains('mjt-mode-card--selected')).toBe(true);
    expect(modeCards[1].getAttribute('aria-pressed')).toBe('true');
  });

  it('renders checkpoint/summary variant with Back, NextTourRequested, and DismissRequested', () => {
    const step = makeModalStep(
      { Variant: 'checkpoint', NextTourKey: 'core.advanced', SecondaryButtonText: 'Close' },
      { StepIndex: 3, Body: '' },
    );
    const fixture = TestBed.createComponent(ModalStepRenderer);
    fixture.componentRef.setInput('Step', step);
    fixture.componentRef.setInput('Session', makeSession(step, true));
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.getAttribute('aria-describedby')).toBeNull();
    expect(fixture.nativeElement.querySelector('.mjt-hero-banner')).toBeNull();

    const nextTourSpy = vi.fn();
    const backSpy = vi.fn();
    const dismissSpy = vi.fn();
    fixture.componentInstance.NextTourRequested.subscribe(nextTourSpy);
    fixture.componentInstance.BackRequested.subscribe(backSpy);
    fixture.componentInstance.DismissRequested.subscribe(dismissSpy);

    const secondaryBtns = fixture.nativeElement.querySelectorAll('button[variant="secondary"]') as NodeListOf<HTMLButtonElement>;
    expect(secondaryBtns.length).toBe(2);
    secondaryBtns[0].click();
    expect(nextTourSpy).toHaveBeenCalledWith('core.advanced');

    secondaryBtns[1].click();
    expect(backSpy).toHaveBeenCalledWith({ StepKey: 'modal-1' });

    const flatBtn = fixture.nativeElement.querySelector('button[variant="flat"]') as HTMLButtonElement;
    expect(flatBtn.textContent?.trim()).toBe('Close');
    flatBtn.click();
    expect(dismissSpy).toHaveBeenCalledWith({ StepKey: 'modal-1' });
  });

  it('hides Start next tour button when AvailableTourKeys is provided and excludes NextTourKey', () => {
    const step = makeModalStep(
      { Variant: 'summary', NextTourKey: 'accounting.journal-batches' },
      { StepIndex: 3, Body: 'Order tour complete.' },
    );
    const fixture = TestBed.createComponent(ModalStepRenderer);
    fixture.componentRef.setInput('Step', step);
    fixture.componentRef.setInput('Session', makeSession(step, false));
    fixture.componentRef.setInput('AvailableTourKeys', new Set(['orders.order-to-cash', 'common.directory']));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('Start next tour');

    fixture.componentRef.setInput(
      'AvailableTourKeys',
      new Set(['orders.order-to-cash', 'accounting.journal-batches']),
    );
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Start next tour');
  });
});
