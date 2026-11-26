import { TestBed } from '@angular/core/testing';
import type {
  IBeaconStepConfig,
  ITourStepConfiguration,
  TourSessionView,
  TourStepView,
} from '@memberjunction/tours-runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BeaconStepRenderer } from './beacon-step-renderer.component';

type BeaconStepConfig = IBeaconStepConfig & ITourStepConfiguration;

function makeBeaconStep(
  config: BeaconStepConfig = {},
  overrides: Partial<TourStepView<BeaconStepConfig>> = {},
): TourStepView<BeaconStepConfig> {
  return {
    StepKey: 'beacon-1',
    Sequence: 10,
    StepIndex: 0,
    TotalSteps: 2,
    StepType: 'Beacon',
    Title: 'Export Shortcut',
    Body: 'Export filtered rows to CSV.',
    Placement: 'top-end',
    Mode: 'Guide',
    IsOptional: false,
    Anchor: { Strategy: 'Registered', Key: 'grid.export' },
    AnchorResolved: true,
    AnchorResolution: 'Registered',
    Configuration: config,
    WaitingForCompletion: false,
    ...overrides,
  };
}

function makeSession(step: TourStepView<BeaconStepConfig>): TourSessionView {
  return {
    RunID: 'run-beacon-1',
    TourKey: 'core.beacon',
    TourName: 'Beacon Tour',
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

describe('BeaconStepRenderer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('clamps pulse duration to <= 5000ms (WCAG 2.2.2) and removes mjt-beacon-btn--pulsing class', () => {
    vi.useFakeTimers();
    const step = makeBeaconStep({ PulseDurationMs: 12000 });
    const fixture = TestBed.createComponent(BeaconStepRenderer);
    fixture.componentRef.setInput('Step', step);
    fixture.componentRef.setInput('Session', makeSession(step));
    fixture.detectChanges();

    const btn = fixture.nativeElement.querySelector('.mjt-beacon-btn') as HTMLButtonElement;
    expect(btn.getAttribute('aria-label')).toBe('Hint: Export Shortcut');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(btn.classList.contains('mjt-beacon-btn--pulsing')).toBe(true);

    vi.advanceTimersByTime(5001);
    fixture.detectChanges();
    expect(btn.classList.contains('mjt-beacon-btn--pulsing')).toBe(false);
    fixture.destroy();
  });

  it('toggles hint popover on click, sets aria-expanded/aria-labelledby/aria-describedby, and supports OpenOnHover', () => {
    const step = makeBeaconStep({ OpenOnHover: true });
    const fixture = TestBed.createComponent(BeaconStepRenderer);
    fixture.componentRef.setInput('Step', step);
    fixture.componentRef.setInput('Session', makeSession(step));
    fixture.detectChanges();

    const btn = fixture.nativeElement.querySelector('.mjt-beacon-btn') as HTMLButtonElement;
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();

    btn.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();

    expect(btn.getAttribute('aria-expanded')).toBe('true');
    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    const h2 = fixture.nativeElement.querySelector('h2') as HTMLElement;
    const body = fixture.nativeElement.querySelector('.mjt-body') as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute('aria-labelledby')).toBe(h2.id);
    expect(dialog.getAttribute('aria-describedby')).toBe(body.id);

    btn.click();
    fixture.detectChanges();
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
    fixture.destroy();
  });

  it('emits NextRequested on Got it click and DismissRequested on custom dismiss/close click', () => {
    const step = makeBeaconStep({ DismissButtonText: 'Hide hint' });
    const fixture = TestBed.createComponent(BeaconStepRenderer);
    fixture.componentRef.setInput('Step', step);
    fixture.componentRef.setInput('Session', makeSession(step));
    fixture.detectChanges();

    const btn = fixture.nativeElement.querySelector('.mjt-beacon-btn') as HTMLButtonElement;
    btn.click();
    fixture.detectChanges();

    const nextSpy = vi.fn();
    const dismissSpy = vi.fn();
    fixture.componentInstance.NextRequested.subscribe(nextSpy);
    fixture.componentInstance.DismissRequested.subscribe(dismissSpy);

    const primaryBtn = fixture.nativeElement.querySelector('button[variant="primary"]') as HTMLButtonElement;
    primaryBtn.click();
    expect(nextSpy).toHaveBeenCalledWith({ StepKey: 'beacon-1' });

    const flatBtn = fixture.nativeElement.querySelector('button[variant="flat"]') as HTMLButtonElement;
    expect(flatBtn.textContent?.trim()).toBe('Hide hint');
    flatBtn.click();
    expect(dismissSpy).toHaveBeenCalledWith({ StepKey: 'beacon-1' });
    fixture.destroy();
  });
});
