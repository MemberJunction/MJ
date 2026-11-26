import { TestBed } from '@angular/core/testing';
import type {
  IActionStepConfig,
  ITourStepConfiguration,
  TourSessionView,
  TourStepView,
} from '@memberjunction/tours-runtime';
import { describe, expect, it, vi } from 'vitest';
import { ActionStepRenderer } from './action-step-renderer.component';

type ActionStepConfig = IActionStepConfig & ITourStepConfiguration;

function makeActionStep(
  config: ActionStepConfig = {},
  overrides: Partial<TourStepView<ActionStepConfig>> = {},
): TourStepView<ActionStepConfig> {
  return {
    StepKey: 'action-1',
    Sequence: 10,
    StepIndex: 1,
    TotalSteps: 3,
    StepType: 'Action',
    Title: 'Save Record',
    Body: 'Click **Save** in the toolbar.',
    Placement: 'bottom',
    Mode: 'Guide',
    IsOptional: false,
    Anchor: { Strategy: 'Registered', Key: 'form.save' },
    AnchorResolved: true,
    AnchorResolution: 'Registered',
    Configuration: config,
    WaitingForCompletion: true,
    ...overrides,
  };
}

function makeSession(step: TourStepView<ActionStepConfig>, canGoBack = true): TourSessionView {
  return {
    RunID: 'run-action-1',
    TourKey: 'core.action',
    TourName: 'Action Tour',
    TourVersionID: 'ver-1',
    Status: 'In Progress',
    GuideMode: 'Visual',
    DirectorType: 'Visual',
    PresenterClass: 'Overlay',
    CurrentStep: step,
    CompletedStepKeys: ['step-0'],
    PathTaken: ['step-0', step.StepKey, 'step-2'],
    CanGoBack: canGoBack,
    CanAdvance: true,
    StepIndex: step.StepIndex,
    StepCount: step.TotalSteps,
    IsPaused: false,
    GoalMet: false,
  };
}

describe('ActionStepRenderer', () => {
  it('renders non-modal dialog with aria-labelledby, aria-describedby, waiting pill, and F6 anchor hint', () => {
    const step = makeActionStep({ ShowWaitingIndicator: true, WaitingMessage: 'Waiting for Save click...' });
    const fixture = TestBed.createComponent(ActionStepRenderer);
    fixture.componentRef.setInput('Step', step);
    fixture.componentRef.setInput('Session', makeSession(step));
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    const h2 = fixture.nativeElement.querySelector('h2') as HTMLElement;
    const body = fixture.nativeElement.querySelector('.mjt-body') as HTMLElement;

    expect(dialog.getAttribute('aria-modal')).toBe('false');
    expect(dialog.getAttribute('aria-labelledby')).toBe(h2.id);
    expect(dialog.getAttribute('aria-describedby')).toBe(body.id);
    expect(fixture.nativeElement.querySelector('.mjt-awaiting-pill')?.textContent).toContain(
      'Waiting for Save click...',
    );
    expect(fixture.nativeElement.querySelector('.mjt-hint')?.textContent).toContain('F6');
  });

  it('omits waiting pill and F6 hint when disabled/unanchored and omits aria-describedby when Body is empty', () => {
    const step = makeActionStep(
      { ShowWaitingIndicator: false },
      { Body: '', Anchor: null, WaitingForCompletion: false },
    );
    const fixture = TestBed.createComponent(ActionStepRenderer);
    fixture.componentRef.setInput('Step', step);
    fixture.componentRef.setInput('Session', makeSession(step, false));
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.getAttribute('aria-describedby')).toBeNull();
    expect(fixture.nativeElement.querySelector('.mjt-awaiting-pill')).toBeNull();
    expect(fixture.nativeElement.querySelector('.mjt-hint')).toBeNull();
    expect(fixture.nativeElement.querySelector('button[variant="secondary"]')).toBeNull();
  });

  it('emits NextRequested (on skip), BackRequested, DismissRequested, and StepSelected', () => {
    const step = makeActionStep({ AllowManualSkip: true, SkipButtonText: 'Skip action' });
    const fixture = TestBed.createComponent(ActionStepRenderer);
    fixture.componentRef.setInput('Step', step);
    fixture.componentRef.setInput('Session', makeSession(step, true));
    fixture.detectChanges();

    const nextSpy = vi.fn();
    const backSpy = vi.fn();
    const dismissSpy = vi.fn();
    const stepSelectedSpy = vi.fn();
    fixture.componentInstance.NextRequested.subscribe(nextSpy);
    fixture.componentInstance.BackRequested.subscribe(backSpy);
    fixture.componentInstance.DismissRequested.subscribe(dismissSpy);
    fixture.componentInstance.StepSelected.subscribe(stepSelectedSpy);

    const backBtn = fixture.nativeElement.querySelector('button[variant="secondary"]') as HTMLButtonElement;
    const skipBtn = fixture.nativeElement.querySelector('button[variant="primary"]') as HTMLButtonElement;
    const dismissBtn = fixture.nativeElement.querySelector('button[variant="flat"]') as HTMLButtonElement;

    expect(skipBtn.textContent?.trim()).toBe('Skip action');

    backBtn.click();
    skipBtn.click();
    dismissBtn.click();

    expect(backSpy).toHaveBeenCalledWith({ StepKey: 'action-1' });
    expect(nextSpy).toHaveBeenCalledWith({ StepKey: 'action-1' });
    expect(dismissSpy).toHaveBeenCalledWith({ StepKey: 'action-1' });

    const doneSegment = fixture.nativeElement.querySelector('.mjt-progress-segment--done') as HTMLButtonElement;
    doneSegment.click();
    expect(stepSelectedSpy).toHaveBeenCalledWith('step-0');
  });
});
