import { TestBed } from '@angular/core/testing';
import type { TourSessionView, TourStepView } from '@memberjunction/tours-runtime';
import { describe, expect, it, vi } from 'vitest';
import { SidePanelTourPresenterComponent } from './side-panel-tour-presenter.component';

function makeStep(overrides: Partial<TourStepView> = {}): TourStepView {
  return {
    StepKey: 'step-2',
    Sequence: 20,
    StepIndex: 1,
    TotalSteps: 3,
    StepType: 'Spotlight',
    Title: 'Configure Columns',
    Body: 'Choose fields to display.',
    Placement: 'right',
    Mode: 'Guide',
    IsOptional: false,
    Anchor: null,
    AnchorResolved: true,
    AnchorResolution: 'Registered',
    Configuration: { ShowProgress: true },
    WaitingForCompletion: false,
    ...overrides,
  };
}

function makeSession(step: TourStepView): TourSessionView {
  return {
    RunID: 'run-panel-1',
    TourKey: 'core.panel',
    TourName: 'Side Panel Tour',
    TourVersionID: 'ver-1',
    Status: 'In Progress',
    GuideMode: 'Visual',
    DirectorType: 'Visual',
    PresenterClass: 'SidePanel',
    CurrentStep: step,
    CompletedStepKeys: ['step-1'],
    PathTaken: ['step-1', 'step-2', 'step-3'],
    CanGoBack: true,
    CanAdvance: true,
    StepIndex: step.StepIndex,
    StepCount: step.TotalSteps,
    IsPaused: false,
    GoalMet: false,
  };
}

describe('SidePanelTourPresenterComponent', () => {
  it('renders complementary panel with TourName aria-label and step progress path items', async () => {
    const step = makeStep();
    const fixture = TestBed.createComponent(SidePanelTourPresenterComponent);
    fixture.componentRef.setInput('Session', makeSession(step));
    fixture.componentRef.setInput('LiveAnnouncement', 'Step 2 of 3: Configure Columns');
    fixture.detectChanges();

    await new Promise((resolve) => setTimeout(resolve, 20));
    fixture.detectChanges();

    const aside = fixture.nativeElement.querySelector('aside.mjt-sidepanel') as HTMLElement;
    expect(aside).not.toBeNull();
    expect(aside.getAttribute('aria-label')).toBe('Side Panel Tour');
    expect(aside.textContent).toContain('Step 2 of 3');

    const items = fixture.nativeElement.querySelectorAll('.mjt-sidepanel-step-item') as NodeListOf<HTMLButtonElement>;
    expect(items.length).toBe(3);
    expect(items[0].classList.contains('mjt-sidepanel-step-item--clickable')).toBe(true);
    expect(items[0].disabled).toBe(false);
    expect(items[1].classList.contains('mjt-sidepanel-step-item--active')).toBe(true);
    expect(items[1].disabled).toBe(true);
    expect(items[2].disabled).toBe(true);
  });

  it('emits StepSelected when a completed path item is clicked and ignores uncompleted steps', () => {
    const step = makeStep();
    const fixture = TestBed.createComponent(SidePanelTourPresenterComponent);
    fixture.componentRef.setInput('Session', makeSession(step));
    fixture.detectChanges();

    const selectedSpy = vi.fn();
    fixture.componentInstance.StepSelected.subscribe(selectedSpy);

    const items = fixture.nativeElement.querySelectorAll('.mjt-sidepanel-step-item') as NodeListOf<HTMLButtonElement>;
    items[0].click();
    expect(selectedSpy).toHaveBeenCalledWith('step-1');

    fixture.componentInstance.OnSelectCompletedStep('step-3');
    expect(selectedSpy).toHaveBeenCalledTimes(1);
  });

  it('emits DismissRequested from close button and forwards NextRequested from mounted step renderer', async () => {
    const step = makeStep();
    const fixture = TestBed.createComponent(SidePanelTourPresenterComponent);
    fixture.componentRef.setInput('Session', makeSession(step));
    fixture.detectChanges();

    await new Promise((resolve) => setTimeout(resolve, 20));
    fixture.detectChanges();

    const dismissSpy = vi.fn();
    const nextSpy = vi.fn();
    fixture.componentInstance.DismissRequested.subscribe(dismissSpy);
    fixture.componentInstance.NextRequested.subscribe(nextSpy);

    const closeBtn = fixture.nativeElement.querySelector('.mjt-sidepanel-header .mjt-close-btn') as HTMLButtonElement;
    closeBtn.click();
    expect(dismissSpy).toHaveBeenCalledWith({ StepKey: 'step-2' });

    const nextBtn = fixture.nativeElement.querySelector('mj-tour-spotlight-step button[variant="primary"]') as HTMLButtonElement;
    nextBtn.click();
    expect(nextSpy).toHaveBeenCalledWith({ StepKey: 'step-2' });
  });
});
