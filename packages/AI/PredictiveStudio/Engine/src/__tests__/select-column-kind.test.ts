/**
 * #3104 — a plain `select` column is typed from its field: numbers and booleans are numeric, a value-list string is
 * categorical (one-hot encoded), and a date or free-text column is refused at training instead of becoming a constant 0.
 */
import { describe, it, expect } from 'vitest';
import type { EntityFieldInfo, EntityInfo, IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { FeatureStepGraph, FeatureSchemaEntry, MatrixData } from '@memberjunction/predictive-studio-core';
import {
  ClassifySelectColumn,
  FeatureAssemblyExecutor,
  UnusableFeatureColumnError,
  type FeatureAssemblyParams,
  type SourceRow,
} from '../feature-assembly';
import { AppendConstantFeatureWarning, ConstantFeatureColumns } from '../training/training-engine';

/** A field as the classifier reads it: its TS type and value list. */
function field(name: string, tsType: 'string' | 'number' | 'Date' | 'boolean', values: string[] = []): EntityFieldInfo {
  return {
    Name: name,
    TSType: tsType,
    ValueListType: values.length > 0 ? 'List' : 'None',
    EntityFieldValues: values.map((v) => ({ Value: v })),
  } as unknown as EntityFieldInfo;
}

const FIELDS = [
  field('Tenure', 'number'),
  field('IsActive', 'boolean'),
  field('JoinedAt', 'Date'),
  field('Tier', 'string', ['Gold', 'Silver']),
  field('Notes', 'string'),
  field('City', 'string'),
];
const entity = { Name: 'Members', Fields: FIELDS, PrimaryKeys: [{ Name: 'ID' }] } as unknown as EntityInfo;
const provider = { EntityByName: (n: string) => (n === 'Members' ? entity : undefined) } as unknown as IMetadataProvider;

const rows: SourceRow[] = [
  { ID: 'a', Tenure: 3, IsActive: true, JoinedAt: new Date('2020-01-01'), Tier: 'Gold', Notes: 'x', City: 'NYC' },
  { ID: 'b', Tenure: 5, IsActive: false, JoinedAt: new Date('2021-01-01'), Tier: 'Silver', Notes: 'y', City: 'LA' },
];

function params(columns: string[], context: FeatureAssemblyParams['context'], extraSteps: FeatureStepGraph['Steps'] = []): FeatureAssemblyParams {
  return {
    contextUser: { ID: 'u' } as UserInfo,
    provider,
    targetEntityName: 'Members',
    records: rows,
    sources: [{ Kind: 'Entity', Ref: 'Members' }],
    steps: { Steps: [{ Id: 's1', Kind: 'select', Columns: columns }, ...extraSteps] },
    asOf: { Mode: 'none' },
    leakageGuard: { DenyFields: [], SingleFeatureDominanceThreshold: 0.9 },
    context,
  };
}

describe('ClassifySelectColumn', () => {
  const none = new Set<string>();
  it('numbers and booleans are numeric', () => {
    expect(ClassifySelectColumn('Tenure', FIELDS[0], none)).toEqual({ Kind: 'numeric' });
    expect(ClassifySelectColumn('IsActive', FIELDS[1], none)).toEqual({ Kind: 'numeric' });
  });
  it('a value-list string, or one a onehot step encodes, is categorical', () => {
    expect(ClassifySelectColumn('Tier', FIELDS[3], none)).toEqual({ Kind: 'categorical' });
    expect(ClassifySelectColumn('City', FIELDS[5], new Set(['city']))).toEqual({ Kind: 'categorical' });
  });
  it('a datetime is refused with the derived-feature fix', () => {
    const k = ClassifySelectColumn('JoinedAt', FIELDS[2], none);
    expect(k.Kind).toBe('refused');
    expect(k.Kind === 'refused' && k.Reason).toMatch(/days since 'JoinedAt'/);
  });
  it('free text is refused', () => {
    expect(ClassifySelectColumn('Notes', FIELDS[4], none).Kind).toBe('refused');
  });
  it('a column that is not a field keeps the numeric treatment', () => {
    expect(ClassifySelectColumn('derived_x', undefined, none)).toEqual({ Kind: 'numeric' });
  });
});

describe('FeatureAssemblyExecutor — select column kinds', () => {
  const executor = new FeatureAssemblyExecutor();

  it('refuses a datetime select column when training, naming the column', async () => {
    const err = await executor.assemble(params(['Tenure', 'JoinedAt'], 'train')).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnusableFeatureColumnError);
    expect((err as UnusableFeatureColumnError).Columns).toEqual(['JoinedAt']);
  });

  it('types a value-list string as categorical and one-hot encodes it; booleans stay numeric', async () => {
    const result = await executor.assemble(params(['Tenure', 'IsActive', 'Tier'], 'train'));
    const kinds = Object.fromEntries(result.featureSchema.map((e: FeatureSchemaEntry) => [e.Name, e.Kind]));
    expect(kinds).toEqual({ Tenure: 'numeric', IsActive: 'numeric', Tier: 'categorical' });
    expect(result.preprocessing).toEqual([{ op: 'onehot', col: 'Tier' }]);
  });

  it('does not add a second onehot op when the pipeline already encodes the column', async () => {
    const result = await executor.assemble(params(['City'], 'train', [{ Id: 's2', Kind: 'onehot', Column: 'City' }]));
    expect(result.preprocessing.filter((op) => op.op === 'onehot')).toHaveLength(1);
  });

  it('scoring keeps the old numeric treatment, so a trained model still gets its columns', async () => {
    const result = await executor.assemble(params(['JoinedAt', 'Notes'], 'on-demand'));
    expect(result.featureSchema.map((e) => e.Kind)).toEqual(['numeric', 'numeric']);
  });
});

describe('constant features after training', () => {
  const schema: FeatureSchemaEntry[] = [
    { Name: 'a', Kind: 'numeric' },
    { Name: 'b', Kind: 'numeric' },
    { Name: 'label', Kind: 'numeric' },
  ];
  const matrix: MatrixData = { columns: ['a', 'b', 'label'], rows: [[0, 1, 1], [0, 2, 0], [0, 3, 1]] };

  it('finds the columns that never vary, ignoring the target', () => {
    expect(ConstantFeatureColumns(matrix, schema, 'label')).toEqual(['a']);
  });

  it('says nothing for fewer than two rows', () => {
    expect(ConstantFeatureColumns({ columns: ['a'], rows: [[0]] }, schema, 'label')).toEqual([]);
  });

  it('adds a warning naming the constant feature to the run notes', () => {
    expect(AppendConstantFeatureWarning('Training completed.', ['a'])).toBe(
      'Training completed. WARNING: feature "a" was constant across all training rows, so it added nothing to the model.',
    );
    expect(AppendConstantFeatureWarning('Training completed.', [])).toBe('Training completed.');
  });
});
