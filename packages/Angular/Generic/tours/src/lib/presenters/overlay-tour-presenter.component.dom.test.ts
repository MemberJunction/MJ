import { TestBed } from '@angular/core/testing';
import type { TourSessionView, TourStepPlacement, TourStepView } from '@memberjunction/tours-runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnchorRegistry } from '../anchors/anchor-registry';
import { OverlayTourPresenterComponent } from './overlay-tour-presenter.component';

function makeStep(
  stepType: string,
  placement: TourStepPlacement = 'bottom',
  overrides: Partial<TourStepView> = {},
): TourStepView {
  return {
    StepKey: `step-${stepType.toLowerCase()}`,
    Sequence: 10,
    StepIndex: 0,
    TotalSteps: 3,
    StepType: stepType,
    Title: `${stepType} Step`,
    Body: 'Overlay presenter body.',
    Placement: placement,
    Mode: 'Guide',
    IsOptional: false,
    Anchor: { Strategy: 'Registered', Key: 'target.el' },
    AnchorResolved: true,
    AnchorResolution: 'Registered',
    Configuration: { ShowProgress: true },
    WaitingForCompletion: stepType === 'Action',
    ...overrides,
  };
}

function makeSession(step: TourStepView): TourSessionView {
  return {
    RunID: 'run-overlay-1',
    TourKey: 'core.overlay',
    TourName: 'Overlay Tour',
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

function setElementRect(el: HTMLElement, rect: { left: number; top: number; width: number; height: number }): void {
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      x: rect.left,
      y: rect.top,
      toJSON: () => ({}),
    }),
  });
}

describe('OverlayTourPresenterComponent', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders modal Spotlight dialog with SVG mask, applies sibling inert, and restores inert on Esc/destroy', async () => {
    const sibling = document.createElement('div');
    sibling.id = 'app-shell';
    const target = document.createElement('button');
    target.textContent = 'Target';
    setElementRect(target, { left: 200, top: 180, width: 120, height: 40 });
    document.body.append(sibling, target);

    const step = makeStep('Spotlight', 'bottom');
    const fixture = TestBed.createComponent(OverlayTourPresenterComponent);
    fixture.componentRef.setInput('Session', makeSession(step));
    fixture.componentRef.setInput('AnchorElement', target);
    fixture.detectChanges();

    await new Promise((resolve) => setTimeout(resolve, 25));
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('.mjt-dialog') as HTMLElement;
    expect(dialog.classList.contains('mjt-dialog--modal')).toBe(true);
    expect(dialog.classList.contains('mjt-dialog--popover')).toBe(false);
    expect(fixture.nativeElement.querySelector('mj-tour-spotlight-overlay svg')).not.toBeNull();
    expect(sibling.inert).toBe(true);
    expect(Boolean(target.inert)).toBe(false);

    const dismissSpy = vi.fn();
    fixture.componentInstance.DismissRequested.subscribe(dismissSpy);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(dismissSpy).toHaveBeenCalledWith({ StepKey: 'step-spotlight' });

    fixture.destroy();
    expect(Boolean(sibling.inert)).toBe(false);
  });

  it('renders non-modal Action popover with directional arrow classes (mjt-arrow--top/bottom/left/right) across placements', async () => {
    const target = document.createElement('button');
    target.textContent = 'Filter';
    // Centered in jsdom's default 1024x768 viewport so every cardinal placement fits cleanly without flipping
    setElementRect(target, { left: 450, top: 300, width: 120, height: 40 });
    document.body.appendChild(target);

    const placements: Array<{ placement: TourStepPlacement; arrowClass: string }> = [
      { placement: 'bottom', arrowClass: 'mjt-arrow--bottom' },
      { placement: 'top', arrowClass: 'mjt-arrow--top' },
      { placement: 'right', arrowClass: 'mjt-arrow--right' },
      { placement: 'left', arrowClass: 'mjt-arrow--left' },
    ];

    for (const { placement, arrowClass } of placements) {
      const step = makeStep('Action', placement, { StepKey: `action-${placement}` });
      const fixture = TestBed.createComponent(OverlayTourPresenterComponent);
      fixture.componentRef.setInput('Session', makeSession(step));
      fixture.componentRef.setInput('AnchorElement', target);
      fixture.detectChanges();

      await new Promise((resolve) => setTimeout(resolve, 25));
      fixture.detectChanges();

      const dialog = fixture.nativeElement.querySelector('.mjt-dialog') as HTMLElement;
      const arrow = fixture.nativeElement.querySelector('.mjt-arrow') as HTMLElement;
      expect(dialog.classList.contains('mjt-dialog--popover')).toBe(true);
      expect(dialog.classList.contains('mjt-dialog--modal')).toBe(false);
      expect(arrow).not.toBeNull();
      expect(arrow.classList.contains(arrowClass)).toBe(true);

      fixture.destroy();
    }
  });

  it('renders centered Modal, floating Banner, Beacon wrap, and secondary Sage PointerHighlight', async () => {
    const pointerTarget = document.createElement('button');
    pointerTarget.setAttribute('data-mj-tour-anchor', 'core.export');
    setElementRect(pointerTarget, { left: 300, top: 100, width: 100, height: 32 });
    document.body.appendChild(pointerTarget);

    const modalStep = makeStep('Modal', 'center', { Anchor: null });
    const fixture = TestBed.createComponent(OverlayTourPresenterComponent);
    fixture.componentRef.setInput('Session', {
      ...makeSession(modalStep),
      PointerHighlight: { AnchorKey: 'core.export', Caption: 'Export views here' },
    });
    fixture.detectChanges();

    await new Promise((resolve) => setTimeout(resolve, 25));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.mjt-dialog--centered')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.mjt-pointer-ring')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.mjt-pointer-caption')?.textContent).toContain('Export views here');

    const bannerStep = makeStep('Banner', 'top', { Anchor: null });
    fixture.componentRef.setInput('Session', makeSession(bannerStep));
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 25));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.mjt-banner--floating')).not.toBeNull();

    const beaconStep = makeStep('Beacon', 'top-end');
    fixture.componentRef.setInput('Session', makeSession(beaconStep));
    fixture.componentRef.setInput('AnchorElement', pointerTarget);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 25));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.mjt-beacon-wrap')).not.toBeNull();

    AnchorRegistry.Instance.UnregisterAnchor('core.export', pointerTarget);
    fixture.destroy();
  });
});
