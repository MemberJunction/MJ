import { TestBed } from '@angular/core/testing';
import {
  TourSignals,
  type IAskAgentStepConfig,
  type ITourStepConfiguration,
  type TourSessionView,
  type TourStepView,
} from '@memberjunction/tours-runtime';
import { describe, expect, it, vi } from 'vitest';
import { MJ_TOUR_AGENT_DISPATCHER, type TourAskAgentDispatcher } from '../../host/tour-host-tokens';
import { AskAgentStepRenderer } from './ask-agent-step-renderer.component';

type AskAgentStepConfig = IAskAgentStepConfig & ITourStepConfiguration;

function makeAskAgentStep(
  config: AskAgentStepConfig = { SeedPrompt: '' },
  overrides: Partial<TourStepView<AskAgentStepConfig>> = {},
): TourStepView<AskAgentStepConfig> {
  return {
    StepKey: 'ask-1',
    Sequence: 10,
    StepIndex: 1,
    TotalSteps: 3,
    StepType: 'AskAgent',
    Title: 'Ask Sage for Help',
    Body: 'Edit the prompt or send it directly.',
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

function makeSession(step: TourStepView<AskAgentStepConfig>, canGoBack = true): TourSessionView {
  return {
    RunID: 'run-ask-1',
    TourKey: 'core.ask',
    TourName: 'Ask Agent Tour',
    TourVersionID: 'ver-1',
    Status: 'In Progress',
    GuideMode: 'Visual',
    DirectorType: 'Visual',
    PresenterClass: 'Overlay',
    CurrentStep: step,
    CompletedStepKeys: ['step-0'],
    PathTaken: ['step-0', step.StepKey],
    CanGoBack: canGoBack,
    CanAdvance: true,
    StepIndex: step.StepIndex,
    StepCount: step.TotalSteps,
    IsPaused: false,
    GoalMet: false,
  };
}

describe('AskAgentStepRenderer', () => {
  it('associates label for attribute with textarea, renders aria-labelledby/aria-describedby, and seeds prompt', () => {
    const step = makeAskAgentStep({ SeedPrompt: 'Summarize open deals', PreferVoice: true });
    const fixture = TestBed.createComponent(AskAgentStepRenderer);
    fixture.componentRef.setInput('Step', step);
    fixture.componentRef.setInput('Session', makeSession(step));
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    const h2 = fixture.nativeElement.querySelector('h2') as HTMLElement;
    const body = fixture.nativeElement.querySelector('.mjt-body') as HTMLElement;
    const label = fixture.nativeElement.querySelector('label') as HTMLLabelElement;
    const textarea = fixture.nativeElement.querySelector('textarea.mjt-agent-input') as HTMLTextAreaElement;

    expect(dialog.getAttribute('aria-labelledby')).toBe(h2.id);
    expect(dialog.getAttribute('aria-describedby')).toBe(body.id);
    expect(label.getAttribute('for')).toBe(textarea.id);
    expect(fixture.componentInstance.PromptInputId).toBe(textarea.id);
    expect(fixture.nativeElement.querySelector('button[variant="primary"]')?.textContent).toContain(
      'Ask Sage with Voice',
    );
  });

  it('dispatches prompt via MJ_TOUR_AGENT_DISPATCHER, emits SignalEmitted & TourSignals, and shows confirmation', async () => {
    const dispatchSpy = vi.fn(async () => undefined);
    const dispatcher: TourAskAgentDispatcher = { DispatchAskAgent: dispatchSpy };
    await TestBed.configureTestingModule({
      providers: [{ provide: MJ_TOUR_AGENT_DISPATCHER, useValue: dispatcher }],
    }).compileComponents();

    const step = makeAskAgentStep({ SeedPrompt: 'Create weekly summary', AgentID: 'agent-sage' });
    const fixture = TestBed.createComponent(AskAgentStepRenderer);
    fixture.componentRef.setInput('Step', step);
    fixture.componentRef.setInput('Session', makeSession(step));
    fixture.detectChanges();

    const signalSpy = vi.fn();
    const tourSignalSpy = vi.fn();
    fixture.componentInstance.SignalEmitted.subscribe(signalSpy);
    const sub = TourSignals.Instance.ForKey('tours.agent.ask').subscribe(tourSignalSpy);

    const askBtn = fixture.nativeElement.querySelector('button[variant="primary"]') as HTMLButtonElement;
    askBtn.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(dispatchSpy).toHaveBeenCalledWith({
      StepKey: 'ask-1',
      TourKey: 'core.ask',
      Prompt: 'Create weekly summary',
      AgentID: 'agent-sage',
      PreferVoice: false,
    });
    expect(signalSpy).toHaveBeenCalledWith(
      expect.objectContaining({ StepKey: 'ask-1', SignalKey: 'tours.agent.ask' }),
    );
    expect(tourSignalSpy).toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.mjt-waiting')?.textContent).toContain('Prompt sent to Sage.');
    sub.unsubscribe();
  });

  it('disables Ask button when prompt is empty and emits NextRequested, BackRequested, DismissRequested', () => {
    const step = makeAskAgentStep(
      { SeedPrompt: '   ', AllowNextButtonFallback: true, NextButtonText: 'Skip prompt' },
      { Body: '' },
    );
    const fixture = TestBed.createComponent(AskAgentStepRenderer);
    fixture.componentRef.setInput('Step', step);
    fixture.componentRef.setInput('Session', makeSession(step, true));
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.getAttribute('aria-describedby')).toBeNull();

    const askBtn = fixture.nativeElement.querySelector('button[variant="primary"]') as HTMLButtonElement;
    expect(askBtn.disabled).toBe(true);

    const nextSpy = vi.fn();
    const backSpy = vi.fn();
    const dismissSpy = vi.fn();
    fixture.componentInstance.NextRequested.subscribe(nextSpy);
    fixture.componentInstance.BackRequested.subscribe(backSpy);
    fixture.componentInstance.DismissRequested.subscribe(dismissSpy);

    const secondaryBtns = fixture.nativeElement.querySelectorAll('button[variant="secondary"]') as NodeListOf<HTMLButtonElement>;
    secondaryBtns[0].click();
    secondaryBtns[1].click();
    expect(backSpy).toHaveBeenCalledWith({ StepKey: 'ask-1' });
    expect(nextSpy).toHaveBeenCalledWith({ StepKey: 'ask-1' });

    const dismissBtn = fixture.nativeElement.querySelector('button[variant="flat"]') as HTMLButtonElement;
    dismissBtn.click();
    expect(dismissSpy).toHaveBeenCalledWith({ StepKey: 'ask-1' });
  });
});
