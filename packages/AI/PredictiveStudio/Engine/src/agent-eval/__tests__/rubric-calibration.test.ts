import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RubricCalibration,
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
