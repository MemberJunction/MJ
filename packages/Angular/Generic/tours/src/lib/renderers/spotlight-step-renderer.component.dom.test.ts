import { TestBed } from '@angular/core/testing';
import type {
  ISpotlightStepConfig,
  ITourStepConfiguration,
  TourSessionView,
  TourStepView,
} from '@memberjunction/tours-runtime';
import { describe, expect, it, vi } from 'vitest';
import { SpotlightStepRenderer } from './spotlight-step-renderer.component';

type SpotlightStepConfig = ISpotlightStepConfig & ITourStepConfiguration;

function makeSpotlightStep(
  config: SpotlightStepConfig = {},
  overrides: Partial<TourStepView<SpotlightStepConfig>> = {},
): TourStepView<SpotlightStepConfig> {
  return {
    StepKey: 'spot-1',
    Sequence: 10,
    StepIndex: 1,
    TotalSteps: 3,
    StepType: 'Spotlight',
    Title: 'Global Filter Bar',
    Body: 'Filter any view using **smart tokens**.',
    Placement: 'bottom',
    Mode: 'Guide',
    IsOptional: false,
    Anchor: { Strategy: 'Registered', Key: 'grid.filter' },
    AnchorResolved: true,
    AnchorResolution: 'Registered',
    Configuration: config,
    WaitingForCompletion: false,
    ...overrides,
  };
}

function makeSession(step: TourStepView<SpotlightStepConfig>, canGoBack = true): TourSessionView {
  return {
    RunID: 'run-spot-1',
    TourKey: 'core.spot',
    TourName: 'Spotlight Tour',
    TourVersionID: 'ver-1',
    Status: 'In Progress',
    GuideMode: 'Visual',
    DirectorType: 'Visual',
    PresenterClass: 'Overlay',
    CurrentStep: step,
    CompletedStepKeys: ['spot-0'],
    PathTaken: ['spot-0', step.StepKey, 'spot-2'],
    CanGoBack: canGoBack,
    CanAdvance: true,
    StepIndex: step.StepIndex,
    StepCount: step.TotalSteps,
    IsPaused: false,
    GoalMet: false,
  };
}

describe('SpotlightStepRenderer', () => {
  it('renders modal dialog with aria-labelledby, aria-describedby, and Guide status pill', () => {
    const step = makeSpotlightStep({ ShowProgress: true });
    const fixture = TestBed.createComponent(SpotlightStepRenderer);
    fixture.componentRef.setInput('Step', step);
    fixture.componentRef.setInput('Session', makeSession(step));
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    const h2 = fixture.nativeElement.querySelector('h2') as HTMLElement;
    const body = fixture.nativeElement.querySelector('.mjt-body') as HTMLElement;

    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe(h2.id);
    expect(dialog.getAttribute('aria-describedby')).toBe(body.id);
    expect(fixture.nativeElement.querySelector('.mjt-awaiting-pill')?.textContent).toContain(
      'Interactive highlight active',
    );
    expect(fixture.nativeElement.querySelector('mj-tour-progress-rail')).not.toBeNull();
  });

  it('hides progress rail and Guide pill when ShowProgress is false and Mode is not Guide', () => {
    const step = makeSpotlightStep(
      { ShowProgress: false },
      { Mode: 'Show', Body: '', StepIndex: 2, TotalSteps: 3 },
    );
    const fixture = TestBed.createComponent(SpotlightStepRenderer);
    fixture.componentRef.setInput('Step', step);
    fixture.componentRef.setInput('Session', makeSession(step, false));
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.getAttribute('aria-describedby')).toBeNull();
    expect(fixture.nativeElement.querySelector('.mjt-awaiting-pill')).toBeNull();
    expect(fixture.nativeElement.querySelector('mj-tour-progress-rail')).toBeNull();
    expect(fixture.nativeElement.querySelector('button[variant="secondary"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('button[variant="primary"]')?.textContent?.trim()).toBe('Done');
  });

  it('uses custom button labels and emits NextRequested, BackRequested, DismissRequested, and StepSelected', () => {
    const step = makeSpotlightStep({
      NextButtonText: 'Continue',
      BackButtonText: 'Previous',
      DismissButtonText: 'Skip tour',
    });
    const fixture = TestBed.createComponent(SpotlightStepRenderer);
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
    const nextBtn = fixture.nativeElement.querySelector('button[variant="primary"]') as HTMLButtonElement;
    const dismissBtn = fixture.nativeElement.querySelector('button[variant="flat"]') as HTMLButtonElement;

    expect(backBtn.textContent?.trim()).toBe('Previous');
    expect(nextBtn.textContent?.trim()).toBe('Continue');
    expect(dismissBtn.textContent?.trim()).toBe('Skip tour');

    backBtn.click();
    nextBtn.click();
    dismissBtn.click();

    expect(backSpy).toHaveBeenCalledWith({ StepKey: 'spot-1' });
    expect(nextSpy).toHaveBeenCalledWith({ StepKey: 'spot-1' });
    expect(dismissSpy).toHaveBeenCalledWith({ StepKey: 'spot-1' });

    const doneSegment = fixture.nativeElement.querySelector('.mjt-progress-segment--done') as HTMLButtonElement;
    doneSegment.click();
    expect(stepSelectedSpy).toHaveBeenCalledWith('spot-0');
  });
});
