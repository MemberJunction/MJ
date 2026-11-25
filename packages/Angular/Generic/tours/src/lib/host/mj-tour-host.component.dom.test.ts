import { Component, TemplateRef, ViewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { TourDefinition, TourSessionEventArgs, TourSessionView } from '@memberjunction/tours-runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TourVoiceBarContext } from '../presenters/tour-voice-dock.component';
import { MJTourHostComponent, type TourPendingOffer } from './mj-tour-host.component';

@Component({
  standalone: true,
  imports: [MJTourHostComponent],
  template: `
    <ng-template #voiceBar let-session let-onDemo="OnDemonstrate">
      <div class="host-test-voice-bar">
        <span>{{ session.TourName }}</span>
        <button type="button" class="host-demo-btn" (click)="onDemo()">Demo</button>
      </div>
    </ng-template>
    <mj-tour-host
      [Definitions]="Definitions"
      [PendingOffer]="PendingOffer"
      [VoiceBarTemplate]="voiceBarTpl"
      [VoiceGuideAvailable]="VoiceGuideAvailable"
      [VoiceGuideActive]="VoiceGuideActive"
      (TourEvent)="OnTourEvent($event)"
      (SessionChanged)="OnSessionChanged($event)"
      (VoiceGuideRequested)="OnVoiceGuideRequested($event)"
      (DemonstrateRequested)="OnDemonstrateRequested($event)"
      (OfferAccepted)="OnOfferAccepted($event)"
      (OfferDismissed)="OnOfferDismissed($event)"
    />
  `,
})
class HostWrapperTestComponent {
  @ViewChild(MJTourHostComponent, { static: true }) public Host!: MJTourHostComponent;
  @ViewChild('voiceBar', { static: true }) public voiceBarTpl!: TemplateRef<TourVoiceBarContext>;

  public Definitions: TourDefinition[] | null = null;
  public PendingOffer: TourPendingOffer | null = null;
  public VoiceGuideAvailable = true;
  public VoiceGuideActive = true;

  public TourEvents: TourSessionEventArgs[] = [];
  public SessionChanges: Array<TourSessionView | null> = [];
  public VoiceGuideRequests: boolean[] = [];
  public DemonstrateRequests: Array<{ ConfirmedMutation?: boolean }> = [];
  public AcceptedOffers: string[] = [];
  public DismissedOffers: string[] = [];

  public OnTourEvent(evt: TourSessionEventArgs): void {
    this.TourEvents.push(evt);
  }

  public OnSessionChanged(view: TourSessionView | null): void {
    this.SessionChanges.push(view);
  }

  public OnVoiceGuideRequested(enabled: boolean): void {
    this.VoiceGuideRequests.push(enabled);
  }

  public OnDemonstrateRequested(evt: { ConfirmedMutation?: boolean }): void {
    this.DemonstrateRequests.push(evt);
  }

  public OnOfferAccepted(tourKey: string): void {
    this.AcceptedOffers.push(tourKey);
  }

  public OnOfferDismissed(tourKey: string): void {
    this.DismissedOffers.push(tourKey);
  }
}

function makeInlineTour(): TourDefinition {
  return {
    TourKey: 'core.host-test',
    Name: 'Host Test Tour',
    Status: 'Active',
    PresenterClass: 'Embedded',
    EstimatedMinutes: 2,
    Steps: [
      {
        StepKey: 'welcome',
        Sequence: 10,
        StepType: 'Spotlight',
        Title: 'First Step',
        Body: 'Welcome to host test.',
        Mode: 'Guide',
      },
      {
        StepKey: 'finish',
        Sequence: 20,
        StepType: 'Spotlight',
        Title: 'Second Step',
        Body: 'Almost done.',
        Mode: 'Guide',
      },
    ],
  };
}

describe('MJTourHostComponent', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders PendingOffer toast when idle and emits OfferAccepted and OfferDismissed', () => {
    const fixture = TestBed.createComponent(HostWrapperTestComponent);
    fixture.componentInstance.PendingOffer = {
      TourKey: 'core.welcome',
      Title: 'Explore Dashboard Tour',
      Description: 'Learn key shortcuts quickly.',
      EstimatedMinutes: 3,
      StepCount: 4,
      Delivery: 'Offer',
    };
    fixture.detectChanges();

    const toast = fixture.nativeElement.querySelector('.mjt-offer-toast') as HTMLElement;
    expect(toast).not.toBeNull();
    expect(toast.getAttribute('role')).toBe('region');
    expect(toast.textContent).toContain('Explore Dashboard Tour');
    expect(toast.textContent).toContain('~3 min');

    const buttons = toast.querySelectorAll('.mjt-offer-actions button') as NodeListOf<HTMLButtonElement>;
    buttons[0].click();
    expect(fixture.componentInstance.AcceptedOffers).toEqual(['core.welcome']);

    buttons[1].click();
    expect(fixture.componentInstance.DismissedOffers).toEqual(['core.welcome']);

    const closeBtn = toast.querySelector('.mjt-close-btn') as HTMLButtonElement;
    closeBtn.click();
    expect(fixture.componentInstance.DismissedOffers).toEqual(['core.welcome', 'core.welcome']);
    fixture.destroy();
  });

  it('starts an inline tour, emits TourEvent & SessionChanged, and hides PendingOffer while active', async () => {
    const fixture = TestBed.createComponent(HostWrapperTestComponent);
    fixture.componentInstance.Definitions = [makeInlineTour()];
    fixture.componentInstance.PendingOffer = {
      TourKey: 'core.host-test',
      Title: 'Suggested Tour',
      Delivery: 'Offer',
    };
    fixture.detectChanges();

    const started = await fixture.componentInstance.Host.Start('core.host-test');
    expect(started).toBe(true);

    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 25));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.mjt-offer-toast')).toBeNull();
    expect(fixture.componentInstance.TourEvents.some((e) => e.EventName === 'AfterTourStart')).toBe(true);
    expect(fixture.componentInstance.SessionChanges.some((s) => s?.TourKey === 'core.host-test')).toBe(true);
    expect(fixture.nativeElement.querySelector('.mjt-embedded-card')).not.toBeNull();

    await fixture.componentInstance.Host.Stop('test-done');
    fixture.detectChanges();
    expect(fixture.componentInstance.Host.ActiveSession).toBeNull();
    fixture.destroy();
  });

  it('forwards VoiceGuideRequested and DemonstrateRequested from mounted presenter and voice dock', async () => {
    const fixture = TestBed.createComponent(HostWrapperTestComponent);
    fixture.componentInstance.Definitions = [makeInlineTour()];
    fixture.componentInstance.VoiceGuideAvailable = true;
    fixture.componentInstance.VoiceGuideActive = true;
    fixture.detectChanges();

    await fixture.componentInstance.Host.Start('core.host-test');
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 25));
    fixture.detectChanges();

    const demoBtn = fixture.nativeElement.querySelector('.host-demo-btn') as HTMLButtonElement;
    expect(demoBtn).not.toBeNull();
    demoBtn.click();
    expect(fixture.componentInstance.DemonstrateRequests.length).toBe(1);

    fixture.componentInstance.VoiceGuideActive = false;
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 10));
    fixture.detectChanges();

    const optInBtn = fixture.nativeElement.querySelector('.mjt-sage-launch-btn') as HTMLButtonElement;
    expect(optInBtn).not.toBeNull();
    optInBtn.click();
    expect(fixture.componentInstance.VoiceGuideRequests).toEqual([true]);

    const signalSpy = vi.fn();
    const unsub = fixture.componentInstance.Host.On('AfterTourEnd', signalSpy);
    await fixture.componentInstance.Host.Stop('user');
    expect(signalSpy).toHaveBeenCalled();
    unsub();
    fixture.destroy();
  });
});
