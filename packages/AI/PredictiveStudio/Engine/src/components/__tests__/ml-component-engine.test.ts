/**
 * MLComponentEngine — the entity→structural projection, resolution, memoization and lint façade.
 *
 * Also carries the COMPILE-TIME LOCKSTEP CHECK: Core hand-writes `ComponentPropertyKey` (it cannot
 * import core-entities), so if a migration widens the CHECK constraint and CodeGen regenerates a
 * wider union, the assignments below stop compiling — which is the intended failure. Same for
 * `ComponentKind` and the property `Operation`.
 */
import { describe, expect, it } from 'vitest';
import type {
  MJMLComponentTypeEntity,
  MJMLComponentTypePropertyEntity,
  MJMLComponentTypeSlotEntity,
} from '@memberjunction/core-entities';
import type {
  ComponentKind,
  ComponentPropertyKey,
  PropertyOperation,
} from '@memberjunction/predictive-studio-core';
import { MLComponentEngine } from '../ml-component-engine';

// ── Compile-time lockstep: generated unions must be assignable to Core's, and vice versa ──
type Assert<T extends true> = T;
type Mutual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

type _KindLockstep = Assert<Mutual<ComponentKind, MJMLComponentTypeEntity['Kind']>>;
type _PropertyKeyLockstep = Assert<Mutual<ComponentPropertyKey, MJMLComponentTypePropertyEntity['PropertyKey']>>;
type _OperationLockstep = Assert<Mutual<PropertyOperation, MJMLComponentTypePropertyEntity['Operation']>>;

/** Minimal stand-ins carrying only the fields the engine projects. */
function typeRow(over: Partial<MJMLComponentTypeEntity> & { ID: string; Name: string; Kind: ComponentKind }) {
  return {
    ParentID: null,
    IsAbstract: false,
    Trainable: false,
    DriverClass: null,
    SpecSchema: null,
    DefaultSpec: null,
    Status: 'Published',
    ...over,
  } as unknown as MJMLComponentTypeEntity;
}
function propRow(over: { ComponentTypeID: string; PropertyKey: ComponentPropertyKey; Value: string } & Partial<MJMLComponentTypePropertyEntity>) {
  return { Operation: 'Add', ItemKey: null, Sequence: 0, Rationale: null, ...over } as unknown as MJMLComponentTypePropertyEntity;
}
function slotRow(over: { ComponentTypeID: string; Name: string; AcceptsComponentTypeID: string } & Partial<MJMLComponentTypeSlotEntity>) {
  return {
    Description: null,
    MinCount: 1,
    MaxCount: 1,
    DefaultComponentTypeID: null,
    Sequence: 0,
    ...over,
  } as unknown as MJMLComponentTypeSlotEntity;
}

/** Seed a fresh engine instance's private caches without touching a database. */
function seed(
  types: MJMLComponentTypeEntity[],
  props: MJMLComponentTypePropertyEntity[] = [],
  slots: MJMLComponentTypeSlotEntity[] = [],
): MLComponentEngine {
  const engine = Object.create(MLComponentEngine.prototype) as MLComponentEngine;
  const w = engine as unknown as Record<string, unknown>;
  w._componentTypes = types;
  w._componentTypeProperties = props;
  w._componentTypeSlots = slots;
  w.profileMemo = new Map();
  return engine;
}

// Model → Tree Ensemble → XGBoost, with uppercase ids to prove normalization.
const MODEL = typeRow({ ID: 'AAAAAAAA-0000-0000-0000-000000000001', Name: 'Model', Kind: 'Model', IsAbstract: true });
const ENSEMBLE = typeRow({
  ID: 'AAAAAAAA-0000-0000-0000-000000000002',
  ParentID: 'aaaaaaaa-0000-0000-0000-000000000001', // lowercase on purpose
  Name: 'Tree Ensemble',
  Kind: 'Model',
  IsAbstract: true,
});
const XGB = typeRow({
  ID: 'AAAAAAAA-0000-0000-0000-000000000003',
  ParentID: 'AAAAAAAA-0000-0000-0000-000000000002',
  Name: 'XGBoost',
  Kind: 'Model',
  DriverClass: 'xgboost',
  Trainable: true,
});
const TREE = [MODEL, ENSEMBLE, XGB];

describe('MLComponentEngine — lookups', () => {
  const engine = seed(TREE);

  it('finds a type by id regardless of casing', () => {
    expect(engine.FindTypeByID('aaaaaaaa-0000-0000-0000-000000000003')?.Name).toBe('XGBoost');
  });

  it('finds a type by name, case- and whitespace-insensitively', () => {
    expect(engine.FindTypeByName('  xgboost ')?.Name).toBe('XGBoost');
    expect(engine.FindTypeByName('nope')).toBeUndefined();
  });

  it('filters by Kind, and can exclude abstract nodes', () => {
    expect(engine.TypesByKind('Model')).toHaveLength(3);
    expect(engine.TypesByKind('Model', true).map((t) => t.Name)).toEqual(['XGBoost']);
    expect(engine.TypesByKind('Output')).toEqual([]);
  });

  it('bridges an algorithm-catalog row onto its leaf, and tolerates rows without the bridge', () => {
    const withBridge = { ComponentTypeID: 'aaaaaaaa-0000-0000-0000-000000000003' } as never;
    const withoutBridge = { ComponentTypeID: null } as never;
    expect(engine.LeafForAlgorithm(withBridge)?.Name).toBe('XGBoost');
    expect(engine.LeafForAlgorithm(withoutBridge)).toBeUndefined();
  });

  it('answers slot-acceptance via descendant-or-self, in the right direction only', () => {
    expect(engine.IsDescendantOf(XGB.ID, MODEL.ID)).toBe(true);
    expect(engine.IsDescendantOf(XGB.ID, XGB.ID)).toBe(true);
    expect(engine.IsDescendantOf(MODEL.ID, XGB.ID)).toBe(false);
  });
});

describe('MLComponentEngine — resolution', () => {
  it('folds the inherited chain and reports provenance', () => {
    const engine = seed(TREE, [
      propRow({ ComponentTypeID: MODEL.ID, PropertyKey: 'PreprocessingBank', ItemKey: 'impute', Value: '{"op":"impute"}' }),
      propRow({ ComponentTypeID: ENSEMBLE.ID, PropertyKey: 'Explainability', Value: '"global-importance"' }),
    ]);
    const profile = engine.ResolveProfile(XGB.ID);
    expect(profile.Chain.map((n) => n.Name)).toEqual(['Model', 'Tree Ensemble', 'XGBoost']);
    expect((profile.Properties.PreprocessingBank ?? []).map((i) => i.ItemKey)).toEqual(['impute']);
    expect(profile.Properties.Explainability?.[0].Value).toBe('global-importance');
    expect(profile.Provenance.PreprocessingBank).toEqual([MODEL.ID.toLowerCase()]);
  });

  it('resolves slots declared up the chain', () => {
    const engine = seed(TREE, [], [slotRow({ ComponentTypeID: ENSEMBLE.ID, Name: 'base', AcceptsComponentTypeID: MODEL.ID })]);
    expect(engine.ResolveProfile(XGB.ID).Slots.map((s) => s.Name)).toEqual(['base']);
  });

  it('memoizes: the same object comes back, and AdditionalLoading invalidates it', async () => {
    const engine = seed(TREE);
    const first = engine.ResolveProfile(XGB.ID);
    expect(engine.ResolveProfile(XGB.ID)).toBe(first);
    // BaseEngine calls this after the initial load AND after every event-driven refresh.
    await (engine as unknown as { AdditionalLoading: () => Promise<void> }).AdditionalLoading();
    expect(engine.ResolveProfile(XGB.ID)).not.toBe(first);
  });

  it('throws on an unknown type rather than returning an empty profile', () => {
    expect(() => seed(TREE).ResolveProfile('ffffffff-0000-0000-0000-000000000000')).toThrow(/not found/);
  });
});

describe('MLComponentEngine — lint', () => {
  it('passes a well-formed tree', () => {
    expect(seed(TREE).Lint()).toEqual([]);
  });

  it('surfaces a descendant contradiction as a Warning naming both nodes', () => {
    const engine = seed(TREE, [
      propRow({ ComponentTypeID: MODEL.ID, PropertyKey: 'PreprocessingBank', ItemKey: 'standardize', Value: '{}' }),
      propRow({ ComponentTypeID: XGB.ID, PropertyKey: 'PreprocessingBank', ItemKey: 'standardize', Value: '', Operation: 'Remove' }),
    ]);
    const finding = engine.Lint().find((f) => f.Rule === 'descendant-contradiction');
    expect(finding?.Severity).toBe('Warning');
    expect(finding?.NodeID).toBe(MODEL.ID.toLowerCase());
    expect(finding?.RelatedNodeID).toBe(XGB.ID.toLowerCase());
  });
});
