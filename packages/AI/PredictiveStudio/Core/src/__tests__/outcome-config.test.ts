import { describe, it, expect, vi } from 'vitest';
import {
  resolveOutcomeConfig,
  resolveScoreBand,
  resolveOutcomeStyle,
  formatPredictionScore,
  DEFAULT_POSITIVE_BANDS,
  DEFAULT_NEUTRAL_BANDS,
  type OutcomeConfig,
} from '../index';

describe('resolveOutcomeConfig', () => {
  it('uses explicit outcomeConfig object when provided', () => {
    const custom: OutcomeConfig = {
      ScoreLabel: 'Late Payment Probability',
      StatusLabel: 'Payment Urgency',
      Polarity: 'adverse',
      Bands: [
        { Key: 'severe', Label: 'Severe', Min: 0.8, Max: 1.0, BadgeColor: 'red', Icon: 'fa-triangle-exclamation' },
        { Key: 'safe', Label: 'Safe', Min: 0.0, Max: 0.8, BadgeColor: 'green', Icon: 'fa-circle-check' },
      ],
      OutcomeStyles: {
        Late: { BadgeColor: 'red', Icon: 'fa-xmark' },
        OnTime: { BadgeColor: 'green', Icon: 'fa-check' },
      },
    };

    const resolved = resolveOutcomeConfig({ outcomeConfig: custom });
    expect(resolved.ScoreLabel).toBe('Late Payment Probability');
    expect(resolved.StatusLabel).toBe('Payment Urgency');
    expect(resolved.Polarity).toBe('adverse');
    expect(resolved.Bands).toHaveLength(2);
    expect(resolved.Bands![0].Label).toBe('Severe');
  });

  it('parses outcomeConfig from model Lineage JSON', () => {
    const lineage = JSON.stringify({
      pipelineId: 'pipe-1',
      outcomeConfig: {
        ScoreLabel: 'Custom Probability',
        StatusLabel: 'Custom Status',
        Polarity: 'positive',
        Bands: [
          { Key: 'pass', Label: 'Pass', Min: 0.5, Max: 1.0, BadgeColor: 'green' },
          { Key: 'fail', Label: 'Fail', Min: 0.0, Max: 0.5, BadgeColor: 'red' },
        ],
      },
    });

    const resolved = resolveOutcomeConfig({ Lineage: lineage });
    expect(resolved.ScoreLabel).toBe('Custom Probability');
    expect(resolved.StatusLabel).toBe('Custom Status');
    expect(resolved.Polarity).toBe('positive');
    expect(resolved.Bands).toHaveLength(2);
  });

  it('logs a warning on malformed Lineage JSON and falls back safely', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const resolved = resolveOutcomeConfig({ Lineage: '{ malformed json' });
    expect(warnSpy).toHaveBeenCalled();
    expect(resolved.ScoreLabel).toBe('Prediction Score');
    expect(resolved.Polarity).toBeUndefined();
    warnSpy.mockRestore();
  });

  it('infers positive renewal config when target contains renew or retention', () => {
    const resolved = resolveOutcomeConfig({ TargetVariable: 'MemberRenewal' });
    expect(resolved.ScoreLabel).toBe('Renewal Probability');
    expect(resolved.StatusLabel).toBe('Renewal Status');
    expect(resolved.Polarity).toBe('positive');
    expect(resolved.Bands).toHaveLength(3);
    expect(resolved.Bands![0].Label).toBe('High');
    expect(resolved.Bands![0].BadgeColor).toBe('green');
  });

  it('infers adverse risk config when target indicates risk, churn, lapse, or default', () => {
    const resolved = resolveOutcomeConfig({ TargetVariable: 'LatePaymentRisk' });
    expect(resolved.ScoreLabel).toBe('Risk Score');
    expect(resolved.StatusLabel).toBe('Risk Level');
    expect(resolved.Polarity).toBe('adverse');
    expect(resolved.Bands).toHaveLength(3);
    expect(resolved.Bands![0].Label).toBe('High Risk');
    expect(resolved.Bands![0].BadgeColor).toBe('red');
  });

  it('returns neutral config with no polarity claim for generic targets like Status', () => {
    const resolved = resolveOutcomeConfig({ TargetVariable: 'Status' });
    expect(resolved.ScoreLabel).toBe('Prediction Score');
    expect(resolved.StatusLabel).toBe('Prediction Tier');
    expect(resolved.Polarity).toBeUndefined();
    expect(resolved.Bands).toHaveLength(3);
    expect(resolved.Bands![0].Label).toBe('High');
    expect(resolved.Bands![0].BadgeColor).toBe('gray');
  });
});

describe('resolveScoreBand', () => {
  it('evaluates half-open intervals [Min, Max) with top band inclusive without boundary overlap', () => {
    const cfg: OutcomeConfig = {
      Polarity: 'positive',
      Bands: [...DEFAULT_POSITIVE_BANDS], // High [0.6, 1.0], Med [0.4, 0.6), Low [0.0, 0.4)
    };

    // Right below the 0.6 threshold: must resolve to Medium, NOT High!
    expect(resolveScoreBand(0.5999, cfg)?.Label).toBe('Medium');
    expect(resolveScoreBand(0.59995, cfg)?.Label).toBe('Medium');
    expect(resolveScoreBand(0.5999, cfg)?.BadgeColor).toBe('amber');

    // Exactly on 0.6 threshold: resolves to High
    expect(resolveScoreBand(0.60, cfg)?.Label).toBe('High');
    expect(resolveScoreBand(0.60, cfg)?.BadgeColor).toBe('green');

    // Right below the 0.4 threshold: must resolve to Low, NOT Medium!
    expect(resolveScoreBand(0.39995, cfg)?.Label).toBe('Low');
    expect(resolveScoreBand(0.39995, cfg)?.BadgeColor).toBe('red');

    // Exactly on 0.4 threshold: resolves to Medium
    expect(resolveScoreBand(0.40, cfg)?.Label).toBe('Medium');
    expect(resolveScoreBand(0.40, cfg)?.BadgeColor).toBe('amber');

    // Top boundary inclusive: 1.0 resolves to High
    expect(resolveScoreBand(1.0, cfg)?.Label).toBe('High');

    // Bottom boundary inclusive: 0.0 resolves to Low
    expect(resolveScoreBand(0.0, cfg)?.Label).toBe('Low');
  });

  it('returns null for out-of-range scores instead of silently clamping', () => {
    const cfg: OutcomeConfig = {
      Polarity: 'positive',
      Bands: [...DEFAULT_POSITIVE_BANDS],
    };

    expect(resolveScoreBand(1.5, cfg)).toBeNull();
    expect(resolveScoreBand(-0.2, cfg)).toBeNull();
    expect(resolveScoreBand(NaN, cfg)).toBeNull();
  });

  it('maps scores to custom 4-tier bands with half-open semantics', () => {
    const customCfg: OutcomeConfig = {
      ScoreLabel: 'Escalation Probability',
      StatusLabel: 'Escalation Severity',
      Polarity: 'adverse',
      Bands: [
        { Key: 'crit', Label: 'Critical', Min: 0.85, Max: 1.0, BadgeColor: 'red' },
        { Key: 'high', Label: 'High', Min: 0.65, Max: 0.85, BadgeColor: 'amber' },
        { Key: 'med', Label: 'Medium', Min: 0.35, Max: 0.65, BadgeColor: 'blue' },
        { Key: 'low', Label: 'Low', Min: 0.0, Max: 0.35, BadgeColor: 'green' },
      ],
    };

    expect(resolveScoreBand(0.95, customCfg)?.Label).toBe('Critical');
    expect(resolveScoreBand(0.85, customCfg)?.Label).toBe('Critical');
    expect(resolveScoreBand(0.849, customCfg)?.Label).toBe('High');
    expect(resolveScoreBand(0.65, customCfg)?.Label).toBe('High');
    expect(resolveScoreBand(0.50, customCfg)?.Label).toBe('Medium');
    expect(resolveScoreBand(0.35, customCfg)?.Label).toBe('Medium');
    expect(resolveScoreBand(0.10, customCfg)?.Label).toBe('Low');
    expect(resolveScoreBand(0.0, customCfg)?.Label).toBe('Low');
  });

  it('correctly resolves continuous monetary/regression bands', () => {
    const ltvCfg: OutcomeConfig = {
      ScoreLabel: 'Customer Lifetime Value',
      StatusLabel: 'LTV Tier',
      Polarity: 'positive',
      Bands: [
        { Key: 'high', Label: 'High Value', Min: 2500, Max: Infinity, BadgeColor: 'green' },
        { Key: 'medium', Label: 'Medium Value', Min: 500, Max: 2500, BadgeColor: 'amber' },
        { Key: 'low', Label: 'Standard Value', Min: 0, Max: 500, BadgeColor: 'gray' },
      ],
    };

    expect(resolveScoreBand(3500, ltvCfg)?.Label).toBe('High Value');
    expect(resolveScoreBand(3500, ltvCfg)?.BadgeColor).toBe('green');

    expect(resolveScoreBand(1250, ltvCfg)?.Label).toBe('Medium Value');
    expect(resolveScoreBand(1250, ltvCfg)?.BadgeColor).toBe('amber');

    expect(resolveScoreBand(250, ltvCfg)?.Label).toBe('Standard Value');
    expect(resolveScoreBand(250, ltvCfg)?.BadgeColor).toBe('gray');

    expect(resolveScoreBand(1500000, ltvCfg)?.Label).toBe('High Value');
  });
});

describe('resolveOutcomeStyle', () => {
  it('uses configured OutcomeStyles with case-insensitivity', () => {
    const cfg: OutcomeConfig = {
      OutcomeStyles: {
        Renewed: { BadgeColor: 'green', Icon: 'fa-circle-check', DisplayLabel: 'Successfully Renewed' },
        Lapsed: { BadgeColor: 'red', Icon: 'fa-circle-xmark', DisplayLabel: 'Lost Member' },
      },
    };

    const styleRenewed = resolveOutcomeStyle('renewed', cfg);
    expect(styleRenewed.BadgeColor).toBe('green');
    expect(styleRenewed.Icon).toBe('fa-circle-check');
    expect(styleRenewed.DisplayLabel).toBe('Successfully Renewed');

    const styleLapsed = resolveOutcomeStyle('LAPSED', cfg);
    expect(styleLapsed.BadgeColor).toBe('red');
    expect(styleLapsed.Icon).toBe('fa-circle-xmark');
  });

  it('falls back to heuristics for unconfigured classes', () => {
    expect(resolveOutcomeStyle('Active').BadgeColor).toBe('green');
    expect(resolveOutcomeStyle('Churn').BadgeColor).toBe('red');
    expect(resolveOutcomeStyle('UnknownClass').BadgeColor).toBe('gray');
    expect(resolveOutcomeStyle(null).BadgeColor).toBe('gray');
  });
});

describe('formatPredictionScore', () => {
  it('formats classification probability as percentage', () => {
    expect(formatPredictionScore(0.8523)).toBe('85.2%');
    expect(formatPredictionScore(0.012)).toBe('1.2%');
    expect(formatPredictionScore(1.0)).toBe('100.0%');
  });

  it('formats currency when Format is currency or problem type is regression for LTV', () => {
    const ltvCfg: OutcomeConfig = {
      ScoreLabel: 'Predicted Customer LTV',
      Format: 'currency',
    };
    expect(formatPredictionScore(12521.69, ltvCfg, 'regression')).toBe('$12,522');
    expect(formatPredictionScore(450.5, ltvCfg, 'regression')).toBe('$451');
  });

  it('formats continuous numbers when Format is number', () => {
    const numCfg: OutcomeConfig = {
      ScoreLabel: 'Lead Score',
      Format: 'number',
    };
    expect(formatPredictionScore(42.5, numCfg, 'regression')).toBe('42.5');
  });
});
