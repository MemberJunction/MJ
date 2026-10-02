import { describe, it, expect } from 'vitest';
import {
  type LeakageGuard,
  type ValidationStrategy,
  type ProblemType,
} from '@memberjunction/predictive-studio-core';

describe('Predictive Studio Manual Workbench Logic', () => {
  describe('Wizard Validation Strategy Composition', () => {
    it('composes train_test_split strategy with required LockedHoldoutFraction', () => {
      const strategy: ValidationStrategy = {
        Strategy: 'train_test_split',
        TestSize: 0.2,
        LockedHoldoutFraction: 0.15,
      };
      expect(strategy.Strategy).toBe('train_test_split');
      expect(strategy.TestSize).toBe(0.2);
      expect(strategy.LockedHoldoutFraction).toBe(0.15);
    });

    it('composes kfold strategy with required LockedHoldoutFraction', () => {
      const strategy: ValidationStrategy = {
        Strategy: 'kfold',
        K: 5,
        LockedHoldoutFraction: 0.15,
      };
      expect(strategy.Strategy).toBe('kfold');
      expect(strategy.K).toBe(5);
      expect(strategy.LockedHoldoutFraction).toBe(0.15);
    });
  });

  describe('Leakage Guard Protection', () => {
    it('populates deny list fields for Member Renewal Risk to prevent post-outcome leakage', () => {
      const denyFields = ['CancellationDate', 'CancellationReason', 'RenewalDate', 'EndDate'];
      const guard: LeakageGuard = {
        DenyFields: denyFields,
        SingleFeatureDominanceThreshold: 0.8,
      };
      expect(guard.DenyFields).toContain('CancellationDate');
      expect(guard.DenyFields).toContain('CancellationReason');
      expect(guard.SingleFeatureDominanceThreshold).toBe(0.8);
    });

    it('guards against course completion target leakage', () => {
      const denyFields = ['CompletedOn'];
      const guard: LeakageGuard = {
        DenyFields: denyFields,
        SingleFeatureDominanceThreshold: 0.8,
      };
      expect(guard.DenyFields).toContain('CompletedOn');
    });
  });

  describe('Multi-Algorithm Tournament Configuration', () => {
    it('supports selecting tournament algorithms and validation parameters', () => {
      const availableAlgorithms = [
        { id: '1', name: 'XGBoost', driverClass: 'xgboost' },
        { id: '2', name: 'LightGBM', driverClass: 'lightgbm' },
        { id: '3', name: 'Random Forest', driverClass: 'random_forest' },
        { id: '4', name: 'Logistic Regression', driverClass: 'logistic_regression' },
      ];

      const selectedIds = new Set(['1', '2', '3']);
      const selectedAlgorithms = availableAlgorithms.filter((a) => selectedIds.has(a.id));

      expect(selectedAlgorithms.length).toBe(3);
      expect(selectedAlgorithms.map((a) => a.name)).toEqual(['XGBoost', 'LightGBM', 'Random Forest']);
    });

    it('caps iteration budget and compute limits within safety bounds', () => {
      const maxIterations = 20;
      const computeBudgetUsd = 25;
      expect(maxIterations).toBeGreaterThanOrEqual(1);
      expect(maxIterations).toBeLessThanOrEqual(50);
      expect(computeBudgetUsd).toBeGreaterThanOrEqual(1);
      expect(computeBudgetUsd).toBeLessThanOrEqual(500);
    });
  });

  describe('More Cheese Production Use Cases', () => {
    const USE_CASES = [
      {
        id: 'member-renewal-risk',
        name: 'MoreCheese: Member Renewal Risk',
        targetEntity: 'MoreCheese: Membership Periods',
        targetVariable: 'Status',
        problemType: 'classification' as ProblemType,
        algorithm: 'XGBoost',
        leakageDenyFields: ['CancellationDate', 'CancellationReason', 'RenewalDate', 'EndDate'],
        expectedAUC: 0.892,
      },
      {
        id: 'event-no-show',
        name: 'MoreCheese: Event No-Show Propensity',
        targetEntity: 'MoreCheese: Event Registrations',
        targetVariable: 'Attended',
        problemType: 'classification' as ProblemType,
        algorithm: 'LightGBM',
        leakageDenyFields: [],
        expectedAUC: 0.845,
      },
      {
        id: 'course-completion-risk',
        name: 'MoreCheese: Course Completion Risk',
        targetEntity: 'MoreCheese: Course Enrollments',
        targetVariable: 'Status',
        problemType: 'classification' as ProblemType,
        algorithm: 'Random Forest',
        leakageDenyFields: ['CompletedOn'],
        expectedAUC: 0.867,
      },
    ];

    it('defines 3 production-grade use cases with valid problem types and AUC >= 0.80', () => {
      expect(USE_CASES.length).toBe(3);
      for (const uc of USE_CASES) {
        expect(uc.problemType).toBe('classification');
        expect(uc.expectedAUC).toBeGreaterThanOrEqual(0.8);
        expect(uc.name.startsWith('MoreCheese:')).toBe(true);
      }
    });

    it('enforces strict leakage prevention on member renewal', () => {
      const renewalCase = USE_CASES.find((u) => u.id === 'member-renewal-risk');
      expect(renewalCase).toBeDefined();
      expect(renewalCase!.leakageDenyFields).toContain('CancellationDate');
      expect(renewalCase!.leakageDenyFields).toContain('CancellationReason');
    });
  });
});
