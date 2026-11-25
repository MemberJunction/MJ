import { TestBed } from '@angular/core/testing';
import type { ComponentSpec } from '@memberjunction/interactive-component-types';
import {
  TourSignals,
  type IEmbeddedComponentStepConfig,
  type ITourStepConfiguration,
  type TourSessionView,
  type TourStepView,
} from '@memberjunction/tours-runtime';
import { describe, expect, it, vi } from 'vitest';
import { EmbeddedComponentStepRenderer } from './embedded-component-step-renderer.component';

type EmbeddedConfig = IEmbeddedComponentStepConfig &
  ITourStepConfiguration & {
    componentSpec?: ComponentSpec;
    data?: Record<string, unknown>;
  };

function makeSpec(): ComponentSpec {
  return {
    name: 'InteractiveStepDemo',
    title: 'Demo Widget',
    description: 'Demo widget for tours',
    location: 'embedded',
    type: 'widget',
    functionalRequirements: 'Interactive step widget',
    technicalDesign: 'Rendered inside mj-react-component',
    exampleUsage: '<InteractiveStepDemo />',
    code: 'export default function Component() { return null; }',
  };
}

function makeEmbeddedStep(
  config: EmbeddedConfig = { componentSpec: makeSpec() },
  overrides: Partial<TourStepView<EmbeddedConfig>> = {},
): TourStepView<EmbeddedConfig> {
  return {
    StepKey: 'embed-comp-1',
    Sequence: 10,
    StepIndex: 1,
    TotalSteps: 3,
    StepType: 'EmbeddedComponent',
    Title: 'Interactive Checklist',
    Body: 'Complete the inline widget.',
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

function makeSession(step: TourStepView<EmbeddedConfig>, canGoBack = true): TourSessionView {
  return {
    RunID: 'run-embed-comp-1',
    TourKey: 'core.embed-comp',
    TourName: 'Embedded Component Tour',
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

describe('EmbeddedComponentStepRenderer', () => {
  it('renders ARIA dialog attributes and mounts mj-react-component for inline componentSpec', () => {
    const step = makeEmbeddedStep({
      componentSpec: makeSpec(),
      InputProps: { workspace: 'Sales' },
    });
    const fixture = TestBed.createComponent(EmbeddedComponentStepRenderer);
    fixture.componentRef.setInput('Step', step);
    fixture.componentRef.setInput('Session', makeSession(step));
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    const h2 = fixture.nativeElement.querySelector('h2') as HTMLElement;
    const body = fixture.nativeElement.querySelector('.mjt-body') as HTMLElement;

    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe(h2.id);
    expect(dialog.getAttribute('aria-describedby')).toBe(body.id);
    expect(fixture.nativeElement.querySelector('.mjt-react-host mj-react-component')).not.toBeNull();
  });

  it('routes React component events (emitSignal, chooseBranch, completeStep, custom) to outputs & TourSignals', () => {
    const step = makeEmbeddedStep({
      componentSpec: makeSpec(),
      CompletionEventName: 'tours.custom.done',
    });
    const fixture = TestBed.createComponent(EmbeddedComponentStepRenderer);
    fixture.componentRef.setInput('Step', step);
    fixture.componentRef.setInput('Session', makeSession(step));
    fixture.detectChanges();

    const nextSpy = vi.fn();
    const choiceSpy = vi.fn();
    const signalSpy = vi.fn();
    const customSignalSpy = vi.fn();
    const sub = TourSignals.Instance.ForKey('tours.custom.done').subscribe(customSignalSpy);

    fixture.componentInstance.NextRequested.subscribe(nextSpy);
    fixture.componentInstance.ChoiceMade.subscribe(choiceSpy);
    fixture.componentInstance.SignalEmitted.subscribe(signalSpy);

    fixture.componentInstance.OnReactComponentEvent({
      type: 'emitSignal',
      payload: { signalKey: 'tours.widget.ready', data: { step: 1 } },
    });
    expect(signalSpy).toHaveBeenCalledWith({
      StepKey: 'embed-comp-1',
      SignalKey: 'tours.widget.ready',
      Payload: { step: 1 },
    });

    fixture.componentInstance.OnReactComponentEvent({
      type: 'chooseBranch',
      payload: { choiceKey: 'analytics' },
    });
    expect(choiceSpy).toHaveBeenCalledWith({ StepKey: 'embed-comp-1', ChoiceKey: 'analytics' });

    fixture.componentInstance.OnReactComponentEvent({
      type: 'completeStep',
      payload: { completed: true },
    });
    expect(customSignalSpy).toHaveBeenCalledWith(
      expect.objectContaining({ SignalKey: 'tours.custom.done', Payload: { completed: true } }),
    );
    expect(nextSpy).toHaveBeenCalledWith({ StepKey: 'embed-comp-1', Data: { completed: true } });
    sub.unsubscribe();
  });

  it('handles Continue/Back/Dismiss footer actions and omits aria-describedby when Body is empty', () => {
    const step = makeEmbeddedStep(
      { componentSpec: makeSpec(), AllowNextButtonFallback: true },
      { Body: '' },
    );
    const fixture = TestBed.createComponent(EmbeddedComponentStepRenderer);
    fixture.componentRef.setInput('Step', step);
    fixture.componentRef.setInput('Session', makeSession(step, true));
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.getAttribute('aria-describedby')).toBeNull();

    const nextSpy = vi.fn();
    const backSpy = vi.fn();
    const dismissSpy = vi.fn();
    fixture.componentInstance.NextRequested.subscribe(nextSpy);
    fixture.componentInstance.BackRequested.subscribe(backSpy);
    fixture.componentInstance.DismissRequested.subscribe(dismissSpy);

    const backBtn = fixture.nativeElement.querySelector('button[variant="secondary"]') as HTMLButtonElement;
    const nextBtn = fixture.nativeElement.querySelector('button[variant="primary"]') as HTMLButtonElement;
    const dismissBtn = fixture.nativeElement.querySelector('button[variant="flat"]') as HTMLButtonElement;

    backBtn.click();
    nextBtn.click();
    dismissBtn.click();

    expect(backSpy).toHaveBeenCalledWith({ StepKey: 'embed-comp-1' });
    expect(nextSpy).toHaveBeenCalledWith({ StepKey: 'embed-comp-1' });
    expect(dismissSpy).toHaveBeenCalledWith({ StepKey: 'embed-comp-1' });
  });
});
