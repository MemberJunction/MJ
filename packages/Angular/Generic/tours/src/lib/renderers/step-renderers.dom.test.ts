import { Component, TemplateRef, ViewChild } from '@angular/core';
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
import { AnchorRegistry } from '../anchors/anchor-registry';
import { TourSpotlightOverlayComponent } from '../overlay/tour-spotlight-overlay.component';
import { OverlayTourPresenterComponent } from '../presenters/overlay-tour-presenter.component';
import { TourVoiceDockComponent, type TourVoiceBarContext } from '../presenters/tour-voice-dock.component';
import { ActionStepRenderer } from './action-step-renderer.component';
import { BeaconStepRenderer } from './beacon-step-renderer.component';
import { ChoiceStepRenderer } from './choice-step-renderer.component';
import { MediaStepRenderer } from './chunks/media-step-renderer.component';
import { EmbeddedComponentStepRenderer } from './chunks/embedded-component-step-renderer.component';
import { ModalStepRenderer } from './modal-step-renderer.component';
import { SpotlightStepRenderer } from './spotlight-step-renderer.component';
import { CreateTourShellElementClass } from '../../shell/shell-element';

@Component({
  standalone: true,
  imports: [TourVoiceDockComponent],
  template: `
    <ng-template #voiceBar let-session let-onDemo="OnDemonstrate">
      <div class="test-sage-bar">
        <span class="test-sage-tour">{{ session.TourName }}</span>
        <button type="button" class="test-show-me-btn" (click)="onDemo()">Show me</button>
      </div>
    </ng-template>
    <mj-tour-voice-dock
      [Session]="Session"
      [VoiceBarTemplate]="voiceBarTpl"
      [VoiceGuideAvailable]="true"
      [VoiceGuideActive]="VoiceActive"
      (DemonstrateRequested)="OnDemonstrate($event)"
      (ConfirmMutation)="OnConfirm()"
      (CancelMutation)="OnCancel()"
    />
  `,
})
class VoiceDockHostTestComponent {
  @ViewChild('voiceBar', { static: true }) public voiceBarTpl!: TemplateRef<TourVoiceBarContext>;
  public Session!: TourSessionView;
  public VoiceActive = true;
  public Demonstrated = vi.fn();
  public Confirmed = vi.fn();
  public Cancelled = vi.fn();

  public OnDemonstrate(evt: { ConfirmedMutation?: boolean }): void {
    this.Demonstrated(evt);
  }
  public OnConfirm(): void {
    this.Confirmed();
  }
  public OnCancel(): void {
    this.Cancelled();
  }
}

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

    // Verify close button never steals initial focus on open
    const closeBtn = fixture.nativeElement.querySelector('.mjt-close-btn') as HTMLButtonElement;
    expect(document.activeElement).not.toBe(closeBtn);

    const results = await axe.run(fixture.nativeElement, {
      rules: {
        'color-contrast': { enabled: false },
      },
    });
    expect(results.violations).toEqual([]);
  });

  it('renders segmented progress rail and jumps back to completed steps when clicked', () => {
    const step = makeStepView('Spotlight', { ShowProgress: true }, { StepKey: 'step-2', StepIndex: 1, TotalSteps: 3 });
    const session: TourSessionView = {
      ...makeSessionView(step),
      CompletedStepKeys: ['step-1'],
      PathTaken: ['step-1', 'step-2'],
      StepIndex: 1,
      StepCount: 3,
    };

    const fixture = TestBed.createComponent(SpotlightStepRenderer);
    fixture.componentInstance.Step = step;
    fixture.componentInstance.Session = session;
    fixture.detectChanges();

    const segments = fixture.nativeElement.querySelectorAll('.mjt-progress-segment') as NodeListOf<HTMLButtonElement>;
    expect(segments.length).toBe(3);
    expect(segments[0].classList.contains('mjt-progress-segment--done')).toBe(true);
    expect(segments[1].classList.contains('mjt-progress-segment--active')).toBe(true);
    expect(segments[0].disabled).toBe(false);

    const stepSelectedSpy = vi.fn();
    fixture.componentInstance.StepSelected.subscribe(stepSelectedSpy);
    segments[0].click();
    expect(stepSelectedSpy).toHaveBeenCalledWith('step-1');
  });

  it('ChoiceStepRenderer selects branching card on keyboard 1-9 keydown', () => {
    const step = makeStepView('Choice', {
      Options: [
        { Key: 'grids', Label: 'Explore Data', Description: 'Saved views & exports' },
        { Key: 'sage', Label: 'Collaborate with Sage', Description: 'Ask natural questions' },
      ],
    });
    const fixture = TestBed.createComponent(ChoiceStepRenderer);
    fixture.componentInstance.Step = step;
    fixture.componentInstance.Session = makeSessionView(step);
    fixture.detectChanges();

    const choiceSpy = vi.fn();
    fixture.componentInstance.ChoiceMade.subscribe(choiceSpy);

    const kbdBadges = fixture.nativeElement.querySelectorAll('.mjt-choice-option .mjt-kbd');
    expect(kbdBadges.length).toBe(2);
    expect(kbdBadges[1].textContent?.trim()).toBe('2');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }));
    expect(choiceSpy).toHaveBeenCalledWith({ StepKey: 'step-1', ChoiceKey: 'sage', IsCorrect: undefined });
  });

  it('ModalStepRenderer shows welcome mode selector when VoiceGuideAvailable and toggles Sage mode on start', () => {
    const step = makeStepView<IModalStepConfig & ITourStepConfiguration>('Modal', {
      Variant: 'welcome',
      PrimaryButtonText: 'Start Tour',
    });
    const fixture = TestBed.createComponent(ModalStepRenderer);
    fixture.componentInstance.Step = step;
    fixture.componentInstance.Session = makeSessionView(step);
    fixture.componentInstance.VoiceGuideAvailable = true;
    fixture.componentInstance.EstimatedMinutes = 2;
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('~2 min');
    expect(fixture.nativeElement.textContent).toContain('Walk through with');
    expect(fixture.nativeElement.textContent).toContain('Sage');
    expect(fixture.nativeElement.textContent.toLowerCase()).not.toContain('co-pilot');

    const modeCards = fixture.nativeElement.querySelectorAll('.mjt-mode-card') as NodeListOf<HTMLButtonElement>;
    expect(modeCards.length).toBe(2);
    modeCards[1].click();
    fixture.detectChanges();

    const voiceToggledSpy = vi.fn();
    const nextSpy = vi.fn();
    fixture.componentInstance.VoiceGuideToggled.subscribe(voiceToggledSpy);
    fixture.componentInstance.NextRequested.subscribe(nextSpy);

    const startBtn = fixture.nativeElement.querySelector('button[variant="primary"]') as HTMLButtonElement;
    startBtn.click();
    expect(voiceToggledSpy).toHaveBeenCalledWith(true);
    expect(nextSpy).toHaveBeenCalledWith({ StepKey: 'step-1' });
  });

  it('TourVoiceDockComponent renders projected VoiceBarTemplate and PendingDemonstrationConfirmation Confirm/Cancel flow', () => {
    const step = makeStepView('Spotlight', { ShowProgress: true });
    const fixture = TestBed.createComponent(VoiceDockHostTestComponent);
    fixture.componentInstance.Session = {
      ...makeSessionView(step),
      PendingDemonstrationConfirmation: {
        StepKey: 'step-1',
        Prompt: 'Allow Sage to click Filter for you?',
      },
    };
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.test-sage-bar')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Allow Sage to click Filter for you?');

    const showMeBtn = fixture.nativeElement.querySelector('.test-show-me-btn') as HTMLButtonElement;
    showMeBtn.click();
    expect(fixture.componentInstance.Demonstrated).toHaveBeenCalled();

    const confirmBtn = fixture.nativeElement.querySelector('.mjt-confirm-actions button') as HTMLButtonElement;
    confirmBtn.click();
    expect(fixture.componentInstance.Confirmed).toHaveBeenCalled();

    const cancelBtn = fixture.nativeElement.querySelectorAll('.mjt-confirm-actions button')[1] as HTMLButtonElement;
    cancelBtn.click();
    expect(fixture.componentInstance.Cancelled).toHaveBeenCalled();
  });

  it('OverlayTourPresenterComponent renders secondary Sage PointerHighlight ring + caption and double-halo spotlight', async () => {
    const primaryTarget = document.createElement('button');
    primaryTarget.textContent = 'Filter';
    const pointerTarget = document.createElement('button');
    pointerTarget.setAttribute('data-mj-tour-anchor', 'core.export');
    pointerTarget.textContent = 'Export';
    document.body.append(primaryTarget, pointerTarget);

    const step = makeStepView(
      'Spotlight',
      { ShowProgress: true },
      { Anchor: { Strategy: 'Registered', Key: 'core.filter' } },
    );
    const session: TourSessionView = {
      ...makeSessionView(step),
      PointerHighlight: {
        AnchorKey: 'core.export',
        Caption: 'You can also export any view here.',
      },
    };

    const fixture = TestBed.createComponent(OverlayTourPresenterComponent);
    fixture.componentRef.setInput('Session', session);
    fixture.componentRef.setInput('AnchorElement', primaryTarget);
    fixture.detectChanges();

    await new Promise((r) => setTimeout(r, 20));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.mjt-spotlight-halo')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.mjt-spotlight-ring')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.mjt-pointer-ring')).not.toBeNull();
    const caption = fixture.nativeElement.querySelector('.mjt-pointer-caption') as HTMLElement;
    expect(caption?.textContent).toContain('You can also export any view here.');

    AnchorRegistry.Instance.UnregisterAnchor('core.export', pointerTarget);
    fixture.destroy();
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

  it('TourSpotlightOverlayComponent updates SVG evenodd cutout path when Cutouts input changes across steps', () => {
    const fixture = TestBed.createComponent(TourSpotlightOverlayComponent);
    fixture.componentRef.setInput('Visible', true);
    fixture.componentRef.setInput('ViewportWidth', 1440);
    fixture.componentRef.setInput('ViewportHeight', 900);
    fixture.componentRef.setInput('Cutouts', [{ X: 24, Y: 12, Width: 140, Height: 36, Radius: 8 }]);
    fixture.detectChanges();

    const pathEl = fixture.nativeElement.querySelector('path.mjt-spotlight-path') as SVGPathElement;
    const firstD = pathEl.getAttribute('d') ?? '';
    expect(firstD).toContain('M32,12');

    fixture.componentRef.setInput('Cutouts', [{ X: 820, Y: 12, Width: 280, Height: 36, Radius: 8 }]);
    fixture.detectChanges();

    const secondD = pathEl.getAttribute('d') ?? '';
    expect(secondD).not.toBe(firstD);
    expect(secondD).toContain('M828,12');
  });
});
