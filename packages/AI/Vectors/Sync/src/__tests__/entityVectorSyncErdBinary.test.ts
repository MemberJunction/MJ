/**
 * `SaveEntityRecordDocument` writes the embedding twice: as JSON (VectorJSON) and as float32 bytes (VectorBinary), and
 * both must decode to the same vector. Real Entity Record Document objects; only Save is captured.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  return { ...actual, LogError: vi.fn() }; // the failures these tests cause are reported; the report is not the subject
});
import { EntityInfo, UserInfo } from '@memberjunction/core';
import { Base64ToFloat32Vector } from '@memberjunction/global';
import { MJEntityRecordDocumentEntity, MJVectorIndexEntity } from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';
import { EntitiesOnlyProvider } from '@memberjunction/unit-testing';
import { EntityVectorSyncer } from '../models/entityVectorSync';
import type { EmbeddingData } from '../generic/vectorSync.types';

/** Entity metadata keyed by ID, with the given fields. */
function entityInfo(name: string, fieldNames: string[]): EntityInfo {
  const id = `entity-${name}`;
  return new EntityInfo({
    ID: id, Name: name,
    Fields: ['ID', ...fieldNames].map((field, index) => ({
      ID: `${id}-${field}`, EntityID: id, Entity: name, Sequence: index + 1, Name: field,
      Type: field === 'EntityRecordUpdatedAt' ? 'datetimeoffset' : 'nvarchar', IsPrimaryKey: field === 'ID',
    })),
  });
}

const ERD_ENTITY = entityInfo('MJ: Entity Record Documents', [
  'EntityID', 'RecordID', 'EntityDocumentID', 'DocumentText', 'VectorIndexID', 'VectorID', 'VectorJSON', 'VectorBinary', 'EntityRecordUpdatedAt',
]);

/** An Entity Record Document whose Save records what it saved instead of writing it. */
class FakeErd extends MJEntityRecordDocumentEntity {
  public savedSnapshot: { VectorJSON: string | null; VectorBinary: string | null } | null = null;
  constructor() {
    super(ERD_ENTITY);
    this.NewRecord();
  }
  public override async Save(): Promise<boolean> {
    this.savedSnapshot = { VectorJSON: this.VectorJSON, VectorBinary: this.VectorBinary };
    return true;
  }
}

class TestableSyncer extends EntityVectorSyncer {
  public saveErd(data: EmbeddingData, existing: MJEntityRecordDocumentEntity | undefined, provider: EntitiesOnlyProvider, user: UserInfo): Promise<void> {
    return this.SaveEntityRecordDocument(data, existing, provider, user);
  }
}

function embeddingData(vector: number[]): EmbeddingData {
  return {
    ID: 1,
    Vector: vector,
    VectorID: 'vec-1',
    EntityData: {},
    __mj_recordID: 'rec-1',
    EntityDocument: { ID: 'doc-1', EntityID: 'ent-1' },
    TemplateContent: 'rendered text',
    VectorIndexID: 'vi-1',
  };
}

describe('EntityVectorSyncer.SaveEntityRecordDocument persists both vector columns', () => {
  const provider = new EntitiesOnlyProvider([]);
  const syncer = new TestableSyncer(provider);
  const user = new UserInfo();
  const index = new MJVectorIndexEntity(entityInfo('MJ: Vector Indexes', ['Name']));
  index.Hydrate({ ID: 'vi-1', Name: 'index' });

  beforeEach(() => {
    vi.spyOn(AIEngine.Instance, 'GetVectorIndexByID').mockReturnValue(index);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes VectorJSON and VectorBinary that decode to the same vector (existing ERD)', async () => {
    const erd = new FakeErd();
    const vector = [0.1, -0.25, 3.5, 0.2];

    await syncer.saveErd(embeddingData(vector), erd, provider, user);

    expect(erd.savedSnapshot).not.toBeNull();
    const json: number[] = JSON.parse(erd.savedSnapshot?.VectorJSON ?? 'null');
    expect(json).toEqual(vector);

    const binary = erd.savedSnapshot?.VectorBinary ?? null;
    expect(typeof binary).toBe('string');
    const bytes = Buffer.from(binary ?? '', 'base64');
    expect(bytes.length).toBe(vector.length * 4);
    const fromBytes = Array.from({ length: vector.length }, (_, i) => bytes.readFloatLE(i * 4));
    const viaHelper = Array.from(Base64ToFloat32Vector(binary) ?? []);

    for (const decoded of [fromBytes, viaHelper]) {
      expect(decoded).toHaveLength(json.length);
      decoded.forEach((v, i) => expect(v).toBeCloseTo(json[i], 6));
    }
    expect(erd.RecordID).toBe('rec-1');
    expect(erd.VectorIndexID).toBe('vi-1');
  });

  it('writes both columns on a newly created ERD too', async () => {
    const created = new FakeErd();
    vi.spyOn(provider, 'GetEntityObject').mockResolvedValue(created);

    await syncer.saveErd(embeddingData([0.5, -1.5]), undefined, provider, user);

    expect(created.savedSnapshot?.VectorJSON).toBe(JSON.stringify([0.5, -1.5]));
    expect(Array.from(Base64ToFloat32Vector(created.savedSnapshot?.VectorBinary) ?? [])).toEqual([0.5, -1.5]);
  });

  it('writes nothing when the vector index is not in the AIEngine cache', async () => {
    vi.spyOn(AIEngine.Instance, 'GetVectorIndexByID').mockReturnValue(undefined);
    const erd = new FakeErd();

    await syncer.saveErd(embeddingData([0.5]), erd, provider, user);

    expect(erd.savedSnapshot).toBeNull();
    expect(erd.VectorBinary).toBeNull();
  });
});
