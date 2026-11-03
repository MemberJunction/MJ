import { describe, it, expect } from 'vitest';
import { MetricDirections } from '../index';

describe('metric direction', () => {
  it('ranks every proper score lower-is-better, including Brier, deviances and MASE', () => {
    for (const m of ['brier', 'log-loss', 'multiclass-log-loss', 'rmse', 'mae', 'poisson-deviance', 'tweedie-deviance', 'mase']) {
      expect(MetricDirections.MetricDirectionOf(m)).toBe('lower-is-better');
      expect(MetricDirections.IsErrorMetric(m)).toBe(true);
    }
  });

  it('keeps discrimination metrics higher-is-better and calibration slope closer-to-one', () => {
    expect(MetricDirections.MetricDirectionOf('auc')).toBe('higher-is-better');
    expect(MetricDirections.MetricDirectionOf('calibration-slope')).toBe('closer-to-one');
    expect(MetricDirections.IsErrorMetric('calibration-slope')).toBe(false);
  });

  it('treats the legacy spellings as lower-is-better', () => {
    for (const m of ['brier_score', 'multiclass_log_loss', 'poisson_deviance', 'smape']) {
      expect(MetricDirections.IsErrorMetric(m)).toBe(true);
      expect(MetricDirections.MetricDirectionOf(m)).toBe('lower-is-better');
    }
  });

  it('reads direction case- and whitespace-insensitively', () => {
    expect(MetricDirections.MetricDirectionOf(' BRIER ')).toBe('lower-is-better');
    expect(MetricDirections.MetricDirectionOf('AUC')).toBe('higher-is-better');
    expect(MetricDirections.MetricDirectionOf(' Calibration-Slope ')).toBe('closer-to-one');
  });

  it('returns null for an unknown key rather than guessing', () => {
    expect(MetricDirections.MetricDirectionOf('explained_variance')).toBeNull();
  });
});

describe('MetricDirections.OnMetricScale / MetricScaleLabel — a normalized score back on its metric', () => {
  it('un-negates a lower-is-better score: a normalized -12.5 rmse reads 12.5 rmse', () => {
    expect([MetricDirections.OnMetricScale(-12.5, 'rmse'), MetricDirections.MetricScaleLabel('rmse')]).toEqual([12.5, 'rmse']);
    expect(MetricDirections.OnMetricScale(-0.31, 'log-loss')).toBe(0.31);
  });

  it('reads a closer-to-one score as its distance from 1, under that label', () => {
    expect([MetricDirections.OnMetricScale(-0.05, 'calibration-slope'), MetricDirections.MetricScaleLabel('calibration-slope')]).toEqual([0.05, 'calibration-slope distance from 1']);
  });

  it('keeps a higher-is-better score, and a metric of unknown direction, as stored', () => {
    expect([MetricDirections.OnMetricScale(0.81, 'auc'), MetricDirections.MetricScaleLabel('auc')]).toEqual([0.81, 'auc']);
    expect([MetricDirections.OnMetricScale(3, 'mystery'), MetricDirections.MetricScaleLabel('mystery')]).toEqual([3, 'mystery']);
  });
});
