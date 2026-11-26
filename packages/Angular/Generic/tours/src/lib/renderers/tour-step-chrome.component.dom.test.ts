import { TestBed } from '@angular/core/testing';
import type { TourSessionView, TourStepView } from '@memberjunction/tours-runtime';
import { describe, expect, it, vi } from 'vitest';
import {
  TourCardHairlineComponent,
  TourProgressRailComponent,
  TourStepHeaderComponent,
} from './tour-step-chrome.component';

function makeStep(overrides: Partial<TourStepView> = {}): TourStepView {
  return {
    StepKey: 'step-2',
    Sequence: 20,
    StepIndex: 1,
    TotalSteps: 4,
    StepType: 'Spotlight',
    Title: 'Filter Results',
    Body: 'Filter the view',
    Placement: 'bottom',
    Mode: 'Guide',
    IsOptional: false,
    Anchor: null,
    AnchorResolved: true,
    AnchorResolution: 'Registered',
    Configuration: {},
    WaitingForCompletion: false,
    ...overrides,
  };
}

function makeSession(overrides: Partial<TourSessionView> = {}): TourSessionView {
  const step = makeStep();
  return {
    RunID: 'run-chrome-1',
    TourKey: 'core.chrome',
    TourName: 'Chrome Tour',
    TourVersionID: 'ver-1',
    Status: 'In Progress',
    GuideMode: 'Visual',
    DirectorType: 'Visual',
    PresenterClass: 'Overlay',
    CurrentStep: step,
    CompletedStepKeys: ['step-1'],
    PathTaken: ['step-1', 'step-2', 'step-3', 'step-4'],
    CanGoBack: true,
    CanAdvance: true,
    StepIndex: 1,
    StepCount: 4,
    IsPaused: false,
    GoalMet: false,
    ...overrides,
  };
}

describe('TourStepHeaderComponent, TourProgressRailComponent & TourCardHairlineComponent', () => {
  it('TourStepHeaderComponent renders step category eyebrow, heading id, and emits Dismiss on close click', () => {
    const fixture = TestBed.createComponent(TourStepHeaderComponent);
    fixture.componentRef.setInput('Step', makeStep({ StepType: 'Action', Title: 'Click Save' }));
    fixture.componentRef.setInput('HeadingId', 'mjt-heading-step-2');
    fixture.componentRef.setInput('ShowProgress', true);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.mjt-progress')?.textContent).toContain(
      'Step 2 of 4 · Interactive Guide',
    );
    const h2 = fixture.nativeElement.querySelector('h2.mjt-title') as HTMLHeadingElement;
    expect(h2.id).toBe('mjt-heading-step-2');
    expect(h2.textContent).toContain('Click Save');

    const dismissSpy = vi.fn();
    fixture.componentInstance.Dismiss.subscribe(dismissSpy);
    const closeBtn = fixture.nativeElement.querySelector('.mjt-close-btn') as HTMLButtonElement;
    closeBtn.click();
    expect(dismissSpy).toHaveBeenCalledTimes(1);

    fixture.componentRef.setInput('ShowProgress', false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.mjt-progress')).toBeNull();
  });

  it('TourProgressRailComponent marks done/active/upcoming segments and emits StepSelected on completed click', () => {
    const fixture = TestBed.createComponent(TourProgressRailComponent);
    fixture.componentRef.setInput('Session', makeSession());
    fixture.detectChanges();

    const segments = fixture.nativeElement.querySelectorAll('.mjt-progress-segment') as NodeListOf<HTMLButtonElement>;
    expect(segments.length).toBe(4);
    expect(segments[0].classList.contains('mjt-progress-segment--done')).toBe(true);
    expect(segments[0].classList.contains('mjt-progress-segment--clickable')).toBe(true);
    expect(segments[0].getAttribute('aria-label')).toBe('Go to step 1');
    expect(segments[0].disabled).toBe(false);

    expect(segments[1].classList.contains('mjt-progress-segment--active')).toBe(true);
    expect(segments[1].getAttribute('aria-current')).toBe('step');
    expect(segments[1].disabled).toBe(true);

    expect(segments[2].disabled).toBe(true);

    const stepSelectedSpy = vi.fn();
    fixture.componentInstance.StepSelected.subscribe(stepSelectedSpy);
    segments[0].click();
    expect(stepSelectedSpy).toHaveBeenCalledWith('step-1');
  });

  it('TourCardHairlineComponent computes clamped progress fill percentage across steps', () => {
    const fixture = TestBed.createComponent(TourCardHairlineComponent);
    fixture.componentRef.setInput('StepIndex', 1);
    fixture.componentRef.setInput('StepCount', 4);
    fixture.detectChanges();

    const fill = fixture.nativeElement.querySelector('.mjt-card-hairline-fill') as HTMLElement;
    expect(fill.style.width).toBe('50%');

    fixture.componentRef.setInput('StepIndex', 5);
    fixture.componentRef.setInput('StepCount', 4);
    fixture.detectChanges();
    expect(fill.style.width).toBe('100%');
  });
});
