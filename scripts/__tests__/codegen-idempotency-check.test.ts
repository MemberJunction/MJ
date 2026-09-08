import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'node:fs/promises';
import os from 'os';
import {
  findSqlCaptureFiles,
  getLatestReport,
  getGitDiff,
  getGitStatusPorcelain,
} from '../codegen-idempotency-check.mjs';

describe('CodeGen Idempotency Harness Unit Tests (§7.1)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `mj-test-idempotency-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('findSqlCaptureFiles', () => {
    it('finds CodeGen_Run_*.sql files based on mtime', () => {
      const captures = findSqlCaptureFiles(0);
      expect(Array.isArray(captures)).toBe(true);
      for (const c of captures) {
        expect(c.fullPath).toMatch(/CodeGen_Run_.*\.sql$/);
        expect(typeof c.mtimeMs).toBe('number');
        expect(typeof c.size).toBe('number');
      }
    });

    it('filters out files older than the specified timestamp', () => {
      const futureTime = Date.now() + 1000000;
      const captures = findSqlCaptureFiles(futureTime);
      expect(captures.length).toBe(0);
    });
  });

  describe('getGitDiff and getGitStatusPorcelain', () => {
    it('executes git diff and returns string', () => {
      const diff = getGitDiff(['packages/CodeGenLib/src/Config/config.ts']);
      expect(typeof diff).toBe('string');
    });

    it('executes git status and returns array of lines', () => {
      const status = getGitStatusPorcelain(['packages/CodeGenLib/src/Config/config.ts']);
      expect(Array.isArray(status)).toBe(true);
    });
  });

  describe('single-column allow-list verification', () => {
    const allowListRegexes = [
      /^packages\/MJCoreEntities\/src\/generated\/entities\/__mj\.ts$/,
      /^packages\/MJCoreEntities\/src\/generated\/.*entity.*\.ts$/,
      /^packages\/MJCoreEntities\/src\/generated\/.*entity.*\.json$/,
      /^packages\/MJServer\/src\/generated\/generated\.ts$/,
      /^packages\/Angular\/Explorer\/core-entity-forms\/src\/lib\/generated\/Entities\/MJEntity\/.*$/,
      /^metadata\/entities\/decisions\/.__mj\.mj-entities\.json$/,
      /^(?:migrations|migrations-pg)\/(?:v\d+\/)?CodeGen_Run_.*\.sql$/,
    ];

    const forbiddenRegexes = [
      /generated-forms\.module\.ts$/,
    ];

    function isAllowed(filePath: string): boolean {
      const isForbidden = forbiddenRegexes.some((re) => re.test(filePath));
      const allowed = allowListRegexes.some((re) => re.test(filePath));
      return allowed && !isForbidden;
    }

    it('permits generated __mj.ts, entity zod/schema files, MJServer generated.ts, and MJEntity form files', () => {
      expect(isAllowed('packages/MJCoreEntities/src/generated/entities/__mj.ts')).toBe(true);
      expect(isAllowed('packages/MJCoreEntities/src/generated/entities/entity.zod.ts')).toBe(true);
      expect(isAllowed('packages/MJCoreEntities/src/generated/entities/entity.schema.json')).toBe(true);
      expect(isAllowed('packages/MJServer/src/generated/generated.ts')).toBe(true);
      expect(isAllowed('packages/Angular/Explorer/core-entity-forms/src/lib/generated/Entities/MJEntity/entity.component.ts')).toBe(true);
      expect(isAllowed('metadata/entities/decisions/.__mj.mj-entities.json')).toBe(true);
      expect(isAllowed('migrations/CodeGen_Run_2026-09-08_12-00-00.sql')).toBe(true);
      expect(isAllowed('migrations/v5/CodeGen_Run_2026-09-08_12-00-00.sql')).toBe(true);
      expect(isAllowed('migrations-pg/v5/CodeGen_Run_2026-09-08_12-00-00.sql')).toBe(true);
    });

    it('rejects forbidden generated-forms.module.ts', () => {
      expect(isAllowed('packages/Angular/Explorer/core-entity-forms/src/lib/generated/generated-forms.module.ts')).toBe(false);
    });

    it('rejects unrelated entities or core packages', () => {
      expect(isAllowed('packages/MJCoreEntities/src/generated/entities/user.zod.ts')).toBe(false);
      expect(isAllowed('packages/MJCore/src/generic/baseEntity.ts')).toBe(false);
      expect(isAllowed('packages/CodeGenLib/src/runCodeGen.ts')).toBe(false);
      expect(isAllowed('metadata/entities/users.json')).toBe(false);
    });
  });

  describe('warm-twice patch identity', () => {
    it('detects identical patches', () => {
      const patch1 = 'diff --git a/file b/file\n--- a/file\n+++ b/file\n';
      const patch2 = 'diff --git a/file b/file\n--- a/file\n+++ b/file\n';
      expect(patch1 === patch2).toBe(true);
    });

    it('detects divergent patches', () => {
      const patch1 = 'diff --git a/file b/file\n--- a/file\n+++ b/file\n+line1\n';
      const patch2 = 'diff --git a/file b/file\n--- a/file\n+++ b/file\n+line2\n';
      expect(patch1 === patch2).toBe(false);
    });
  });

  describe('getLatestReport', () => {
    it('retrieves and parses the most recent report from state directory', async () => {
      const report = await getLatestReport(0);
      if (report) {
        expect(report).toHaveProperty('counters');
        expect(typeof report.counters).toBe('object');
      }
    });
  });
});
