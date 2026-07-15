import { describe, it, expect } from 'vitest';
import { renderComponentFixture, queryAll } from '@memberjunction/ng-test-utils';
import { WizardStepIndicatorComponent } from './wizard-step-indicator.component';
import type { WizardStepDef } from '../../database-designer.types';

/**
 * DOM coverage for <mj-entity-wizard-step-indicator> — a pure-display OnPush step breadcrumb. No
 * DI/async/services: a single synchronous render (setInput marks the OnPush view dirty). Steps are
 * plain WizardStepDef-shaped objects; the component renders a checkmark for complete steps, a number
 * for the rest, highlights the active step (aria-current), and draws a connector between steps.
 */

const STEPS = [
  { id: 'basics', label: 'Basics', isComplete: true, isActive: false },
  { id: 'fields', label: 'Fields', isComplete: false, isActive: true },
  { id: 'review', label: 'Review', isComplete: false, isActive: false },
] as unknown as WizardStepDef[];

const render = (Steps: unknown = STEPS) =>
  renderComponentFixture(WizardStepIndicatorComponent, { declarations: [WizardStepIndicatorComponent], inputs: { Steps } });

describe('WizardStepIndicatorComponent (DOM)', () => {
  it('renders one step per Steps entry with its label', () => {
    const fixture = render();
    const labels = queryAll(fixture, '.step-label').map((e) => e.textContent?.trim());
    expect(labels).toEqual(['Basics', 'Fields', 'Review']);
  });

  it('marks complete steps with a checkmark (no number) and complete styling', () => {
    const step0 = queryAll(render(), '.step')[0] as HTMLElement;
    expect(step0.classList.contains('step-complete')).toBe(true);
    expect(step0.querySelector('.fa-check')).not.toBeNull();
    expect(step0.querySelector('.step-circle span')).toBeNull();
  });

  it('highlights the active step and sets aria-current="step"', () => {
    const steps = queryAll(render(), '.step');
    expect(steps[1].classList.contains('step-active')).toBe(true);
    expect(steps[1].getAttribute('aria-current')).toBe('step');
  });

  it('renders future (incomplete, inactive) steps with a number and future styling', () => {
    const steps = queryAll(render(), '.step');
    expect(steps[2].classList.contains('step-future')).toBe(true);
    expect((steps[2] as HTMLElement).querySelector('.step-circle span')?.textContent?.trim()).toBe('3');
  });

  it('draws one fewer connector than steps, with connector-done after a completed step', () => {
    const fixture = render();
    const connectors = queryAll(fixture, '.step-connector');
    expect(connectors.length).toBe(STEPS.length - 1);
    // The first step is complete, so the connector after it is marked done.
    expect(connectors[0].classList.contains('connector-done')).toBe(true);
  });
});
