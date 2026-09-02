import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, queryAll } from '@memberjunction/ng-test-utils';
import type { PredictiveStudioEngine } from '../engine/predictive-studio.engine';
import { PSComposeComponent } from './ps-compose.component';

/**
 * DOM coverage for <ps-compose> — building a model by filling slots.
 *
 * The assertions that matter are about what the panel makes REACHABLE. An empty required slot has to
 * be a visible, clickable target or the model cannot be built at all; and the palette must offer only
 * types the slot genuinely accepts, so the common way to compose an invalid graph is simply not
 * clickable. Both are properties of the rendered DOM, not of the view-model, which is why they live
 * here rather than in the pure tests.
 */

const TYPES = [
  { ID: 'model', Name: 'Model', ParentID: null, Kind: 'Model', IsAbstract: true, Trainable: false, DriverClass: null, SpecSchema: null, DefaultSpec: null, Story: null, Status: 'Published' },
  { ID: 'linear', Name: 'Linear', ParentID: 'model', Kind: 'Model', IsAbstract: true, Trainable: false, DriverClass: null, SpecSchema: null, DefaultSpec: null, Story: null, Status: 'Published' },
  { ID: 'logreg', Name: 'Logistic Regression', ParentID: 'linear', Kind: 'Model', IsAbstract: false, Trainable: true, DriverClass: 'logistic_regression', SpecSchema: null, DefaultSpec: null, Story: null, Status: 'Published' },
  { ID: 'rf', Name: 'Random Forest', ParentID: 'model', Kind: 'Model', IsAbstract: false, Trainable: true, DriverClass: 'random_forest', SpecSchema: null, DefaultSpec: null, Story: null, Status: 'Published' },
  { ID: 'bag', Name: 'Bagging Wrapper', ParentID: null, Kind: 'Structure', IsAbstract: false, Trainable: true, DriverClass: 'bagging', SpecSchema: null, DefaultSpec: null, Story: null, Status: 'Published' },
  { ID: 'stack', Name: 'Stacking Wrapper', ParentID: null, Kind: 'Structure', IsAbstract: false, Trainable: true, DriverClass: 'stacking', SpecSchema: null, DefaultSpec: null, Story: null, Status: 'Published' },
];

const SLOTS = [
  { ComponentTypeID: 'bag', Name: 'base_estimator', Description: null, AcceptsComponentTypeID: 'model', MinCount: 1, MaxCount: 1, DefaultComponentTypeID: null, Sequence: 0 },
  { ComponentTypeID: 'stack', Name: 'estimators', Description: null, AcceptsComponentTypeID: 'model', MinCount: 2, MaxCount: null, DefaultComponentTypeID: null, Sequence: 0 },
  { ComponentTypeID: 'stack', Name: 'final_estimator', Description: null, AcceptsComponentTypeID: 'linear', MinCount: 1, MaxCount: 1, DefaultComponentTypeID: null, Sequence: 1 },
];

const makeEngine = () =>
  ({ ComponentTypes: TYPES, ComponentTypeProperties: [], ComponentTypeSlots: SLOTS } as unknown as PredictiveStudioEngine);

const render = (initialGraph?: unknown) =>
  renderComponentFixture(PSComposeComponent, {
    inputs: { engine: makeEngine(), provider: {}, currentUser: undefined, initialGraph },
  });

const clickTestId = (fixture: ReturnType<typeof render>, id: string): void => {
  const el = query(fixture, `[data-testid="${id}"]`) as HTMLElement | null;
  expect(el, `no element with data-testid="${id}"`).toBeTruthy();
  el!.click();
  fixture.detectChanges();
};

describe('PSComposeComponent (DOM)', () => {
  it('starts on a structure and shows its empty slot as a clickable target', () => {
    // If an unfilled slot were invisible there would be nothing to click, and no model could be built.
    const fixture = render();
    expect(query(fixture, '[data-testid="ps-compose-panel"]')).toBeTruthy();
    expect(query(fixture, '[data-testid="ps-compose-fill-root-base_estimator"]')).toBeTruthy();
  });

  it('says the graph is not buildable while a required slot is empty', () => {
    const verdict = query(render(), '[data-testid="ps-compose-verdict"]');
    expect(verdict?.textContent).toContain('Not buildable yet');
  });

  it('offers only types the slot accepts, and disables the abstract ones', () => {
    const fixture = render();
    clickTestId(fixture, 'ps-compose-fill-root-base_estimator');

    const names = queryAll(fixture, '[data-testid^="ps-compose-candidate-"]').map((el) => el.textContent?.trim() ?? '');
    expect(names.some((n) => n.includes('Random Forest'))).toBe(true);
    expect(names.some((n) => n.includes('Logistic Regression'))).toBe(true);
    // A Structure is not a Model, so it must not be on offer for base_estimator.
    expect(names.some((n) => n.includes('Stacking Wrapper'))).toBe(false);

    const abstract = query(fixture, '[data-testid="ps-compose-candidate-Model"]') as HTMLButtonElement | null;
    expect(abstract?.disabled, 'an abstract type must be shown-but-disabled, not hidden').toBe(true);
    expect(abstract?.getAttribute('title')).toContain('abstract');
  });

  it('fills the slot on click and flips the verdict to buildable', () => {
    const fixture = render();
    clickTestId(fixture, 'ps-compose-fill-root-base_estimator');
    clickTestId(fixture, 'ps-compose-candidate-Random Forest');

    expect(query(fixture, '[data-testid="ps-compose-node-root.base_estimator[0]"]')).toBeTruthy();
    expect(query(fixture, '[data-testid="ps-compose-verdict"]')?.textContent).toContain('Buildable');
    // A 1-arity slot is full, so its fill target is gone.
    expect(query(fixture, '[data-testid="ps-compose-fill-root-base_estimator"]')).toBeFalsy();
  });

  it('removes a filled component and goes back to not-buildable', () => {
    const fixture = render();
    clickTestId(fixture, 'ps-compose-fill-root-base_estimator');
    clickTestId(fixture, 'ps-compose-candidate-Random Forest');
    clickTestId(fixture, 'ps-compose-remove-root.base_estimator[0]');

    expect(query(fixture, '[data-testid="ps-compose-node-root.base_estimator[0]"]')).toBeFalsy();
    expect(query(fixture, '[data-testid="ps-compose-verdict"]')?.textContent).toContain('Not buildable yet');
  });

  it('has no remove control on the root — there would be no graph left', () => {
    expect(query(render(), '[data-testid="ps-compose-remove-root"]')).toBeFalsy();
  });

  it('opens an Architect proposal for editing, showing every filled slot', () => {
    const fixture = render({
      ComponentTypeRef: 'Stacking Wrapper',
      Children: [
        { ComponentTypeRef: 'Random Forest', SlotName: 'estimators' },
        { ComponentTypeRef: 'Logistic Regression', SlotName: 'estimators' },
        { ComponentTypeRef: 'Logistic Regression', SlotName: 'final_estimator' },
      ],
    });
    expect(query(fixture, '[data-testid="ps-compose-node-root.estimators[0]"]')).toBeTruthy();
    expect(query(fixture, '[data-testid="ps-compose-node-root.estimators[1]"]')).toBeTruthy();
    expect(query(fixture, '[data-testid="ps-compose-node-root.final_estimator[0]"]')).toBeTruthy();
    expect(query(fixture, '[data-testid="ps-compose-verdict"]')?.textContent).toContain('Buildable');
  });

  it('surfaces a validator error against the node that caused it', () => {
    const fixture = render({
      ComponentTypeRef: 'Bagging Wrapper',
      Children: [{ ComponentTypeRef: 'Imaginary Forest', SlotName: 'base_estimator' }],
    });
    const node = query(fixture, '[data-testid="ps-compose-node-root.base_estimator[0]"]');
    expect(node?.textContent).toContain('Imaginary Forest');
    expect(query(fixture, '[data-testid="ps-compose-verdict"]')?.textContent).toContain('Not buildable yet');
  });

  it('drops children when the root structure changes — they filled the old type’s slots', () => {
    const fixture = render();
    clickTestId(fixture, 'ps-compose-fill-root-base_estimator');
    clickTestId(fixture, 'ps-compose-candidate-Random Forest');

    const select = query(fixture, '[data-testid="ps-compose-root-select"]') as HTMLSelectElement;
    select.value = 'Stacking Wrapper';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(query(fixture, '[data-testid="ps-compose-node-root.base_estimator[0]"]')).toBeFalsy();
    expect(query(fixture, '[data-testid="ps-compose-fill-root-estimators"]')).toBeTruthy();
  });
});
