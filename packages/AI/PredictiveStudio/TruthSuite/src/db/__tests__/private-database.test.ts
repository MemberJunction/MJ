import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
import { TruthSuite } from '../../truth-suite';
import { PrivateTruthDatabase } from '../private-database';

/** The CommonJS twin's exports (codegen/private-database.cjs). */
interface PrivateDatabaseCjs {
  PRIVATE_TRUTH_DATABASE: RegExp;
  PRIVATE_TRUTH_DATABASE_DESCRIPTION: string;
  IsPrivateTruthDatabase(name: string | null | undefined): boolean;
}

const cjs: PrivateDatabaseCjs = createRequire(import.meta.url)(path.join(TruthSuite.Root(), 'codegen', 'private-database.cjs'));

describe('the private-database rule', () => {
  it('is the same rule in the CodeGen/provision twin and the harness twin', () => {
    expect(cjs.PRIVATE_TRUTH_DATABASE.source).toBe(PrivateTruthDatabase.Pattern.source);
    expect(cjs.PRIVATE_TRUTH_DATABASE.flags).toBe(PrivateTruthDatabase.Pattern.flags);
    expect(cjs.PRIVATE_TRUTH_DATABASE_DESCRIPTION).toBe(PrivateTruthDatabase.Description);
  });
  it('allows only private per-agent databases and CI test', () => {
    for (const name of ['MJ_PS_PR2_alpha', 'MJ_PS_PR12_x', 'test']) {
      expect(PrivateTruthDatabase.IsAllowed(name)).toBe(true);
      expect(cjs.IsPrivateTruthDatabase(name)).toBe(true);
    }
    for (const name of ['MJ_20260925', 'MJ_PS_PR_alpha', 'MJ_PS_PRx_alpha', 'test2', 'mytest', '', undefined, null]) {
      expect(PrivateTruthDatabase.IsAllowed(name)).toBe(false);
      expect(cjs.IsPrivateTruthDatabase(name)).toBe(false);
    }
  });
});
