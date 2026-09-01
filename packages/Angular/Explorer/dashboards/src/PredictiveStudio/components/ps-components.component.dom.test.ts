import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, queryAll } from '@memberjunction/ng-test-utils';
import type { PredictiveStudioEngine } from '../engine/predictive-studio.engine';
import { PSComponentsComponent } from './ps-components.component';

/**
 * DOM coverage for <ps-components> — the component tree + inherited-profile inspector. The engine is
 * an @Input; a minimal fake supplies the three cached TYPE arrays the panel reads. The assertions
 * that matter are about inheritance being VISIBLE: the chain, and an "inherited from" chip on
 * anything the selected leaf did not declare itself.
 */

const TYPES = [
  { ID: 'model', Name: 'Model', ParentID: null, Kind: 'Model', IsAbstract: true, Trainable: false, DriverClass: null, SpecSchema: null, DefaultSpec: null, Story: 'Evidence in, judgment out.', Status: 'Published' },
  { ID: 'tree', Name: 'Tree Ensemble', ParentID: 'model', Kind: 'Model', IsAbstract: true, Trainable: false, DriverClass: null, SpecSchema: null, DefaultSpec: null, Story: null, Status: 'Published' },
  { ID: 'xgb', Name: 'XGBoost', ParentID: 'tree', Kind: 'Model', IsAbstract: false, Trainable: true, DriverClass: 'xgboost', SpecSchema: null, DefaultSpec: null, Story: 'Many small trees, each fixing the last one’s mistakes.', Status: 'Published' },
  { ID: 'input', Name: 'Input', ParentID: null, Kind: 'Input', IsAbstract: true, Trainable: false, DriverClass: null, SpecSchema: null, DefaultSpec: null, Story: null, Status: 'Published' },
];

const PROPERTIES = [
  { ComponentTypeID: 'tree', PropertyKey: 'PreprocessingBank', Operation: 'Add', ItemKey: 'impute', Value: '{"op":"impute"}', Sequence: 0, Rationale: 'Trees tolerate missing values badly.' },
  { ComponentTypeID: 'tree', PropertyKey: 'Explainability', Operation: 'Add', ItemKey: null, Value: '"global-importance"', Sequence: 0, Rationale: null },
];

const SLOTS: unknown[] = [];

const makeEngine = (overrides: Partial<Record<string, unknown>> = {}) =>
  ({
    ComponentTypes: TYPES,
    ComponentTypeProperties: PROPERTIES,
    ComponentTypeSlots: SLOTS,
    LoadComponentInstances: async () => [
      { ID: 'i1', Name: 'Renewal model root v5', ComponentTypeID: 'xgb', PromotionState: 'Approved', IsTrained: true, Story: 'Scores members on renewal likelihood.' },
    ],
    ...overrides,
  } as unknown as PredictiveStudioEngine);

const render = (engine = makeEngine()) =>
  renderComponentFixture(PSComponentsComponent, { inputs: { engine, provider: {}, currentUser: undefined } });

const rowNamed = (fixture: ReturnType<typeof render>, name: string) =>
  queryAll(fixture, '[data-testid="ps-components-tree-row"]').find((el) => el.textContent?.includes(name));

describe('PSComponentsComponent (DOM)', () => {
  it('renders the Kind roots expanded, so the seven spaces are visible on first view', () => {
    const fixture = render();
    const rows = queryAll(fixture, '[data-testid="ps-components-tree-row"]').map((el) => el.textContent?.trim() ?? '');
    expect(rows.some((r) => r.includes('Model'))).toBe(true);
    expect(rows.some((r) => r.includes('Input'))).toBe(true);
    // Tree Ensemble is a child of the (expanded) Model root, so it shows; XGBoost is one level deeper.
    expect(rows.some((r) => r.includes('Tree Ensemble'))).toBe(true);
    expect(rows.some((r) => r.includes('XGBoost'))).toBe(false);
  });

  it('marks abstract types, which cannot be instantiated', () => {
    const fixture = render();
    expect(rowNamed(fixture, 'Model')?.textContent).toContain('abstract');
  });

  it('prompts for a selection before anything is chosen', () => {
    expect(query(render(), '[data-testid="ps-components-no-selection"]')).toBeTruthy();
  });

  it('shows the INHERITANCE CHAIN when a leaf is selected', () => {
    const fixture = render();
    (rowNamed(fixture, 'Tree Ensemble') as HTMLElement).click();
    fixture.detectChanges();
    (rowNamed(fixture, 'XGBoost') as HTMLElement).click();
    fixture.detectChanges();

    expect(query(fixture, '[data-testid="ps-components-profile-name"]')?.textContent).toContain('XGBoost');
    const chain = query(fixture, '[data-testid="ps-components-profile-chain"]')?.textContent ?? '';
    expect(chain).toContain('Model');
    expect(chain).toContain('Tree Ensemble');
    expect(chain).toContain('XGBoost');
  });

  it('shows an "inherited from" chip on everything the leaf did not declare itself', () => {
    // This is the panel's reason to exist: XGBoost declares none of these, and presenting them
    // without provenance would read as though it did.
    const fixture = render();
    (rowNamed(fixture, 'Tree Ensemble') as HTMLElement).click();
    fixture.detectChanges();
    (rowNamed(fixture, 'XGBoost') as HTMLElement).click();
    fixture.detectChanges();

    const chips = queryAll(fixture, '[data-testid="ps-components-inherited-chip"]').map((el) => el.textContent?.trim() ?? '');
    expect(chips.length).toBeGreaterThan(0);
    expect(chips.every((c) => c.includes('Tree Ensemble'))).toBe(true);
  });

  it('renders the archetype story next to the name', () => {
    const fixture = render();
    (rowNamed(fixture, 'Model') as HTMLElement).click();
    fixture.detectChanges();
    expect(query(fixture, '[data-testid="ps-components-profile-story"]')?.textContent).toContain('Evidence in, judgment out.');
  });

  it('narrows the tree by Kind', () => {
    const fixture = render();
    const chips = queryAll(fixture, '[data-testid="ps-components-kind-chip"]');
    const inputChip = chips.find((el) => el.textContent?.trim() === 'Input') as HTMLElement;
    inputChip.click();
    fixture.detectChanges();

    const rows = queryAll(fixture, '[data-testid="ps-components-tree-row"]').map((el) => el.textContent ?? '');
    expect(rows.some((r) => r.includes('Input'))).toBe(true);
    expect(rows.some((r) => r.includes('Model'))).toBe(false);
  });

  it('loads instances on demand, not with the panel', async () => {
    // Instances grow with every trained model, so they are never bulk-cached — the panel shows an
    // empty state until asked.
    const fixture = render();
    (rowNamed(fixture, 'Tree Ensemble') as HTMLElement).click();
    fixture.detectChanges();
    (rowNamed(fixture, 'XGBoost') as HTMLElement).click();
    fixture.detectChanges();
    expect(query(fixture, '[data-testid="ps-components-instances-empty"]')).toBeTruthy();

    // Driven through the real Refresh button, which marks the view dirty (guides/ANGULAR_TESTING_GUIDE §5).
    const refresh = query(fixture, '[data-testid="ps-components-refresh"]') as HTMLElement;
    refresh.click();
    await fixture.whenStable();
    const instances = queryAll(fixture, '[data-testid="ps-components-instance"]');
    expect(instances).toHaveLength(1);
    expect(query(fixture, '[data-testid="ps-components-instance-story"]')?.textContent).toContain('renewal likelihood');
  });

  it('shows an empty state when nothing is seeded', () => {
    const fixture = render(makeEngine({ ComponentTypes: [] }));
    expect(query(fixture, '[data-testid="ps-components-empty"]')).toBeTruthy();
  });

  it('surfaces lint findings, so an unprincipled partition is visible to a person', () => {
    // A child whose Kind differs from its parent's is exactly what lintComponentTree flags.
    const broken = [
      TYPES[0],
      { ...TYPES[1], Kind: 'Preprocessing' },
    ];
    const fixture = render(makeEngine({ ComponentTypes: broken, ComponentTypeProperties: [] }));
    expect(query(fixture, '[data-testid="ps-components-lint-banner"]')).toBeTruthy();
    expect(queryAll(fixture, '[data-testid="ps-components-lint-flag"]').length).toBeGreaterThan(0);
  });
});
