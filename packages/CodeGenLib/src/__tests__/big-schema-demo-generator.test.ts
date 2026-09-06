import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const generator = path.resolve(here, '../../../../Demos/BigSchemaDemo/generate.mjs');

describe('BigSchemaDemo generate.mjs', () => {
  it('emits a deterministic smoke catalog: 3 schemas, 36 tables, FKs and seed', () => {
    const out = mkdtempSync(path.join(tmpdir(), 'bsd-smoke-'));
    try {
      const result = spawnSync(process.execPath, [generator, '--profile', 'smoke', '--out', out], {
        encoding: 'utf8',
      });
      expect(result.status).toBe(0);
      const manifest = JSON.parse(readFileSync(path.join(out, 'manifest.json'), 'utf8'));
      expect(manifest.schemas).toBe(3);
      expect(manifest.tables).toBe(36);
      expect(manifest.foreignKeysApprox).toBeGreaterThan(36);
      expect(manifest.domains).toEqual(['bsd_crm', 'bsd_billing', 'bsd_inventory']);
      const tables = readFileSync(path.join(out, '02_tables.sql'), 'utf8');
      expect(tables).toContain('CREATE TABLE [bsd_crm].[CrmHub]');
      expect(tables).toContain('CREATE TABLE [bsd_billing].[BillingBridge]');
      const fks = readFileSync(path.join(out, '03_fks.sql'), 'utf8');
      expect(fks).toContain('FK_bsd_billing_BillingBridge_RemoteHub');
      expect(fks).toContain('[bsd_crm].[CrmHub]');
      const seed = readFileSync(path.join(out, '04_seed.sql'), 'utf8');
      expect(seed).toMatch(/B5D00000-0000-4000-80/i);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it('emits the standard catalog counts without applying SQL', () => {
    const out = mkdtempSync(path.join(tmpdir(), 'bsd-std-'));
    try {
      const result = spawnSync(process.execPath, [generator, '--profile', 'standard', '--out', out], {
        encoding: 'utf8',
      });
      expect(result.status).toBe(0);
      const manifest = JSON.parse(readFileSync(path.join(out, 'manifest.json'), 'utf8'));
      expect(manifest.schemas).toBe(24);
      expect(manifest.tables).toBe(2880);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});
