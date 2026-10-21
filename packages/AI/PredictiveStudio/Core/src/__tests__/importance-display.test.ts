import { describe, it, expect } from 'vitest';
import { ImportanceDisplay } from '../importance-display';

describe('ImportanceDisplay.GlobalDriversShowable', () => {
  it('shows coefficient importance (display names and driver keys)', () => {
    for (const name of ['Logistic Regression', 'logistic_regression', 'Ridge Regression', 'ridge']) {
      expect(ImportanceDisplay.GlobalDriversShowable(name)).toBe(true);
    }
  });
  it('hides split / impurity importance and models with none', () => {
    for (const name of ['Random Forest', 'random_forest', 'LightGBM', 'lightgbm', 'XGBoost', 'xgboost', 'Multilayer Perceptron', 'mlp', '', null, undefined]) {
      expect(ImportanceDisplay.GlobalDriversShowable(name)).toBe(false);
    }
  });
  it('explains why a list is hidden without causal words', () => {
    expect(ImportanceDisplay.HiddenNote).toMatch(/split or impurity counts/);
  });
});
