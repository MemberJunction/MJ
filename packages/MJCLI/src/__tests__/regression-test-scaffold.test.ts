import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  BuildScaffold,
  FormatTestNumber,
  NextTestNumber,
  ParseTestNumber,
  REGRESSION_PARITY_SCRIPT,
  REGRESSION_SUITE_FILE,
  REGRESSION_TESTS_DIR,
  SlugifyTitle,
  WriteScaffold,
  type ScaffoldOptions,
} from '../lib/regression/test-scaffold';

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const UUID_UPPER = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/;

type JsonRecord = { [key: string]: JsonRecord | JsonRecord[] | string | number | boolean | null };

let roots: string[] = [];
afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots = [];
});

const T001 = {
  fields: {
    TypeID: '@lookup:MJ: Test Types.Name=Computer Use',
    Name: 'T001 - Login Smoke',
    Description: 'Logs in.',
    InputDefinition: JSON.stringify({ goal: 'Log in.', startUrl: 'http://localhost:4200' }, null, 2),
    ExpectedOutcomes: JSON.stringify({ judgeValidationCriteria: ['Logged in'] }, null, 2),
    Configuration: {
      maxSteps: 35,
      maxExecutionTime: 420000,
      judgeFrequency: 'EveryNSteps:5',
      ReplayScript: '@file:regression/scripts/t001-login-smoke.json',
      PendingReplayScript: '@file:regression/scripts/t001-login-smoke.pending.json',
      oracles: [
        { type: 'url-match', weight: 0.5, config: { pattern: '^http://localhost:4200' } },
        { type: 'step-count', weight: 0.5, config: { maxSteps: 35 } },
      ],
    },
    Status: 'Active',
    Tags: 'P0,regression,smoke',
  },
  primaryKey: { ID: 'C9FE51A9-8750-47FD-A6B6-347ED5E53A65' },
};

const SUITE = {
  fields: { Name: 'MJ Explorer Regression Suite', Status: 'Active' },
  relatedEntities: {
    'MJ: Test Suite Tests': [
      {
        fields: { SuiteID: '@parent:ID', TestID: '@lookup:MJ: Tests.Name=T001 - Login Smoke', Sequence: 1, Status: 'Active' },
        primaryKey: { ID: '8CED55DE-3FC4-414F-BEEA-49F808314738' },
      },
    ],
  },
  primaryKey: { ID: '71428DF0-78F4-4775-95E5-A52D2B4602D1' },
};

/** Builds a fixture repo holding T001, its replay scripts, and a one-member suite. */
function makeRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'regression-scaffold-'));
  roots.push(root);
  mkdirSync(path.join(root, REGRESSION_TESTS_DIR, 'scripts'), { recursive: true });
  writeFileSync(path.join(root, REGRESSION_TESTS_DIR, '.T001-login-smoke.json'), JSON.stringify(T001, null, 2) + '\n');
  writeFileSync(path.join(root, REGRESSION_TESTS_DIR, 'scripts', 't001-login-smoke.json'), '{}');
  writeFileSync(path.join(root, REGRESSION_TESTS_DIR, 'scripts', 't001-login-smoke.pending.json'), '{}');
  mkdirSync(path.dirname(path.join(root, REGRESSION_SUITE_FILE)), { recursive: true });
  writeFileSync(path.join(root, REGRESSION_SUITE_FILE), JSON.stringify(SUITE, null, 2));
  return root;
}

const OPTIONS: ScaffoldOptions = {
  Title: 'Form builder clones a form',
  Goal: 'Open the Forms list, clone Contact Form, and verify the copy opens in the editor.',
  Criteria: ['A new form named Copy of Contact Form is listed', 'The form editor is open on the copy'],
  Priority: 'P1',
  Tags: ['form-builder', 'Regression', 'p2'],
  StartPath: '/app/form-builder',
  MaxSteps: 25,
};

describe('test number helpers', () => {
  it('formats and parses test numbers', () => {
    expect(FormatTestNumber(7)).toBe('T007');
    expect(FormatTestNumber(1234)).toBe('T1234');
    expect(ParseTestNumber('T149')).toBe(149);
    expect(ParseTestNumber('149')).toBe(149);
    expect(() => ParseTestNumber('latest')).toThrow('is not a test number');
  });

  it('picks the highest test number plus one', () => {
    expect(NextTestNumber(['.T001-a.json', '.T155-b.json', 'README.md', '.mj-sync.json', 'scripts'])).toBe(156);
    expect(NextTestNumber([])).toBe(1);
  });

  it('slugifies a title', () => {
    expect(SlugifyTitle('Form Builder: clone a form!')).toBe('form-builder-clone-a-form');
  });
});

describe('BuildScaffold', () => {
  it('builds the next test and its suite member', () => {
    const result = BuildScaffold(makeRepo(), OPTIONS);

    expect(result.Number).toBe(2);
    expect(result.Name).toBe('T002 - Form builder clones a form');
    expect(result.Sequence).toBe(2);
    expect(result.TestFilePath).toBe(`${REGRESSION_TESTS_DIR}/.T002-form-builder-clones-a-form.json`);

    const record = JSON.parse(result.TestFileContent);
    expect(record.primaryKey.ID).toMatch(UUID_UPPER);
    expect(record.fields.Tags).toBe('P1,regression,form-builder');
    expect(typeof record.fields.InputDefinition).toBe('string');
    const input = JSON.parse(record.fields.InputDefinition);
    expect(input.goal).toBe(OPTIONS.Goal);
    expect(input.startUrl).toBe('http://localhost:4200/app/form-builder');
    const expected = JSON.parse(record.fields.ExpectedOutcomes);
    expect(expected.judgeValidationCriteria).toEqual(OPTIONS.Criteria);
    expect(expected.finalUrlPattern).toBe('^http://localhost:4200/app/form-builder');
    const oracles: JsonRecord[] = record.fields.Configuration.oracles;
    expect(oracles.find((o) => o.type === 'url-match')?.config).toEqual({ pattern: '^http://localhost:4200/app/form-builder' });
    expect(oracles.find((o) => o.type === 'step-count')?.config).toEqual({ maxSteps: 25 });
    expect(record.fields.Configuration.maxSteps).toBe(25);
    expect(record.fields.Configuration.maxExecutionTime).toBe(300000);

    const suite = JSON.parse(result.SuiteFileContent);
    const members = suite.relatedEntities['MJ: Test Suite Tests'];
    expect(members[0]).toEqual(SUITE.relatedEntities['MJ: Test Suite Tests'][0]);
    expect(members[1].fields).toEqual({
      SuiteID: '@parent:ID',
      TestID: '@lookup:MJ: Tests.Name=T002 - Form builder clones a form',
      Sequence: 2,
      Status: 'Active',
    });
    expect(members[1].primaryKey.ID).toMatch(UUID_UPPER);
  });

  it('writes the same fields, in the same order and with the same defaults, as the committed tests', () => {
    const committed = JSON.parse(readFileSync(path.join(REPO_ROOT, REGRESSION_TESTS_DIR, '.T001-login-smoke.json'), 'utf8'));
    const record = JSON.parse(BuildScaffold(makeRepo(), OPTIONS).TestFileContent);
    const authored = ['TypeID', 'Name', 'Description', 'InputDefinition', 'ExpectedOutcomes', 'Configuration', 'Status', 'Tags'];

    expect(Object.keys(record.fields)).toEqual(Object.keys(committed.fields));
    for (const key of Object.keys(committed.fields).filter((k) => !authored.includes(k))) {
      expect(record.fields[key], key).toEqual(committed.fields[key]);
    }
  });

  it('keeps the login exclusion when the test starts at the app root', () => {
    const record = JSON.parse(BuildScaffold(makeRepo(), { ...OPTIONS, StartPath: '' }).TestFileContent);
    expect(JSON.parse(record.fields.ExpectedOutcomes).finalUrlPattern).toBe('^http://localhost:4200(?!/login|/callback)');
  });

  it('copies Configuration from --from without its replay scripts', () => {
    const record = JSON.parse(BuildScaffold(makeRepo(), { ...OPTIONS, FromNumber: 1 }).TestFileContent);
    const configuration = record.fields.Configuration;
    expect(configuration.judgeFrequency).toBe('EveryNSteps:5');
    expect(configuration.ReplayScript).toBeUndefined();
    expect(configuration.PendingReplayScript).toBeUndefined();
    expect(configuration.maxSteps).toBe(25);
  });

  it('rejects a title with "&", empty criteria, and an unknown --from test', () => {
    const root = makeRepo();
    expect(() => BuildScaffold(root, { ...OPTIONS, Title: 'Save & close' })).toThrow('"&"');
    expect(() => BuildScaffold(root, { ...OPTIONS, Criteria: [' '] })).toThrow('--criteria');
    expect(() => BuildScaffold(root, { ...OPTIONS, FromNumber: 99 })).toThrow('.T099-');
  });
});

describe('WriteScaffold', () => {
  it('writes files that pass the regression suite parity guard', () => {
    const root = makeRepo();
    const result = BuildScaffold(root, OPTIONS);
    WriteScaffold(root, result);

    expect(readFileSync(path.join(root, result.TestFilePath), 'utf8')).toBe(result.TestFileContent);
    const guard = spawnSync(process.execPath, [path.join(REPO_ROOT, REGRESSION_PARITY_SCRIPT), '--root', root], { encoding: 'utf8' });
    expect(guard.stderr).toBe('');
    expect(guard.status).toBe(0);
  });

  it('refuses to overwrite an existing test file', () => {
    const root = makeRepo();
    const result = BuildScaffold(root, OPTIONS);
    WriteScaffold(root, result);
    expect(() => WriteScaffold(root, result)).toThrow('already exists');
  });
});
