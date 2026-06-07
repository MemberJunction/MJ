import { describe, it, expect, beforeEach } from 'vitest';
import type { EntityInfo } from '@memberjunction/core';
import type { MJEntityDocumentEntity } from '@memberjunction/core-entities';
import {
  DEFAULT_CLUSTER_VIEW_CONFIG,
  toClusterViewConfig,
} from '../lib/view-type/cluster-view.types';
import { EntityDocumentAvailabilityEngine } from '../lib/view-type/entity-document-availability.engine';

// NOTE: We intentionally do NOT import ClusterViewType / the renderer here — those pull the
// Angular component graph (ng-entity-viewer) which needs the JIT compiler in a unit-test env.
// The Cluster descriptor's IsAvailableFor simply delegates to the availability engine tested
// below, and the renderer/prop-sheet are exercised via the live Playwright pass.

// Minimal EntityInfo stand-in — only the fields the code under test reads.
function entity(id: string): EntityInfo {
  return { ID: id, Name: `Entity ${id}` } as unknown as EntityInfo;
}

// Minimal Entity Document stand-in — only EntityID is read.
function doc(entityId: string): MJEntityDocumentEntity {
  return { EntityID: entityId } as unknown as MJEntityDocumentEntity;
}

/** Seed the availability engine's private cache without hitting the database. */
function seedDocs(docs: MJEntityDocumentEntity[]): void {
  (EntityDocumentAvailabilityEngine.Instance as unknown as { _entityDocuments: MJEntityDocumentEntity[] })._entityDocuments = docs;
}

describe('toClusterViewConfig', () => {
  it('returns the full defaults for empty / null input', () => {
    expect(toClusterViewConfig(null)).toEqual(DEFAULT_CLUSTER_VIEW_CONFIG);
    expect(toClusterViewConfig(undefined)).toEqual(DEFAULT_CLUSTER_VIEW_CONFIG);
    expect(toClusterViewConfig({})).toEqual(DEFAULT_CLUSTER_VIEW_CONFIG);
  });

  it('preserves valid provided values', () => {
    const cfg = toClusterViewConfig({ algorithm: 'dbscan', k: 8, dimensions: 3, colorBy: 'entity', maxRecords: 1000, nameClusters: false });
    expect(cfg).toEqual({ algorithm: 'dbscan', k: 8, dimensions: 3, colorBy: 'entity', maxRecords: 1000, nameClusters: false });
  });

  it('coerces invalid enum-ish values to safe defaults', () => {
    const cfg = toClusterViewConfig({ algorithm: 'bogus', dimensions: 5, colorBy: 'rainbow' });
    expect(cfg.algorithm).toBe('kmeans');
    expect(cfg.dimensions).toBe(2);
    expect(cfg.colorBy).toBe('cluster');
  });

  it('falls back to defaults for wrong-typed numerics/booleans', () => {
    const cfg = toClusterViewConfig({ k: 'lots', maxRecords: null, nameClusters: 'yes' });
    expect(cfg.k).toBe(DEFAULT_CLUSTER_VIEW_CONFIG.k);
    expect(cfg.maxRecords).toBe(DEFAULT_CLUSTER_VIEW_CONFIG.maxRecords);
    expect(cfg.nameClusters).toBe(DEFAULT_CLUSTER_VIEW_CONFIG.nameClusters);
  });
});

describe('EntityDocumentAvailabilityEngine.HasActiveDocumentForEntity', () => {
  beforeEach(() => seedDocs([]));

  it('returns false when no entity is supplied', () => {
    expect(EntityDocumentAvailabilityEngine.Instance.HasActiveDocumentForEntity(null)).toBe(false);
  });

  it('returns false when the entity has no active document', () => {
    seedDocs([doc('AAAAAAAA-0000-0000-0000-000000000001')]);
    expect(EntityDocumentAvailabilityEngine.Instance.HasActiveDocumentForEntity(entity('BBBBBBBB-0000-0000-0000-000000000002'))).toBe(false);
  });

  it('returns true when the entity has an active document', () => {
    const id = 'AAAAAAAA-0000-0000-0000-000000000001';
    seedDocs([doc(id)]);
    expect(EntityDocumentAvailabilityEngine.Instance.HasActiveDocumentForEntity(entity(id))).toBe(true);
  });

  it('matches UUIDs case-insensitively (SQL Server vs PostgreSQL casing)', () => {
    seedDocs([doc('aaaaaaaa-0000-0000-0000-000000000001')]);
    expect(EntityDocumentAvailabilityEngine.Instance.HasActiveDocumentForEntity(entity('AAAAAAAA-0000-0000-0000-000000000001'))).toBe(true);
  });
});
