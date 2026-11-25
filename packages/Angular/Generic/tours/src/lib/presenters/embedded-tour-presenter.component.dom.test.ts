import { Component, TemplateRef, ViewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { TourSessionView, TourStepView } from '@memberjunction/tours-runtime';
import { describe, expect, it, vi } from 'vitest';
import { EmbeddedTourPresenterComponent } from './embedded-tour-presenter.component';
import type { TourVoiceBarContext } from './tour-voice-dock.component';

function makeStep(overrides: Partial<TourStepView> = {}): TourStepView {
  return {
    StepKey: 'embed-step-1',
    Sequence: 10,
    StepIndex: 0,
    TotalSteps: 2,
    StepType: 'Spotlight',
    Title: 'Embedded Step Title',
    Body: 'Inline embedded body.',
    Placement: 'bottom',
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
    RunID: 'run-embed-1',
    TourKey: 'core.embed',
    TourName: 'Embedded Tour',
    TourVersionID: 'ver-1',
    Status: 'In Progress',
    GuideMode: 'Visual',
    DirectorType: 'Visual',
    PresenterClass: 'Embedded',
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

@Component({
  standalone: true,
  imports: [EmbeddedTourPresenterComponent],
  template: `
    <ng-template #voiceBar let-session let-onDemo="OnDemonstrate">
      <div class="embed-voice-bar">
        <span>{{ session.TourName }}</span>
        <button type="button" class="embed-demo-btn" (click)="onDemo()">Demo</button>
      </div>
    </ng-template>
    <mj-tour-embedded-presenter
      [Session]="Session"
      [LiveAnnouncement]="Announcement"
      [VoiceBarTemplate]="voiceBarTpl"
      [VoiceGuideAvailable]="true"
      [VoiceGuideActive]="VoiceActive"
    />
  `,
})
class EmbeddedPresenterHostComponent {
  @ViewChild(EmbeddedTourPresenterComponent, { static: true })
  public Presenter!: EmbeddedTourPresenterComponent;
  @ViewChild('voiceBar', { static: true })
  public voiceBarTpl!: TemplateRef<TourVoiceBarContext>;

  public Session: TourSessionView | null = null;
  public Announcement = '';
  public VoiceActive = false;
}

describe('EmbeddedTourPresenterComponent', () => {
  it('renders live region, hairline progress, step renderer, and forwards step actions', async () => {
    const fixture = TestBed.createComponent(EmbeddedPresenterHostComponent);
    const step = makeStep();
    fixture.componentInstance.Session = makeSession(step);
    fixture.componentInstance.Announcement = 'Step 1 of 2: Embedded Step Title';
    fixture.detectChanges();

    await new Promise((resolve) => setTimeout(resolve, 20));
    fixture.detectChanges();

    const liveRegion = fixture.nativeElement.querySelector('.mjt-live-region') as HTMLElement;
    expect(liveRegion.getAttribute('aria-live')).toBe('polite');
    expect(liveRegion.textContent).toContain('Step 1 of 2: Embedded Step Title');

    expect(fixture.nativeElement.querySelector('mj-tour-card-hairline')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('mj-tour-spotlight-step')).not.toBeNull();

    const nextSpy = vi.fn();
    const backSpy = vi.fn();
    const dismissSpy = vi.fn();
    fixture.componentInstance.Presenter.NextRequested.subscribe(nextSpy);
    fixture.componentInstance.Presenter.BackRequested.subscribe(backSpy);
    fixture.componentInstance.Presenter.DismissRequested.subscribe(dismissSpy);

    const primaryBtn = fixture.nativeElement.querySelector('mj-tour-spotlight-step button[variant="primary"]') as HTMLButtonElement;
    const backBtn = fixture.nativeElement.querySelector('mj-tour-spotlight-step button[variant="secondary"]') as HTMLButtonElement;
    const dismissBtn = fixture.nativeElement.querySelector('mj-tour-spotlight-step button[variant="flat"]') as HTMLButtonElement;

    primaryBtn.click();
    backBtn.click();
    dismissBtn.click();

    expect(nextSpy).toHaveBeenCalledWith({ StepKey: 'embed-step-1' });
    expect(backSpy).toHaveBeenCalledWith({ StepKey: 'embed-step-1' });
    expect(dismissSpy).toHaveBeenCalledWith({ StepKey: 'embed-step-1' });
  });

  it('forwards VoiceGuideRequested and DemonstrateRequested from embedded voice dock', async () => {
    const fixture = TestBed.createComponent(EmbeddedPresenterHostComponent);
    const step = makeStep();
    fixture.componentInstance.Session = makeSession(step);
    fixture.componentInstance.VoiceActive = false;
    fixture.detectChanges();

    await new Promise((resolve) => setTimeout(resolve, 20));
    fixture.detectChanges();

    const voiceSpy = vi.fn();
    const demoSpy = vi.fn();
    fixture.componentInstance.Presenter.VoiceGuideRequested.subscribe(voiceSpy);
    fixture.componentInstance.Presenter.DemonstrateRequested.subscribe(demoSpy);

    const optInBtn = fixture.nativeElement.querySelector('.mjt-sage-launch-btn') as HTMLButtonElement;
    optInBtn.click();
    expect(voiceSpy).toHaveBeenCalledWith(true);

    fixture.componentInstance.VoiceActive = true;
    fixture.detectChanges();

    const demoBtn = fixture.nativeElement.querySelector('.embed-demo-btn') as HTMLButtonElement;
    demoBtn.click();
    expect(demoSpy).toHaveBeenCalledWith({});
  });

  it('mounts new renderer when StepKey changes and tears down card when Session becomes null', async () => {
    const fixture = TestBed.createComponent(EmbeddedTourPresenterComponent);
    const step1 = makeStep({ StepKey: 'embed-step-1', Title: 'Original Title' });
    fixture.componentRef.setInput('Session', makeSession(step1));
    fixture.detectChanges();

    await new Promise((resolve) => setTimeout(resolve, 20));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Original Title');

    const step2 = makeStep({
      StepKey: 'embed-step-2',
      StepIndex: 1,
      StepType: 'Action',
      Title: 'Second Embedded Step',
    });
    fixture.componentRef.setInput('Session', makeSession(step2));
    fixture.detectChanges();

    await new Promise((resolve) => setTimeout(resolve, 20));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('mj-tour-action-step')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Second Embedded Step');

    fixture.componentRef.setInput('Session', null);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.mjt-embedded-card')).toBeNull();
  });
});
