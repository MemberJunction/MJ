import { Component, TemplateRef, ViewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { TourSessionView, TourStepView } from '@memberjunction/tours-runtime';
import { describe, expect, it, vi } from 'vitest';
import { TourVoiceDockComponent, type TourVoiceBarContext } from './tour-voice-dock.component';

function makeStep(overrides: Partial<TourStepView> = {}): TourStepView {
  return {
    StepKey: 'step-1',
    Sequence: 10,
    StepIndex: 0,
    TotalSteps: 3,
    StepType: 'Spotlight',
    Title: 'Spotlight Step',
    Body: 'Body copy',
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

function makeSession(step: TourStepView, overrides: Partial<TourSessionView> = {}): TourSessionView {
  return {
    RunID: 'run-dock-1',
    TourKey: 'core.dock',
    TourName: 'Voice Dock Tour',
    TourVersionID: 'ver-1',
    Status: 'In Progress',
    GuideMode: 'Visual',
    DirectorType: 'Visual',
    PresenterClass: 'Overlay',
    CurrentStep: step,
    CompletedStepKeys: [],
    PathTaken: [step.StepKey],
    CanGoBack: false,
    CanAdvance: true,
    StepIndex: step.StepIndex,
    StepCount: step.TotalSteps,
    IsPaused: false,
    GoalMet: false,
    ...overrides,
  };
}

@Component({
  standalone: true,
  imports: [TourVoiceDockComponent],
  template: `
    <ng-template #voiceBar let-session let-onDemo="OnDemonstrate" let-onConfirm="OnConfirmMutation" let-onCancel="OnCancelMutation">
      <div class="dock-custom-bar">
        <span class="dock-tour-name">{{ session.TourName }}</span>
        <button type="button" class="dock-demo-btn" (click)="onDemo()">Show me</button>
        <button type="button" class="dock-tpl-confirm" (click)="onConfirm()">Confirm tpl</button>
        <button type="button" class="dock-tpl-cancel" (click)="onCancel()">Cancel tpl</button>
      </div>
    </ng-template>
    <mj-tour-voice-dock
      [Session]="Session"
      [VoiceBarTemplate]="voiceBarTpl"
      [VoiceGuideAvailable]="VoiceGuideAvailable"
      [VoiceGuideActive]="VoiceGuideActive"
      (VoiceGuideRequested)="OnVoiceGuideRequested($event)"
      (DemonstrateRequested)="OnDemonstrateRequested($event)"
      (ConfirmMutation)="OnConfirmMutation()"
      (CancelMutation)="OnCancelMutation()"
    />
  `,
})
class VoiceDockHostComponent {
  @ViewChild('voiceBar', { static: true }) public voiceBarTpl!: TemplateRef<TourVoiceBarContext>;
  public Session: TourSessionView | null = null;
  public VoiceGuideAvailable = true;
  public VoiceGuideActive = false;

  public VoiceGuideRequestedSpy = vi.fn();
  public DemonstrateRequestedSpy = vi.fn();
  public ConfirmMutationSpy = vi.fn();
  public CancelMutationSpy = vi.fn();

  public OnVoiceGuideRequested(val: boolean): void {
    this.VoiceGuideRequestedSpy(val);
  }

  public OnDemonstrateRequested(evt: { ConfirmedMutation?: boolean }): void {
    this.DemonstrateRequestedSpy(evt);
  }

  public OnConfirmMutation(): void {
    this.ConfirmMutationSpy();
  }

  public OnCancelMutation(): void {
    this.CancelMutationSpy();
  }
}

describe('TourVoiceDockComponent', () => {
  it('renders Walk through with Sage opt-in button on non-welcome steps and emits VoiceGuideRequested', () => {
    const fixture = TestBed.createComponent(VoiceDockHostComponent);
    fixture.componentInstance.Session = makeSession(makeStep());
    fixture.componentInstance.VoiceGuideAvailable = true;
    fixture.componentInstance.VoiceGuideActive = false;
    fixture.detectChanges();

    const optInBtn = fixture.nativeElement.querySelector('.mjt-sage-launch-btn') as HTMLButtonElement;
    expect(optInBtn).not.toBeNull();
    expect(optInBtn.textContent).toContain('Walk through with Sage');

    optInBtn.click();
    expect(fixture.componentInstance.VoiceGuideRequestedSpy).toHaveBeenCalledWith(true);
  });

  it('hides opt-in dock on welcome Modal steps so mode selector is not duplicated', () => {
    const fixture = TestBed.createComponent(VoiceDockHostComponent);
    fixture.componentInstance.Session = makeSession(
      makeStep({ StepType: 'Modal', Configuration: { Variant: 'welcome' } }),
    );
    fixture.componentInstance.VoiceGuideAvailable = true;
    fixture.componentInstance.VoiceGuideActive = false;
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.mjt-voice-dock')).toBeNull();
  });

  it('renders PendingDemonstrationConfirmation alertdialog and VoiceBarTemplate callbacks (DemonstrateRequested, ConfirmMutation, CancelMutation)', () => {
    const fixture = TestBed.createComponent(VoiceDockHostComponent);
    fixture.componentInstance.VoiceGuideActive = true;
    fixture.componentInstance.Session = makeSession(makeStep(), {
      PendingDemonstrationConfirmation: {
        StepKey: 'step-1',
        Prompt: 'Allow Sage to submit this filter?',
      },
    });
    fixture.detectChanges();

    const confirmBar = fixture.nativeElement.querySelector('.mjt-confirm-bar') as HTMLElement;
    expect(confirmBar).not.toBeNull();
    expect(confirmBar.getAttribute('role')).toBe('alertdialog');
    expect(confirmBar.getAttribute('aria-label')).toBe('Confirm Sage action');
    expect(confirmBar.textContent).toContain('Allow Sage to submit this filter?');

    const actionBtns = confirmBar.querySelectorAll('.mjt-confirm-actions button') as NodeListOf<HTMLButtonElement>;
    actionBtns[0].click();
    expect(fixture.componentInstance.ConfirmMutationSpy).toHaveBeenCalledTimes(1);

    actionBtns[1].click();
    expect(fixture.componentInstance.CancelMutationSpy).toHaveBeenCalledTimes(1);

    const demoBtn = fixture.nativeElement.querySelector('.dock-demo-btn') as HTMLButtonElement;
    demoBtn.click();
    expect(fixture.componentInstance.DemonstrateRequestedSpy).toHaveBeenCalledWith({});
  });
});
