import { describe, it, expect } from 'vitest';
import {
  resolveOutcomeConfig,
  resolveScoreBand,
  resolveOutcomeStyle,
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
        { Key: 'safe', Label: 'Safe', Min: 0.0, Max: 0.799, BadgeColor: 'green', Icon: 'fa-circle-check' },
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
          { Key: 'fail', Label: 'Fail', Min: 0.0, Max: 0.499, BadgeColor: 'red' },
        ],
      },
    });

    const resolved = resolveOutcomeConfig({ Lineage: lineage });
    expect(resolved.ScoreLabel).toBe('Custom Probability');
    expect(resolved.StatusLabel).toBe('Custom Status');
    expect(resolved.Polarity).toBe('positive');
    expect(resolved.Bands).toHaveLength(2);
  });

  it('infers positive renewal config when target is renewal or retention', () => {
    const resolved = resolveOutcomeConfig({ TargetVariable: 'Status' });
    expect(resolved.ScoreLabel).toBe('Renewal Probability');
    expect(resolved.StatusLabel).toBe('Renewal Status');
    expect(resolved.Polarity).toBe('positive');
    expect(resolved.Bands).toHaveLength(3);
    expect(resolved.Bands![0].Label).toBe('High');
    expect(resolved.Bands![0].BadgeColor).toBe('green');
  });

  it('infers adverse risk config by default for other targets', () => {
    const resolved = resolveOutcomeConfig({ TargetVariable: 'LatePaymentOutcome' });
    expect(resolved.ScoreLabel).toBe('Prediction Score');
    expect(resolved.StatusLabel).toBe('Risk Level');
    expect(resolved.Polarity).toBe('adverse');
    expect(resolved.Bands).toHaveLength(3);
    expect(resolved.Bands![0].Label).toBe('High Risk');
    expect(resolved.Bands![0].BadgeColor).toBe('red');
  });
});

describe('resolveScoreBand', () => {
  it('maps scores to correct positive bands', () => {
    const cfg = resolveOutcomeConfig({ TargetVariable: 'Status' });

    // High: >= 0.6
    expect(resolveScoreBand(0.99, cfg)?.Label).toBe('High');
    expect(resolveScoreBand(0.60, cfg)?.Label).toBe('High');
    expect(resolveScoreBand(0.99, cfg)?.BadgeColor).toBe('green');

    // Medium: 0.4 - 0.599
    expect(resolveScoreBand(0.55, cfg)?.Label).toBe('Medium');
    expect(resolveScoreBand(0.40, cfg)?.Label).toBe('Medium');
    expect(resolveScoreBand(0.55, cfg)?.BadgeColor).toBe('amber');

    // Low: < 0.4
    expect(resolveScoreBand(0.25, cfg)?.Label).toBe('Low');
    expect(resolveScoreBand(0.01, cfg)?.Label).toBe('Low');
    expect(resolveScoreBand(0.25, cfg)?.BadgeColor).toBe('red');
  });

  it('maps scores to custom 4-tier bands', () => {
    const customCfg: OutcomeConfig = {
      ScoreLabel: 'Escalation Probability',
      StatusLabel: 'Escalation Severity',
      Polarity: 'adverse',
      Bands: [
        { Key: 'crit', Label: 'Critical', Min: 0.85, Max: 1.0, BadgeColor: 'red' },
        { Key: 'high', Label: 'High', Min: 0.65, Max: 0.849, BadgeColor: 'amber' },
        { Key: 'med', Label: 'Medium', Min: 0.35, Max: 0.649, BadgeColor: 'blue' },
        { Key: 'low', Label: 'Low', Min: 0.0, Max: 0.349, BadgeColor: 'green' },
      ],
    };

    expect(resolveScoreBand(0.95, customCfg)?.Label).toBe('Critical');
    expect(resolveScoreBand(0.70, customCfg)?.Label).toBe('High');
    expect(resolveScoreBand(0.50, customCfg)?.Label).toBe('Medium');
    expect(resolveScoreBand(0.10, customCfg)?.Label).toBe('Low');
  });

  it('correctly resolves continuous monetary/regression bands without 0..1 clamping', () => {
    const ltvCfg: OutcomeConfig = {
      ScoreLabel: 'Customer Lifetime Value',
      StatusLabel: 'LTV Tier',
      Polarity: 'positive',
      Bands: [
        { Key: 'high', Label: 'High Value', Min: 2500, Max: 1000000, BadgeColor: 'green' },
        { Key: 'medium', Label: 'Medium Value', Min: 500, Max: 2499.99, BadgeColor: 'amber' },
        { Key: 'low', Label: 'Standard Value', Min: 0, Max: 499.99, BadgeColor: 'gray' },
      ],
    };

    expect(resolveScoreBand(3500, ltvCfg)?.Label).toBe('High Value');
    expect(resolveScoreBand(3500, ltvCfg)?.BadgeColor).toBe('green');

    expect(resolveScoreBand(1250, ltvCfg)?.Label).toBe('Medium Value');
    expect(resolveScoreBand(1250, ltvCfg)?.BadgeColor).toBe('amber');

    expect(resolveScoreBand(250, ltvCfg)?.Label).toBe('Standard Value');
    expect(resolveScoreBand(250, ltvCfg)?.BadgeColor).toBe('gray');

    // Score exceeding max falls back to closest boundary band (High Value)
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
