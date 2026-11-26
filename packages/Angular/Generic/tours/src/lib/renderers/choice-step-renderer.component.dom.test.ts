import { TestBed } from '@angular/core/testing';
import type {
  IChoiceStepConfig,
  ITourStepConfiguration,
  TourSessionView,
  TourStepView,
} from '@memberjunction/tours-runtime';
import { describe, expect, it, vi } from 'vitest';
import { ChoiceStepRenderer } from './choice-step-renderer.component';

type ChoiceStepConfig = IChoiceStepConfig & ITourStepConfiguration;

function makeChoiceStep(
  config: ChoiceStepConfig,
  overrides: Partial<TourStepView<ChoiceStepConfig>> = {},
): TourStepView<ChoiceStepConfig> {
  return {
    StepKey: 'choice-1',
    Sequence: 10,
    StepIndex: 0,
    TotalSteps: 3,
    StepType: 'Choice',
    Title: 'Pick Your Workflow',
    Body: 'Select how you want to explore.',
    Placement: 'center',
    Mode: 'Guide',
    IsOptional: false,
    Anchor: null,
    AnchorResolved: true,
    AnchorResolution: 'Registered',
    Configuration: config,
    WaitingForCompletion: true,
    ...overrides,
  };
}

function makeSession(step: TourStepView<ChoiceStepConfig>, canGoBack = true): TourSessionView {
  return {
    RunID: 'run-choice-1',
    TourKey: 'core.choice',
    TourName: 'Choice Tour',
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
    StepIndex: 0,
    StepCount: 3,
    IsPaused: false,
    GoalMet: false,
  };
}

describe('ChoiceStepRenderer', () => {
  it('renders ARIA radiogroup options, updates aria-checked & mjt-choice-option--selected, and emits ChoiceMade directly on branching choice', () => {
    const step = makeChoiceStep({
      Question: 'Which area next?',
      Options: [
        { Key: 'grids', Label: 'Data Grids', Description: 'Saved views' },
        { Key: 'sage', Label: 'Sage Assistant', Description: 'Natural language' },
      ],
    });
    const fixture = TestBed.createComponent(ChoiceStepRenderer);
    fixture.componentRef.setInput('Step', step);
    fixture.componentRef.setInput('Session', makeSession(step));
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    const h2 = fixture.nativeElement.querySelector('h2') as HTMLElement;
    const body = fixture.nativeElement.querySelector('.mjt-body') as HTMLElement;
    expect(dialog.getAttribute('aria-labelledby')).toBe(h2.id);
    expect(dialog.getAttribute('aria-describedby')).toBe(body.id);

    const choiceSpy = vi.fn();
    fixture.componentInstance.ChoiceMade.subscribe(choiceSpy);

    const options = fixture.nativeElement.querySelectorAll('.mjt-choice-option') as NodeListOf<HTMLButtonElement>;
    expect(options[0].getAttribute('aria-checked')).toBe('false');
    options[0].click();
    fixture.detectChanges();

    expect(options[0].classList.contains('mjt-choice-option--selected')).toBe(true);
    expect(options[0].getAttribute('aria-checked')).toBe('true');
    expect(choiceSpy).toHaveBeenCalledWith({
      StepKey: 'choice-1',
      ChoiceKey: 'grids',
      IsCorrect: undefined,
    });
  });

  it('shows KnowledgeCheck correct & incorrect feedback classes before Continue emits ChoiceMade', () => {
    const step = makeChoiceStep({
      IsKnowledgeCheck: true,
      Options: [
        { Key: 'wrong', Label: 'Option A', IsCorrect: false, Feedback: 'Try again.' },
        { Key: 'right', Label: 'Option B', IsCorrect: true, Feedback: 'Spot on!' },
      ],
    });
    const fixture = TestBed.createComponent(ChoiceStepRenderer);
    fixture.componentRef.setInput('Step', step);
    fixture.componentRef.setInput('Session', makeSession(step));
    fixture.detectChanges();

    const choiceSpy = vi.fn();
    fixture.componentInstance.ChoiceMade.subscribe(choiceSpy);

    const options = fixture.nativeElement.querySelectorAll('.mjt-choice-option') as NodeListOf<HTMLButtonElement>;
    options[0].click();
    fixture.detectChanges();

    const wrongBanner = fixture.nativeElement.querySelector('.mjt-choice-feedback') as HTMLElement;
    expect(wrongBanner.classList.contains('mjt-choice-feedback--incorrect')).toBe(true);
    expect(wrongBanner.textContent).toContain('Try again.');
    expect(choiceSpy).not.toHaveBeenCalled();

    options[1].click();
    fixture.detectChanges();

    const rightBanner = fixture.nativeElement.querySelector('.mjt-choice-feedback') as HTMLElement;
    expect(rightBanner.classList.contains('mjt-choice-feedback--correct')).toBe(true);
    expect(rightBanner.textContent).toContain('Spot on!');

    const continueBtn = fixture.nativeElement.querySelector('button[variant="primary"]') as HTMLButtonElement;
    continueBtn.click();
    expect(choiceSpy).toHaveBeenCalledWith({
      StepKey: 'choice-1',
      ChoiceKey: 'right',
      IsCorrect: true,
    });
  });

  it('supports 1-9 keyboard shortcut selection while ignoring modified keys/inputs, and emits BackRequested & DismissRequested', () => {
    const step = makeChoiceStep({
      Options: [
        { Key: 'first', Label: 'First' },
        { Key: 'second', Label: 'Second' },
      ],
    });
    const fixture = TestBed.createComponent(ChoiceStepRenderer);
    fixture.componentRef.setInput('Step', step);
    fixture.componentRef.setInput('Session', makeSession(step, true));
    fixture.detectChanges();

    const choiceSpy = vi.fn();
    const backSpy = vi.fn();
    const dismissSpy = vi.fn();
    fixture.componentInstance.ChoiceMade.subscribe(choiceSpy);
    fixture.componentInstance.BackRequested.subscribe(backSpy);
    fixture.componentInstance.DismissRequested.subscribe(dismissSpy);

    // Modifier key should be ignored
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '1', ctrlKey: true, bubbles: true }));
    expect(choiceSpy).not.toHaveBeenCalled();

    // Unmodified '2' selects second option
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }));
    expect(choiceSpy).toHaveBeenCalledWith({
      StepKey: 'choice-1',
      ChoiceKey: 'second',
      IsCorrect: undefined,
    });

    const backBtn = fixture.nativeElement.querySelector('button[variant="secondary"]') as HTMLButtonElement;
    const dismissBtn = fixture.nativeElement.querySelector('button[variant="flat"]') as HTMLButtonElement;
    backBtn.click();
    dismissBtn.click();
    expect(backSpy).toHaveBeenCalledWith({ StepKey: 'choice-1' });
    expect(dismissSpy).toHaveBeenCalledWith({ StepKey: 'choice-1' });
  });
});
