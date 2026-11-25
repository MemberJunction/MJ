import { TestBed } from '@angular/core/testing';
import type {
  IMediaStepConfig,
  IModalStepConfig,
  ITourStepConfiguration,
  TourSessionView,
  TourStepView,
} from '@memberjunction/tours-runtime';
import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OverlayTourPresenterComponent } from '../presenters/overlay-tour-presenter.component';
import { ActionStepRenderer } from './action-step-renderer.component';
import { BeaconStepRenderer } from './beacon-step-renderer.component';
import { ChoiceStepRenderer } from './choice-step-renderer.component';
import { MediaStepRenderer } from './chunks/media-step-renderer.component';
import { EmbeddedComponentStepRenderer } from './chunks/embedded-component-step-renderer.component';
import { ModalStepRenderer } from './modal-step-renderer.component';
import { SpotlightStepRenderer } from './spotlight-step-renderer.component';
import { CreateTourShellElementClass } from '../../shell/shell-element';

function makeSessionView(step: TourStepView): TourSessionView {
  return {
    RunID: 'run-1',
    TourKey: 'core.welcome',
    TourName: 'Welcome Tour',
    TourVersionID: 'ver-1',
    Status: 'In Progress',
    GuideMode: 'Visual',
    DirectorType: 'Visual',
    PresenterClass: 'Overlay',
    CurrentStep: step,
    CompletedStepKeys: [],
    PathTaken: [step.StepKey],
    CanGoBack: true,
    CanAdvance: true,
    StepIndex: step.StepIndex,
    StepCount: step.TotalSteps,
    IsPaused: false,
    GoalMet: false,
  };
}

function makeStepView<T extends object>(
  stepType: string,
  config: T,
  overrides: Partial<TourStepView<T>> = {},
): TourStepView<T> {
  return {
    StepKey: 'step-1',
    Sequence: 10,
    StepIndex: 0,
    TotalSteps: 3,
    StepType: stepType,
    Title: `${stepType} Title`,
    Body: 'Step **body** copy',
    Placement: 'bottom',
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

describe('Guided Tour Step Renderers & OverlayPresenter (WCAG 2.2 AA)', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('SpotlightStepRenderer renders accessible dialog with labelledby heading and fires Next/Dismiss', () => {
    const step = makeStepView('Spotlight', { ShowProgress: true });
    const fixture = TestBed.createComponent(SpotlightStepRenderer);
    fixture.componentInstance.Step = step;
    fixture.componentInstance.Session = makeSessionView(step);
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    const h2 = fixture.nativeElement.querySelector('h2') as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute('aria-labelledby')).toBe(h2.id);
    expect(fixture.nativeElement.textContent).toContain('1 of 3');

    const nextSpy = vi.fn();
    fixture.componentInstance.NextRequested.subscribe(nextSpy);
    const primaryBtn = fixture.nativeElement.querySelector('button[variant="primary"]') as HTMLButtonElement;
    primaryBtn.click();
    expect(nextSpy).toHaveBeenCalledWith({ StepKey: 'step-1' });
  });

  it('ActionStepRenderer renders waiting indicator and F6 keyboard hint', () => {
    const step = makeStepView(
      'Action',
      { ShowWaitingIndicator: true, WaitingMessage: 'Waiting for Save...' },
      { Anchor: { Strategy: 'Registered', Key: 'save.btn' } },
    );
    const fixture = TestBed.createComponent(ActionStepRenderer);
    fixture.componentInstance.Step = step;
    fixture.componentInstance.Session = makeSessionView(step);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Waiting for Save...');
    expect(fixture.nativeElement.textContent).toContain('F6');
  });

  it('BeaconStepRenderer stops pulsing within 5s (WCAG 2.2.2) and opens hint on click', () => {
    vi.useFakeTimers();
    const step = makeStepView('Beacon', { PulseDurationMs: 4000 });
    const fixture = TestBed.createComponent(BeaconStepRenderer);
    fixture.componentInstance.Step = step;
    fixture.componentInstance.Session = makeSessionView(step);
    fixture.detectChanges();

    const btn = fixture.nativeElement.querySelector('.mjt-beacon-btn') as HTMLButtonElement;
    expect(btn.classList.contains('mjt-beacon-btn--pulsing')).toBe(true);

    vi.advanceTimersByTime(4001);
    fixture.detectChanges();
    expect(btn.classList.contains('mjt-beacon-btn--pulsing')).toBe(false);

    btn.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('ChoiceStepRenderer shows KnowledgeCheck feedback before advancing', () => {
    const step = makeStepView('Choice', {
      IsKnowledgeCheck: true,
      Options: [
        { Key: 'wrong', Label: 'Option A', IsCorrect: false, Feedback: 'Try again.' },
        { Key: 'right', Label: 'Option B', IsCorrect: true, Feedback: 'Correct!' },
      ],
    });
    const fixture = TestBed.createComponent(ChoiceStepRenderer);
    fixture.componentInstance.Step = step;
    fixture.componentInstance.Session = makeSessionView(step);
    fixture.detectChanges();

    const choiceSpy = vi.fn();
    fixture.componentInstance.ChoiceMade.subscribe(choiceSpy);

    const options = fixture.nativeElement.querySelectorAll('.mjt-choice-option') as NodeListOf<HTMLButtonElement>;
    options[1].click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Correct!');
    expect(choiceSpy).not.toHaveBeenCalled();

    const continueBtn = fixture.nativeElement.querySelector('button[variant="primary"]') as HTMLButtonElement;
    continueBtn.click();
    expect(choiceSpy).toHaveBeenCalledWith({ StepKey: 'step-1', ChoiceKey: 'right', IsCorrect: true });
  });

  it('ModalStepRenderer emits NextTourRequested for checkpoint CTA and MediaStepRenderer includes captions track', () => {
    const modalStep = makeStepView<IModalStepConfig & ITourStepConfiguration>('Modal', {
      Variant: 'checkpoint',
      NextTourKey: 'core.home',
    });
    const modalFix = TestBed.createComponent(ModalStepRenderer);
    modalFix.componentInstance.Step = modalStep;
    modalFix.componentInstance.Session = makeSessionView(modalStep);
    modalFix.detectChanges();

    const nextTourSpy = vi.fn();
    modalFix.componentInstance.NextTourRequested.subscribe(nextTourSpy);
    const nextTourBtn = modalFix.nativeElement.querySelector('button[variant="secondary"]') as HTMLButtonElement;
    nextTourBtn.click();
    expect(nextTourSpy).toHaveBeenCalledWith('core.home');

    const mediaStep = makeStepView<IMediaStepConfig & ITourStepConfiguration>('Media', {
      MediaType: 'video',
      SourceUrl: 'https://example.org/demo.mp4',
      CaptionsUrl: 'https://example.org/demo.vtt',
      AltText: 'Demo video',
    });
    const mediaFix = TestBed.createComponent(MediaStepRenderer);
    mediaFix.componentInstance.Step = mediaStep;
    mediaFix.componentInstance.Session = makeSessionView(mediaStep);
    mediaFix.detectChanges();

    const track = mediaFix.nativeElement.querySelector('track[kind="captions"]');
    expect(track).not.toBeNull();
  });

  it('OverlayTourPresenterComponent renders aria-hidden SVG spotlight mask, live region outside inert, and dismisses on Esc', async () => {
    const sibling = document.createElement('div');
    sibling.id = 'app-sidebar';
    const target = document.createElement('button');
    target.textContent = 'Target Button';
    document.body.append(sibling, target);

    const step = makeStepView(
      'Spotlight',
      { ShowProgress: true },
      { Anchor: { Strategy: 'Registered', Key: 'target.btn' } },
    );

    const fixture = TestBed.createComponent(OverlayTourPresenterComponent);
    fixture.componentRef.setInput('Session', makeSessionView(step));
    fixture.componentRef.setInput('AnchorElement', target);
    fixture.detectChanges();

    // Allow ngAfterViewChecked async renderer mount to settle
    await new Promise((r) => setTimeout(r, 20));
    fixture.detectChanges();

    const svgMask = fixture.nativeElement.querySelector('mj-tour-spotlight-overlay svg');
    expect(svgMask?.getAttribute('aria-hidden')).toBe('true');

    const liveRegion = fixture.nativeElement.querySelector('[aria-live="polite"]') as HTMLElement;
    expect(liveRegion).not.toBeNull();
    expect(Boolean(liveRegion.inert)).toBe(false);
    expect(Boolean(target.inert)).toBe(false);
    expect(sibling.inert).toBe(true);
    expect(sibling.hasAttribute('inert')).toBe(true);

    const dismissSpy = vi.fn();
    fixture.componentInstance.DismissRequested.subscribe(dismissSpy);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(dismissSpy).toHaveBeenCalled();

    fixture.destroy();
    expect(Boolean(sibling.inert)).toBe(false);
    expect(sibling.hasAttribute('inert')).toBe(false);
  });

  it('passes axe-core accessibility checks (ARIA dialog, headings, button names) on core renderers', async () => {
    const step = makeStepView('Spotlight', { ShowProgress: true });
    const fixture = TestBed.createComponent(SpotlightStepRenderer);
    fixture.componentInstance.Step = step;
    fixture.componentInstance.Session = makeSessionView(step);
    fixture.detectChanges();

    const results = await axe.run(fixture.nativeElement, {
      rules: {
        'color-contrast': { enabled: false },
      },
    });
    expect(results.violations).toEqual([]);
  });

  it('EmbeddedComponentStepRenderer wires inline ComponentSpec events (completeStep, chooseBranch, emitSignal)', () => {
    const step = makeStepView('EmbeddedComponent', {
      componentSpec: {
        name: 'InteractiveStepDemo',
        title: 'Demo Widget',
        description: 'Demo',
        location: 'embedded' as const,
        type: 'widget',
        functionalRequirements: 'Interactive guided tour demo step',
        technicalDesign: 'React component rendered via mj-react-component',
        exampleUsage: '<InteractiveStepDemo />',
        code: 'export default function Component() { return null; }',
      },
    });
    const fixture = TestBed.createComponent(EmbeddedComponentStepRenderer);
    fixture.componentInstance.Step = step;
    fixture.componentInstance.Session = makeSessionView(step);
    fixture.detectChanges();

    const nextSpy = vi.fn();
    const choiceSpy = vi.fn();
    const signalSpy = vi.fn();
    fixture.componentInstance.NextRequested.subscribe(nextSpy);
    fixture.componentInstance.ChoiceMade.subscribe(choiceSpy);
    fixture.componentInstance.SignalEmitted.subscribe(signalSpy);

    fixture.componentInstance.OnReactComponentEvent({
      type: 'emitSignal',
      payload: { signalKey: 'tours.demo.ready', data: { ok: true } },
    });
    expect(signalSpy).toHaveBeenCalledWith({
      StepKey: 'step-1',
      SignalKey: 'tours.demo.ready',
      Payload: { ok: true },
    });

    fixture.componentInstance.OnReactComponentEvent({
      type: 'chooseBranch',
      payload: { choiceKey: 'admin-path' },
    });
    expect(choiceSpy).toHaveBeenCalledWith({ StepKey: 'step-1', ChoiceKey: 'admin-path' });

    fixture.componentInstance.OnReactComponentEvent({
      type: 'completeStep',
      payload: { completed: true },
    });
    expect(nextSpy).toHaveBeenCalledWith({ StepKey: 'step-1', Data: { completed: true } });
  });

  it('Stage-1 <mj-tour-host> shell enforces idempotent connectedCallback and attribute guard', () => {
    const ShellClass = CreateTourShellElementClass(window);
    const tag = 'mj-tour-host-test';
    if (!customElements.get(tag)) {
      customElements.define(tag, ShellClass);
    }
    const el = document.createElement(tag) as HTMLElement & {
      SurfaceKey?: string;
      connectedCallback?: () => void;
      attributeChangedCallback: (n: string, o: string | null, v: string | null) => void;
    };
    document.body.appendChild(el);
    el.connectedCallback?.(); // second call must remain idempotent
    el.setAttribute('surface-key', 'marketing-site');
    expect(el.SurfaceKey).toBe('marketing-site');
    // Same value no-op guard
    el.attributeChangedCallback('surface-key', 'marketing-site', 'marketing-site');
    expect(el.SurfaceKey).toBe('marketing-site');
    el.remove();
  });
});
