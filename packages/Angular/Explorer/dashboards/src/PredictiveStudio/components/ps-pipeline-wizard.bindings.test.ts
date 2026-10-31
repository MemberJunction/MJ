import { describe, it, expect } from 'vitest';
import type { IMetadataProvider, RunViewParams, RunViewResult } from '@memberjunction/core';
import type { MJMLTrainingPipelineEntity } from '@memberjunction/core-entities';
import { ADVERSE_CLASS_HOLD_REASON } from '@memberjunction/predictive-studio-core';
import { PipelineWizardBindings, type WizardPipelineFields } from './ps-pipeline-wizard.bindings';

type Cell = string | number | boolean | Date | null;

/** A saved-row double: its columns, the order it was saved in, and whether it was deleted. */
interface RowDouble {
  ID: string;
  [column: string]: string | number | boolean | null | (() => unknown) | object | undefined;
}

/** The double's state: the rows it handed out (by entity), the save order, and the labels its view returns. */
interface WizardWorld {
  readonly Provider: IMetadataProvider;
  readonly Order: string[];
  readonly Deleted: string[];
  readonly Reads: RunViewParams[];
  Labels: Cell[];
  TotalRowCount: number | null;
  FailUnitSave: boolean;
}

/** A provider whose view returns the target labels and whose entity objects save into the world (no casts: Object.create + assign). */
function world(labels: Cell[]): WizardWorld {
  const provider: IMetadataProvider = Object.create(null);
  const w: WizardWorld = { Provider: provider, Order: [], Deleted: [], Reads: [], Labels: labels, TotalRowCount: null, FailUnitSave: false };
  const row = (entity: string, prefix: string): RowDouble => {
    const r: RowDouble = Object.assign(Object.create(null), {
      ID: '', LatestResult: null, EntityInfo: { Name: entity }, PrimaryKey: { ToString: (): string => r.ID },
      NewRecord: (): boolean => true,
      Save: async (): Promise<boolean> => {
        if (entity === 'MJ: Prediction Units' && w.FailUnitSave) return false;
        // The server mints the ID and adopts it as version 1's lineage root.
        r.ID = `${prefix}-SERVER`;
        r.LineageRootID = r.ID;
        w.Order.push(entity);
        return true;
      },
      Delete: async (): Promise<boolean> => {
        w.Deleted.push(entity);
        return true;
      },
    });
    return r;
  };
  Object.assign(provider, {
    CurrentUser: { ID: 'USER-1' },
    EntityByName: (name: string) => (name === 'Members' ? { PrimaryKeys: [{ Name: 'ID' }] } : undefined),
    RunView: async (params: RunViewParams): Promise<RunViewResult<Record<string, Cell>>> => {
      w.Reads.push(params);
      const field = params.Fields?.[0] || '';
      // pages of 2 rows, as a client view returns at most a page
      const start = params.StartRow || 0;
      const rows = w.Labels.slice(start, start + 2).map((v) => ({ [field]: v }));
      return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: w.TotalRowCount === null ? w.Labels.length : w.TotalRowCount, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' };
    },
    GetEntityObject: async (entity: string): Promise<RowDouble> => row(entity, entity === 'MJ: Prediction Units' ? 'U' : 'EP'),
  });
  return w;
}

/** A new wizard pipeline double: the columns the wizard sets, and a save that records its bindings. */
function newPipeline(w: WizardWorld, target = 'Renewed', failSave = false): MJMLTrainingPipelineEntity {
  const p: MJMLTrainingPipelineEntity = Object.create(null);
  Object.assign(p, {
    ID: '', Name: 'Renewal', TargetVariable: target, ProblemType: 'classification', AsOfStrategy: JSON.stringify({ Mode: 'none' }),
    ValidationStrategy: JSON.stringify({ Strategy: 'kfold', K: 4, LockedHoldoutFraction: 0.15 }), LeakageGuard: JSON.stringify({ DenyFields: ['ID'], SingleFeatureDominanceThreshold: 0.6 }),
    FeatureSteps: JSON.stringify({ Steps: [] }), Hyperparameters: null, PredictionUnitID: null, EvaluationProtocolID: null,
    LatestResult: failSave ? { CompleteMessage: 'pipeline refused' } : null,
    Save: async (): Promise<boolean> => {
      if (failSave) return false;
      w.Order.push(`MJ: ML Training Pipelines unit=${p.PredictionUnitID} protocol=${p.EvaluationProtocolID}`);
      return true;
    },
  });
  return p;
}

const fields = (over: Partial<WizardPipelineFields> = {}): WizardPipelineFields => ({
  Name: 'Renewal', TargetVariable: 'Renewed', ProblemType: 'classification', AsOfStrategy: null, ValidationStrategy: null, LeakageGuard: null,
  FeatureSteps: null, Hyperparameters: null, TargetEntity: 'Members', ...over,
});

describe('PipelineWizardBindings.Plan', () => {
  it('maps a new pipeline to a fixed-date unit advancing each run and a seeded-random protocol', () => {
    const plan = PipelineWizardBindings.Plan(fields(), ['1', '0'], '2026-10-31');
    if (plan.Kind !== 'plan') throw new Error(plan.Reason);
    expect(plan.Unit.UnitRows).toEqual({ kind: 'grain', grainEntity: 'Members', decisionDate: { kind: 'fixed', date: '2026-10-31', advance: 'each-run' }, filter: [] });
    expect(plan.Unit.TaskType).toEqual({ kind: 'binary', classOrder: ['0', '1'], adverseIndex: 0 });
    expect(plan.Protocol.Holdout).toEqual({ kind: 'seeded-random', fraction: 0.25 });
  });
  it('holds a binary target nothing declares the adverse class of', () => {
    expect(PipelineWizardBindings.Plan(fields({ TargetVariable: 'Segment' }), ['A', 'B'], '2026-10-31')).toEqual({ Kind: 'hold', Reason: ADVERSE_CLASS_HOLD_REASON });
  });
});

describe('PipelineWizardBindings.SaveWithBindings', () => {
  it('saves the unit, then the protocol, then the pipeline already bound to both, reading the labels as the unit reader does', async () => {
    const w = world([true, false, true, null]);
    const p = newPipeline(w);
    expect(await PipelineWizardBindings.SaveWithBindings(p, 'Members', w.Provider, undefined)).toEqual({ Ok: true });
    expect(w.Order).toEqual(['MJ: Prediction Units', 'MJ: Evaluation Protocols', 'MJ: ML Training Pipelines unit=U-SERVER protocol=EP-SERVER']);
    expect([p.TargetVariable, p.ProblemType]).toEqual(['Renewed within 1 days', 'classification']);
    // every row read, in pages ordered by the key
    expect(w.Reads.map((r) => [r.StartRow, r.OrderBy])).toEqual([[0, 'ID'], [2, 'ID']]);
  });
  it('deletes the unit and protocol when the pipeline fails to save', async () => {
    const w = world(['1', '0']);
    const r = await PipelineWizardBindings.SaveWithBindings(newPipeline(w, 'Renewed', true), 'Members', w.Provider, undefined);
    expect(r).toEqual({ Ok: false, Reason: 'saving the pipeline: pipeline refused' });
    expect(w.Deleted).toEqual(['MJ: Evaluation Protocols', 'MJ: Prediction Units']);
  });
  it('saves nothing for a held target, a failed unit save or a label read that misses rows', async () => {
    const held = world(['A', 'B']);
    const r = await PipelineWizardBindings.SaveWithBindings(newPipeline(held, 'Segment'), 'Members', held.Provider, undefined);
    expect([r.Ok, held.Order]).toEqual([false, []]);
    const failing = world(['1', '0']);
    failing.FailUnitSave = true;
    expect((await PipelineWizardBindings.SaveWithBindings(newPipeline(failing), 'Members', failing.Provider, undefined)).Ok).toBe(false);
    expect(failing.Order).toEqual([]);
    const short = world(['1', '0']);
    short.TotalRowCount = 3;
    await expect(PipelineWizardBindings.SaveWithBindings(newPipeline(short), 'Members', short.Provider, undefined)).rejects.toThrow('returned 2 of 3 rows');
  });
});
