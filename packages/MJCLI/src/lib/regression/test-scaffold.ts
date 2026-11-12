/**
 * Builds new MJ Explorer regression tests: the `.T###-<slug>.json` test record and its member row
 * in `.regression-suite.json`. Building and writing are separate so callers can preview the result.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const REGRESSION_TESTS_DIR = 'metadata-optional/regression-test/tests/regression';
export const REGRESSION_SUITE_FILE = 'metadata-optional/regression-test/test-suites/.regression-suite.json';
export const REGRESSION_PARITY_SCRIPT = '.github/scripts/check-regression-suite.mjs';

const COMPUTER_USE_TYPE = '@lookup:MJ: Test Types.Name=Computer Use';
const MEMBER_ENTITY = 'MJ: Test Suite Tests';
const BASE_URL = 'http://localhost:4200';
const ALLOWED_DOMAINS = ['localhost', '*.auth0.com'];
const NOT_LOGIN_PAGE = '(?!/login|/callback)';
const MS_PER_STEP = 12000;
const MIN_EXECUTION_MS = 300000;
const TEST_FILE_RE = /^\.T(\d{3,})-.+\.json$/;
const PRIORITIES = ['P0', 'P1', 'P2', 'P3'] as const;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;
export type JsonObject = { [key: string]: JsonValue };

export type RegressionPriority = (typeof PRIORITIES)[number];

type RegressionTestFile = {
  fields: {
    TypeID: string;
    Name: string;
    Description: string;
    InputDefinition: string;
    ExpectedOutcomes: string;
    Configuration: JsonObject;
    Status: string;
    Tags: string;
    Priority: number;
    EstimatedDurationSeconds: null;
    EstimatedCostUSD: null;
    RepeatCount: null;
    MaxExecutionTimeMS: null;
    Variables: null;
    SkipEmbeddings: boolean;
    RubricID: null;
  };
  primaryKey: { ID: string };
};

/** The values `mj sync pull` writes for the `MJ: Tests` fields the scaffold does not author. */
const PULLED_FIELD_DEFAULTS = {
  Priority: 0,
  EstimatedDurationSeconds: null,
  EstimatedCostUSD: null,
  RepeatCount: null,
  MaxExecutionTimeMS: null,
  Variables: null,
  SkipEmbeddings: false,
  RubricID: null,
} as const;

type RegressionSuiteMember = {
  fields: { SuiteID: string; TestID: string; Sequence: number; Status: string };
  primaryKey: { ID: string };
};

type RegressionSuiteFile = {
  relatedEntities: { [entity: string]: JsonValue[] };
};

export interface ScaffoldOptions {
  /** Title without the `T### - ` prefix. */
  Title: string;
  /** What the controller LLM must achieve, stated as the success state. */
  Goal: string;
  /** Judge criteria, checked against the final screenshot. */
  Criteria: string[];
  Priority: RegressionPriority;
  /** Area tags. The priority and `regression` are always added. */
  Tags: string[];
  /** Path after the base URL, e.g. `/app/form-builder`. Empty for the app root. */
  StartPath: string;
  MaxSteps: number;
  /** Defaults to the goal. */
  Description?: string;
  /** Copy `Configuration` from this existing test number. */
  FromNumber?: number;
}

export interface ScaffoldResult {
  Number: number;
  Name: string;
  Sequence: number;
  /** Repo-relative path of the new test file. */
  TestFilePath: string;
  TestFileContent: string;
  SuiteFileContent: string;
}

export function IsRegressionPriority(value: string): value is RegressionPriority {
  return (PRIORITIES as readonly string[]).includes(value);
}

/** Formats a test number as `T###`. */
export function FormatTestNumber(n: number): string {
  return `T${String(n).padStart(3, '0')}`;
}

/** Parses `T149` or `149` into `149`. */
export function ParseTestNumber(text: string): number {
  const match = /^T?(\d+)$/i.exec(text.trim());
  if (!match) throw new Error(`"${text}" is not a test number (use T149 or 149).`);
  return Number(match[1]);
}

/** Turns a title into the kebab-case part of a test file name. */
export function SlugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

/** Returns the highest `.T###-*.json` number plus one. */
export function NextTestNumber(fileNames: string[]): number {
  let max = 0;
  for (const name of fileNames) {
    const match = TEST_FILE_RE.exec(name);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max + 1;
}

function newRecordId(): string {
  return randomUUID().toUpperCase();
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeStartPath(startPath: string): string {
  const trimmed = startPath.trim();
  if (trimmed === '' || trimmed === '/') return '';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function buildTags(priority: RegressionPriority, tags: string[]): string {
  const extra = tags
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t !== '' && t !== 'regression' && !/^p[0-3]$/.test(t));
  return [priority, 'regression', ...new Set(extra)].join(',');
}

/** Validates the options and returns the trimmed, non-empty criteria. */
function validateOptions(options: ScaffoldOptions): string[] {
  if (options.Title.trim() === '') throw new Error('A test title is required.');
  if (options.Title.includes('&')) throw new Error('The title must not contain "&" (it breaks the @lookup parser). Use "and".');
  if (options.Goal.trim() === '') throw new Error('A goal is required.');
  const criteria = options.Criteria.map((c) => c.trim()).filter((c) => c !== '');
  if (criteria.length === 0) throw new Error('At least one --criteria is required.');
  if (!Number.isInteger(options.MaxSteps) || options.MaxSteps < 1) throw new Error('--max-steps must be a positive integer.');
  return criteria;
}

function defaultConfiguration(): JsonObject {
  return {
    headless: true,
    maxSteps: 0,
    maxExecutionTime: 0,
    screenshotHistoryDepth: 3,
    viewportWidth: 1280,
    viewportHeight: 720,
    controllerPromptName: 'Computer Use - Controller',
    judgePromptName: 'Computer Use - Judge',
    judgeFrequency: 'EveryNSteps:3',
    oracles: [
      { type: 'goal-completion', weight: 0.5, config: { minConfidence: 0.7 } },
      { type: 'url-match', weight: 0.3, config: { pattern: '' } },
      { type: 'step-count', weight: 0.2, config: { maxSteps: 0 } },
    ],
    scoringWeights: { 'goal-completion': 0.5, 'url-match': 0.3, 'step-count': 0.2 },
  };
}

/** Builds Configuration from a source test (minus its replay scripts) or from the default template. */
function buildConfiguration(maxSteps: number, finalUrlPattern: string, source: JsonObject | undefined): JsonObject {
  const configuration: JsonObject = source ? structuredClone(source) : defaultConfiguration();
  delete configuration.ReplayScript;
  delete configuration.PendingReplayScript;
  configuration.maxSteps = maxSteps;
  configuration.maxExecutionTime = Math.max(MIN_EXECUTION_MS, maxSteps * MS_PER_STEP);
  const oracles = configuration.oracles;
  if (Array.isArray(oracles)) {
    for (const oracle of oracles) {
      if (!isJsonObject(oracle) || !isJsonObject(oracle.config)) continue;
      if (oracle.type === 'url-match') oracle.config.pattern = finalUrlPattern;
      if (oracle.type === 'step-count') oracle.config.maxSteps = maxSteps;
    }
  }
  return configuration;
}

function readSourceConfiguration(testsDir: string, fileNames: string[], fromNumber: number): JsonObject {
  const prefix = `.${FormatTestNumber(fromNumber)}-`;
  const file = fileNames.find((n) => n.startsWith(prefix) && n.endsWith('.json'));
  if (!file) throw new Error(`No test file starts with ${prefix} in ${REGRESSION_TESTS_DIR}.`);
  const source = JSON.parse(readFileSync(path.join(testsDir, file), 'utf8')) as RegressionTestFile;
  return source.fields.Configuration;
}

function suiteMembers(suite: RegressionSuiteFile): RegressionSuiteMember[] {
  const list = suite.relatedEntities?.[MEMBER_ENTITY];
  if (!Array.isArray(list)) throw new Error(`${REGRESSION_SUITE_FILE} has no relatedEntities["${MEMBER_ENTITY}"].`);
  return list as RegressionSuiteMember[];
}

function buildInputDefinition(goal: string, startUrl: string): string {
  const input = {
    goal,
    startUrl,
    allowedDomains: ALLOWED_DOMAINS,
    auth: {
      bindings: [
        {
          domains: ALLOWED_DOMAINS,
          method: { Type: 'Basic', Username: '{{authUsername}}', Password: '{{authPassword}}', Strategy: 'FormLogin' },
        },
      ],
    },
  };
  return JSON.stringify(input, null, 2);
}

function buildExpectedOutcomes(finalUrlPattern: string, maxSteps: number, criteria: string[]): string {
  const expected = { goalCompleted: true, finalUrlPattern, minConfidence: 0.7, maxSteps, judgeValidationCriteria: criteria };
  return JSON.stringify(expected, null, 2);
}

/** Appends a member for `name` to the suite and returns its Sequence. */
function appendSuiteMember(suite: RegressionSuiteFile, name: string): number {
  const members = suiteMembers(suite);
  const sequence = members.reduce((max, m) => Math.max(max, m.fields.Sequence), 0) + 1;
  members.push({
    fields: { SuiteID: '@parent:ID', TestID: `@lookup:MJ: Tests.Name=${name}`, Sequence: sequence, Status: 'Active' },
    primaryKey: { ID: newRecordId() },
  });
  return sequence;
}

/** Builds the new test record and the updated suite file. Writes nothing. */
export function BuildScaffold(repoRoot: string, options: ScaffoldOptions): ScaffoldResult {
  const criteria = validateOptions(options);
  const testsDir = path.join(repoRoot, REGRESSION_TESTS_DIR);
  const fileNames = readdirSync(testsDir);
  const number = NextTestNumber(fileNames);
  const title = options.Title.trim();
  const name = `${FormatTestNumber(number)} - ${title}`;
  const startPath = normalizeStartPath(options.StartPath);
  const startUrl = `${BASE_URL}${startPath}`;
  const finalUrlPattern = `^${escapeRegExp(startUrl)}${startPath === '' ? NOT_LOGIN_PAGE : ''}`;
  const source = options.FromNumber === undefined ? undefined : readSourceConfiguration(testsDir, fileNames, options.FromNumber);

  const record: RegressionTestFile = {
    fields: {
      TypeID: COMPUTER_USE_TYPE,
      Name: name,
      Description: (options.Description ?? options.Goal).trim(),
      InputDefinition: buildInputDefinition(options.Goal.trim(), startUrl),
      ExpectedOutcomes: buildExpectedOutcomes(finalUrlPattern, options.MaxSteps, criteria),
      Configuration: buildConfiguration(options.MaxSteps, finalUrlPattern, source),
      Status: 'Active',
      Tags: buildTags(options.Priority, options.Tags),
      ...PULLED_FIELD_DEFAULTS,
    },
    primaryKey: { ID: newRecordId() },
  };

  const suiteText = readFileSync(path.join(repoRoot, REGRESSION_SUITE_FILE), 'utf8');
  const suite = JSON.parse(suiteText) as RegressionSuiteFile;
  const sequence = appendSuiteMember(suite, name);

  return {
    Number: number,
    Name: name,
    Sequence: sequence,
    TestFilePath: `${REGRESSION_TESTS_DIR}/.${FormatTestNumber(number)}-${SlugifyTitle(title)}.json`,
    TestFileContent: `${JSON.stringify(record, null, 2)}\n`,
    SuiteFileContent: JSON.stringify(suite, null, 2) + (suiteText.endsWith('\n') ? '\n' : ''),
  };
}

/** Writes the test file and the updated suite file. Refuses to overwrite a test file. */
export function WriteScaffold(repoRoot: string, result: ScaffoldResult): void {
  const testPath = path.join(repoRoot, result.TestFilePath);
  if (existsSync(testPath)) throw new Error(`${result.TestFilePath} already exists.`);
  writeFileSync(testPath, result.TestFileContent);
  writeFileSync(path.join(repoRoot, REGRESSION_SUITE_FILE), result.SuiteFileContent);
}
