import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AgentEvalScenarioManifest,
  RubricCalibration,
  type AgentEvalManifest,
  type AgentEvalRubricCriterionKey,
  type CalibrationFixtureFile,
} from '../index';

const FIXTURES_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'calibration-fixtures.json');

function LoadFixtures(): CalibrationFixtureFile {
  return JSON.parse(readFileSync(FIXTURES_PATH, 'utf8')) as CalibrationFixtureFile;
}

const TEXT_CRITERIA: readonly AgentEvalRubricCriterionKey[] = [
  'censoring-named',
  'asks-what-to-improve',
  'failure-reported',
];

describe('RubricCalibration — Attack 4', () => {
  it('provides at least 60 constructed items per text criterion with valid carrying-span labels', () => {
    const fixtures = LoadFixtures();

    for (const key of TEXT_CRITERIA) {
      const group = fixtures.items.filter((item) => item.criterionKey === key);
      expect(group.length).toBeGreaterThanOrEqual(60);

      const deleted = group.filter((item) => item.operation === 'delete-carrying-span');
      const inserted = group.filter((item) => item.operation === 'insert-template-span');
      expect(deleted.length).toBeGreaterThan(0);
      expect(inserted.length).toBeGreaterThan(0);

      for (const item of deleted) {
        expect(item.expectedLabel).toBe(false);
        expect(RubricCalibration.EvaluateConstructedCriterion(item)).toBe(false);
      }
      for (const item of inserted) {
        expect(item.expectedLabel).toBe(true);
        expect(RubricCalibration.EvaluateConstructedCriterion(item)).toBe(true);
      }
    }

    const offTopicQuestions = fixtures.items.filter(
      (item) => item.criterionKey === 'asks-what-to-improve' && item.operation === 'insert-off-topic-question'
    );
    expect(offTopicQuestions.length).toBeGreaterThan(0);
    for (const item of offTopicQuestions) {
      expect(item.expectedLabel).toBe(false);
      expect(RubricCalibration.EvaluateConstructedCriterion(item)).toBe(false);
    }
  });

  it('achieves Wilson 95% lower bound >= 0.85 per criterion and reproduces stored agreement from seed', () => {
    const fixtures = LoadFixtures();
    const rebuilt = RubricCalibration.BuildFixtures(fixtures.seed);
    expect(rebuilt.items).toEqual(fixtures.items);

    const overallVerdicts = fixtures.items.map((item) => RubricCalibration.EvaluateConstructedCriterion(item));
    const overallAgreement = RubricCalibration.Agreement(fixtures.items, overallVerdicts);
    expect(overallAgreement.Interval.Lower).toBeGreaterThanOrEqual(0.85);
    expect({ ...overallAgreement, accepted: overallAgreement.Interval.Lower >= 0.85 }).toEqual(
      fixtures.storedAgreement.overall
    );

    for (const key of TEXT_CRITERIA) {
      const subset = fixtures.items.filter((item) => item.criterionKey === key);
      const subsetVerdicts = subset.map((item) => RubricCalibration.EvaluateConstructedCriterion(item));
      const agreement = RubricCalibration.Agreement(subset, subsetVerdicts);
      expect(agreement.Interval.Lower).toBeGreaterThanOrEqual(0.85);
      expect({ ...agreement, accepted: agreement.Interval.Lower >= 0.85 }).toEqual(
        fixtures.storedAgreement.byCriterion[key]
      );
    }
  });
});

/** The shape of the checked-in rubric metadata file the suite's rubric oracle reads (D5-58). */
interface RubricMetadataFile {
  readonly fields: { readonly Name: string; readonly Status: string };
  readonly primaryKey: { readonly ID: string };
  readonly relatedEntities: {
    readonly 'MJ: Rubric Versions': readonly {
      readonly fields: { readonly Status?: string };
      readonly primaryKey: { readonly ID: string };
    }[];
  };
}

const METADATA_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', '..', '..', 'metadata');
const RUBRIC_METADATA_PATH = join(METADATA_ROOT, 'rubrics', '.predictive-studio-agent-eval-rubric.json');
const PUBLICATION_METADATA_PATH = join(METADATA_ROOT, 'rubric-publications', '.predictive-studio-agent-eval-rubric-publication.json');
const VERSION_ID = '267FF292-E94E-4ABC-AC40-BB7088324AD3';

interface PublicationRecord {
  readonly fields: { readonly Status: string };
  readonly primaryKey: { readonly ID: string };
}

/**
 * D5-58 as it installs on a clean database (wave-4 integration): the server refuses a new version that is not Draft
 * (`VersionStatusError`) and criteria under a non-Draft version, so the version is authored Draft with its criteria and
 * published by a `rubric-publications/` record pushed after `rubrics/` (the RUBRICS_GUIDE shipped pattern).
 */
describe('Predictive Studio Agent Eval rubric metadata (D5-58)', () => {
  it('authors its one version with no Status (Draft by default), so a clean install accepts the version and its criteria', () => {
    const rubric = JSON.parse(readFileSync(RUBRIC_METADATA_PATH, 'utf8')) as RubricMetadataFile;
    const versions = rubric.relatedEntities['MJ: Rubric Versions'];
    expect(versions).toHaveLength(1);
    expect(versions[0].primaryKey.ID).toBe(VERSION_ID);
    expect(versions[0].fields.Status).toBeUndefined();
  });

  it('ships a publication record that makes that version Published, so RubricEngine finds a published version', () => {
    const records = JSON.parse(readFileSync(PUBLICATION_METADATA_PATH, 'utf8')) as PublicationRecord[];
    expect(records).toEqual([{ fields: { Status: 'Published' }, primaryKey: { ID: VERSION_ID } }]);
  });
});

describe('the rubric generator (D5-58)', () => {
  it('writes the version with no Status and its publication record, so regenerating the metadata keeps the oracle evaluable', () => {
    const manifestPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'scenario-manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as AgentEvalManifest;
    const files = AgentEvalScenarioManifest.SerializeMetadataFiles(manifest);
    const rubric = JSON.parse(files.rubricJson) as RubricMetadataFile;
    expect(rubric.relatedEntities['MJ: Rubric Versions'][0].fields.Status).toBeUndefined();
    expect(JSON.parse(files.rubricPublicationJson)).toEqual([{ fields: { Status: 'Published' }, primaryKey: { ID: VERSION_ID } }]);
    expect(files.rubricPublicationJson).toBe(readFileSync(PUBLICATION_METADATA_PATH, 'utf8'));
  });
});
