/**
 * Translating a composition graph into sidecar terms.
 *
 * The refusals carry most of the weight here. Every one of them describes a graph that would
 * otherwise train *something* — and that something would not be the model that was described.
 */

import { describe, it, expect } from 'vitest';
import type { ComponentGraphNode } from '@memberjunction/predictive-studio-core';

import {
  toTrainComponentGraph,
  ComponentGraphTranslationError,
  MAX_GRAPH_DEPTH,
  type TrainGraphType,
} from '../graph-to-train';

/** A small stand-in for the seeded tree: name → the facts translation needs. */
const TYPES: Record<string, TrainGraphType> = {
  'Bagging Wrapper': { Name: 'Bagging Wrapper', IsAbstract: false, DriverClass: 'bagging' },
  'Stacking Wrapper': { Name: 'Stacking Wrapper', IsAbstract: false, DriverClass: 'stacking' },
  'Random Forest': { Name: 'Random Forest', IsAbstract: false, DriverClass: 'random_forest' },
  'Logistic Regression': { Name: 'Logistic Regression', IsAbstract: false, DriverClass: 'logistic_regression' },
  XGBoost: { Name: 'XGBoost', IsAbstract: false, DriverClass: 'xgboost' },
  Boosting: { Name: 'Boosting', IsAbstract: true, DriverClass: null },
  'Hidden Markov Model': { Name: 'Hidden Markov Model', IsAbstract: false, DriverClass: null },
  'Old Forest': { Name: 'Old Forest', IsAbstract: false, DriverClass: 'random_forest', Status: 'Deprecated' },
};

const lookup = (name: string): TrainGraphType | undefined => TYPES[name];

describe('toTrainComponentGraph', () => {
  it('translates a bagging wrapper over a forest into drivers and slots', () => {
    const graph: ComponentGraphNode = {
      ComponentTypeRef: 'Bagging Wrapper',
      Params: { n_estimators: 10 },
      Children: [{ ComponentTypeRef: 'Random Forest', SlotName: 'base_estimator', Params: { max_depth: 4 } }],
    };

    const out = toTrainComponentGraph(graph, lookup);

    expect(out.RootDriver).toBe('bagging');
    expect(out.Node).toEqual({
      driver: 'bagging',
      hyperparameters: { n_estimators: 10 },
      children: [{ driver: 'random_forest', hyperparameters: { max_depth: 4 }, slot: 'base_estimator' }],
    });
    expect(out.ReuseInstanceIDs).toEqual([]);
    expect(out.Warnings).toEqual([]);
  });

  it('drops a slot name on the root — a root fills nothing', () => {
    const out = toTrainComponentGraph({ ComponentTypeRef: 'Random Forest', SlotName: 'base_estimator' }, lookup);
    // A caller who lifted a subtree may leave SlotName behind; reporting it back would claim the
    // model occupies a position it does not.
    expect(out.Node.slot).toBeUndefined();
    expect(out.RootDriver).toBe('random_forest');
  });

  it('omits empty hyperparameters rather than sending an empty object', () => {
    const out = toTrainComponentGraph({ ComponentTypeRef: 'XGBoost', Params: {} }, lookup);
    expect(out.Node).toEqual({ driver: 'xgboost' });
  });

  it('translates a stack of three, preserving slot and order', () => {
    const graph: ComponentGraphNode = {
      ComponentTypeRef: 'Stacking Wrapper',
      Children: [
        { ComponentTypeRef: 'Random Forest', SlotName: 'estimators' },
        { ComponentTypeRef: 'XGBoost', SlotName: 'estimators' },
        { ComponentTypeRef: 'Logistic Regression', SlotName: 'final_estimator' },
      ],
    };
    const out = toTrainComponentGraph(graph, lookup);
    expect(out.Node.children?.map((c) => [c.driver, c.slot])).toEqual([
      ['random_forest', 'estimators'],
      ['xgboost', 'estimators'],
      ['logistic_regression', 'final_estimator'],
    ]);
  });

  it('collects every reused instance id, in encounter order', () => {
    const graph: ComponentGraphNode = {
      ComponentTypeRef: 'Stacking Wrapper',
      Children: [
        { ComponentTypeRef: 'Random Forest', SlotName: 'estimators', ReuseInstanceID: 'comp-a' },
        { ComponentTypeRef: 'XGBoost', SlotName: 'estimators', ReuseInstanceID: 'comp-b' },
        { ComponentTypeRef: 'Logistic Regression', SlotName: 'final_estimator' },
      ],
    };
    const out = toTrainComponentGraph(graph, lookup);
    expect(out.ReuseInstanceIDs).toEqual(['comp-a', 'comp-b']);
    expect(out.Node.children?.[0]).toEqual({ driver: 'random_forest', reuse_instance_id: 'comp-a', slot: 'estimators' });
    // A reused node carries no hyperparameters — it arrives already fitted.
    expect(out.Node.children?.[0].hyperparameters).toBeUndefined();
  });

  it('warns about a deprecated type without refusing it', () => {
    const out = toTrainComponentGraph({ ComponentTypeRef: 'Old Forest' }, lookup);
    expect(out.RootDriver).toBe('random_forest');
    expect(out.Warnings[0]).toContain('deprecated');
  });
});

describe('toTrainComponentGraph — refusals', () => {
  it('refuses a type the tree does not have', () => {
    expect(() => toTrainComponentGraph({ ComponentTypeRef: 'Imaginary Forest' }, lookup)).toThrow(
      /no component type named 'Imaginary Forest'/,
    );
  });

  it('refuses an abstract type — it names a place, not a model', () => {
    expect(() => toTrainComponentGraph({ ComponentTypeRef: 'Boosting' }, lookup)).toThrow(/abstract type/);
  });

  it('refuses a concrete type with no runtime behind it', () => {
    expect(() => toTrainComponentGraph({ ComponentTypeRef: 'Hidden Markov Model' }, lookup)).toThrow(/no DriverClass/);
  });

  it('refuses a node that both reuses a component and declares children', () => {
    const graph: ComponentGraphNode = {
      ComponentTypeRef: 'Bagging Wrapper',
      ReuseInstanceID: 'comp-a',
      Children: [{ ComponentTypeRef: 'Random Forest', SlotName: 'base_estimator' }],
    };
    expect(() => toTrainComponentGraph(graph, lookup)).toThrow(/both reuses an existing component and declares/);
  });

  it('names the failing position, not just the failure', () => {
    const graph: ComponentGraphNode = {
      ComponentTypeRef: 'Bagging Wrapper',
      Children: [{ ComponentTypeRef: 'Boosting', SlotName: 'base_estimator' }],
    };
    expect(() => toTrainComponentGraph(graph, lookup)).toThrow(/root › base_estimator/);
  });

  it('refuses a graph nested past the sidecar depth cap', () => {
    let node: ComponentGraphNode = { ComponentTypeRef: 'Random Forest', SlotName: 'base_estimator' };
    for (let i = 0; i <= MAX_GRAPH_DEPTH; i++) {
      node = { ComponentTypeRef: 'Bagging Wrapper', SlotName: 'base_estimator', Children: [node] };
    }
    expect(() => toTrainComponentGraph(node, lookup)).toThrow(ComponentGraphTranslationError);
    expect(() => toTrainComponentGraph(node, lookup)).toThrow(/refers to itself/);
  });
});
