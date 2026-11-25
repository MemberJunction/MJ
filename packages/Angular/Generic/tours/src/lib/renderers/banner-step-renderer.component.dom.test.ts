import { TestBed } from '@angular/core/testing';
import {
  TourSignals,
  type IBannerStepConfig,
  type ITourStepConfiguration,
  type TourSessionView,
  type TourStepView,
} from '@memberjunction/tours-runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BannerStepRenderer } from './banner-step-renderer.component';

type BannerStepConfig = IBannerStepConfig & ITourStepConfiguration;

function makeBannerStep(
  config: BannerStepConfig = {},
  overrides: Partial<TourStepView<BannerStepConfig>> = {},
): TourStepView<BannerStepConfig> {
  return {
    StepKey: 'banner-1',
    Sequence: 10,
    StepIndex: 0,
    TotalSteps: 2,
    StepType: 'Banner',
    Title: 'New Feature Available',
    Body: 'Try the **updated** filter bar.',
    Placement: 'top',
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

function makeSession(step: TourStepView<BannerStepConfig>): TourSessionView {
  return {
    RunID: 'run-banner-1',
    TourKey: 'core.banner',
    TourName: 'Banner Tour',
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
    StepIndex: 0,
    StepCount: 2,
    IsPaused: false,
    GoalMet: false,
  };
}

describe('BannerStepRenderer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders tone classes (mjt-banner--success, mjt-banner--warning) and ARIA dialog bindings', () => {
    const successStep = makeBannerStep({ Tone: 'success' });
    const fixture = TestBed.createComponent(BannerStepRenderer);
    fixture.componentRef.setInput('Step', successStep);
    fixture.componentRef.setInput('Session', makeSession(successStep));
    fixture.detectChanges();

    const banner = fixture.nativeElement.querySelector('.mjt-banner') as HTMLElement;
    const h2 = fixture.nativeElement.querySelector('h2') as HTMLElement;
    const body = fixture.nativeElement.querySelector('.mjt-body') as HTMLElement;

    expect(banner.getAttribute('role')).toBe('dialog');
    expect(banner.getAttribute('aria-modal')).toBe('false');
    expect(banner.getAttribute('aria-labelledby')).toBe(h2.id);
    expect(banner.getAttribute('aria-describedby')).toBe(body.id);
    expect(banner.classList.contains('mjt-banner--success')).toBe(true);
    expect(banner.classList.contains('mjt-banner--warning')).toBe(false);

    const warningStep = makeBannerStep({ Tone: 'warning' }, { Body: '' });
    fixture.componentRef.setInput('Step', warningStep);
    fixture.componentRef.setInput('Session', makeSession(warningStep));
    fixture.detectChanges();

    expect(banner.classList.contains('mjt-banner--success')).toBe(false);
    expect(banner.classList.contains('mjt-banner--warning')).toBe(true);
    expect(banner.getAttribute('aria-describedby')).toBeNull();
  });

  it('emits SignalEmitted + TourSignals + NextRequested and opens safe https CtaUrl on CTA click', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const tourSignalSpy = vi.fn();
    const sub = TourSignals.Instance.ForKey('tours.banner.cta').subscribe(tourSignalSpy);

    const step = makeBannerStep({
      CtaText: 'Learn More',
      CtaSignalKey: 'tours.banner.cta',
      CtaUrl: 'https://memberjunction.org/docs',
    });
    const fixture = TestBed.createComponent(BannerStepRenderer);
    fixture.componentRef.setInput('Step', step);
    fixture.componentRef.setInput('Session', makeSession(step));
    fixture.detectChanges();

    const signalSpy = vi.fn();
    const nextSpy = vi.fn();
    fixture.componentInstance.SignalEmitted.subscribe(signalSpy);
    fixture.componentInstance.NextRequested.subscribe(nextSpy);

    const ctaBtn = fixture.nativeElement.querySelector('button[variant="primary"]') as HTMLButtonElement;
    expect(ctaBtn.textContent?.trim()).toBe('Learn More');
    ctaBtn.click();

    expect(tourSignalSpy).toHaveBeenCalledWith(
      expect.objectContaining({ SignalKey: 'tours.banner.cta', Payload: { StepKey: 'banner-1' } }),
    );
    expect(signalSpy).toHaveBeenCalledWith({ StepKey: 'banner-1', SignalKey: 'tours.banner.cta' });
    expect(openSpy).toHaveBeenCalledWith('https://memberjunction.org/docs', '_blank', 'noopener,noreferrer');
    expect(nextSpy).toHaveBeenCalledWith({ StepKey: 'banner-1' });
    sub.unsubscribe();
  });

  it('respects Dismissible flag and emits DismissRequested when dismiss button is clicked', () => {
    const dismissibleStep = makeBannerStep({ Dismissible: true });
    const fixture = TestBed.createComponent(BannerStepRenderer);
    fixture.componentRef.setInput('Step', dismissibleStep);
    fixture.componentRef.setInput('Session', makeSession(dismissibleStep));
    fixture.detectChanges();

    const dismissSpy = vi.fn();
    fixture.componentInstance.DismissRequested.subscribe(dismissSpy);
    const dismissBtn = fixture.nativeElement.querySelector('button[variant="flat"]') as HTMLButtonElement;
    dismissBtn.click();
    expect(dismissSpy).toHaveBeenCalledWith({ StepKey: 'banner-1' });

    const nonDismissibleStep = makeBannerStep({ Dismissible: false });
    fixture.componentRef.setInput('Step', nonDismissibleStep);
    fixture.componentRef.setInput('Session', makeSession(nonDismissibleStep));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button[variant="flat"]')).toBeNull();
  });
});
