/**
 * @module outcome-config
 *
 * Declarative metadata contracts for model prediction outcomes, status bands,
 * labels, and badge color styling.
 */

/** One threshold interval mapping a range of scores to a status label and styling. */
export interface OutcomeBand {
  /** Unique key for the band (e.g. 'high', 'medium', 'low', 'critical'). */
  Key: string;
  /** Human-readable status label (e.g. 'High', 'Medium', 'Low' or 'Healthy', 'At Risk'). */
  Label: string;
  /** Inclusive lower bound of prediction score [0.0 - 1.0]. */
  Min: number;
  /** Inclusive upper bound of prediction score [0.0 - 1.0]. */
  Max: number;
  /** Visual badge color: 'green' | 'amber' | 'red' | 'blue' | 'gray'. */
  BadgeColor: 'green' | 'amber' | 'red' | 'blue' | 'gray';
  /** Optional FontAwesome icon class (e.g. 'fa-circle-check', 'fa-triangle-exclamation'). */
  Icon?: string;
  /** Optional description for tooltips and help text. */
  Description?: string;
}

/** Visual styling for a categorical predicted class label. */
export interface OutcomeStyle {
  /** Visual badge color: 'green' | 'amber' | 'red' | 'blue' | 'gray'. */
  BadgeColor: 'green' | 'amber' | 'red' | 'blue' | 'gray';
  /** FontAwesome icon class (e.g. 'fa-check', 'fa-xmark'). */
  Icon?: string;
  /** Optional display label override for the class. */
  DisplayLabel?: string;
}

/** Complete outcome and status configuration for a predictive model or pipeline. */
export interface OutcomeConfig {
  /**
   * Primary metric display label (e.g. 'Renewal Probability', 'Late Payment Probability', 'Anomaly Score').
   * Defaults to 'Prediction Score'.
   */
  ScoreLabel?: string;
  /**
   * Status column / tier header label (e.g. 'Renewal Status', 'Payment Risk Level', 'Urgency').
   * Defaults to 'Status' or 'Risk Level'.
   */
  StatusLabel?: string;
  /**
   * Polarity:
   * - 'positive': Higher score is desirable (e.g. Renewal Probability where 99% is high/green).
   * - 'adverse': Higher score represents adverse risk (e.g. Churn Risk where 99% is high risk/red).
   */
  Polarity?: 'positive' | 'adverse';
  /**
   * Value formatting mode for the score:
   * - 'percentage': Render as percentage (e.g. '95.2%'). Default for classification.
   * - 'currency': Render as currency (e.g. '$12,520').
   * - 'number': Render as localized decimal number.
   */
  Format?: 'percentage' | 'currency' | 'number';
  /**
   * Threshold bands mapping ranges of predicted scores to qualitative status labels and badge styles.
   */
  Bands?: OutcomeBand[];
  /**
   * Style configuration for categorical predicted classes, keyed by class name
   * (e.g. { "Renewed": { "BadgeColor": "green" }, "Lapsed": { "BadgeColor": "red" } }).
   */
  OutcomeStyles?: Record<string, OutcomeStyle>;
}

/**
 * Standard default bands for positive-polarity models (higher is better, e.g. Renewal Probability).
 */
export const DEFAULT_POSITIVE_BANDS: OutcomeBand[] = [
  {
    Key: 'high',
    Label: 'High',
    Min: 0.6,
    Max: 1.0,
    BadgeColor: 'green',
    Icon: 'fa-circle-check',
    Description: 'High likelihood of positive outcome (healthy)',
  },
  {
    Key: 'medium',
    Label: 'Medium',
    Min: 0.4,
    Max: 0.6,
    BadgeColor: 'amber',
    Icon: 'fa-triangle-exclamation',
    Description: 'Moderate likelihood of positive outcome',
  },
  {
    Key: 'low',
    Label: 'Low',
    Min: 0.0,
    Max: 0.4,
    BadgeColor: 'red',
    Icon: 'fa-circle-exclamation',
    Description: 'Low likelihood of positive outcome (at risk)',
  },
];

/**
 * Standard default bands for adverse-polarity models (higher is worse, e.g. Churn Risk / Default Risk).
 */
export const DEFAULT_ADVERSE_BANDS: OutcomeBand[] = [
  {
    Key: 'high',
    Label: 'High Risk',
    Min: 0.7,
    Max: 1.0,
    BadgeColor: 'red',
    Icon: 'fa-circle-exclamation',
    Description: 'High adverse risk (immediate intervention recommended)',
  },
  {
    Key: 'medium',
    Label: 'Med Risk',
    Min: 0.4,
    Max: 0.7,
    BadgeColor: 'amber',
    Icon: 'fa-triangle-exclamation',
    Description: 'Moderate adverse risk (monitor closely)',
  },
  {
    Key: 'low',
    Label: 'Low Risk',
    Min: 0.0,
    Max: 0.4,
    BadgeColor: 'green',
    Icon: 'fa-circle-check',
    Description: 'Low adverse risk (healthy)',
  },
];

/**
 * Standard default bands for neutral models where polarity is unknown or unspecified.
 */
export const DEFAULT_NEUTRAL_BANDS: OutcomeBand[] = [
  {
    Key: 'high',
    Label: 'High',
    Min: 0.6,
    Max: 1.0,
    BadgeColor: 'gray',
    Icon: 'fa-circle',
    Description: 'High score (0.6 - 1.0)',
  },
  {
    Key: 'medium',
    Label: 'Medium',
    Min: 0.4,
    Max: 0.6,
    BadgeColor: 'gray',
    Icon: 'fa-circle',
    Description: 'Medium score (0.4 - 0.6)',
  },
  {
    Key: 'low',
    Label: 'Low',
    Min: 0.0,
    Max: 0.4,
    BadgeColor: 'gray',
    Icon: 'fa-circle',
    Description: 'Low score (0.0 - 0.4)',
  },
];

/**
 * Standard default bands for monetary / regression models (e.g. Customer Lifetime Value).
 */
export const DEFAULT_MONETARY_BANDS: OutcomeBand[] = [
  {
    Key: 'high',
    Label: 'High Value',
    Min: 2500,
    Max: Infinity,
    BadgeColor: 'green',
    Icon: 'fa-arrow-trend-up',
    Description: 'High lifetime value ($2,500+)',
  },
  {
    Key: 'medium',
    Label: 'Medium Value',
    Min: 500,
    Max: 2500,
    BadgeColor: 'amber',
    Icon: 'fa-minus',
    Description: 'Medium lifetime value ($500 - $2,500)',
  },
  {
    Key: 'standard',
    Label: 'Standard Value',
    Min: 0,
    Max: 500,
    BadgeColor: 'gray',
    Icon: 'fa-arrow-trend-down',
    Description: 'Standard lifetime value (< $500)',
  },
];

/**
 * Resolves an effective OutcomeConfig from a model or pipeline, falling back to sensible
 * domain defaults when no explicit configuration is provided.
 */
export function ResolveOutcomeConfig(modelLike?: {
  Lineage?: string | null;
  TargetVariable?: string | null;
  ProblemType?: string | null;
  outcomeConfig?: OutcomeConfig | null;
}): OutcomeConfig {
  // 1. Direct explicit object passed in
  if (modelLike?.outcomeConfig && typeof modelLike.outcomeConfig === 'object') {
    return NormalizeOutcomeConfig(modelLike.outcomeConfig);
  }

  // 2. Parse from Lineage JSON if available
  if (modelLike?.Lineage && typeof modelLike.Lineage === 'string') {
    try {
      const parsed = JSON.parse(modelLike.Lineage) as Record<string, unknown>;
      const cfg = (parsed.outcomeConfig ?? parsed.OutcomeConfig) as OutcomeConfig | undefined;
      if (cfg && typeof cfg === 'object') {
        return NormalizeOutcomeConfig(cfg);
      }
    } catch (err) {
      console.warn('resolveOutcomeConfig: failed to parse Lineage JSON', err);
    }
  }

  // 3. Infer intelligent default based on target variable name and problem type
  const target = (modelLike?.TargetVariable ?? '').toLowerCase();
  const problemType = (modelLike?.ProblemType ?? '').toLowerCase();

  const isMonetary =
    target.includes('ltv') ||
    target.includes('revenue') ||
    target.includes('spend') ||
    target.includes('gross') ||
    target.includes('balance') ||
    target.includes('amount');

  if (problemType === 'regression' || isMonetary) {
    return {
      ScoreLabel: isMonetary ? 'Predicted Customer LTV' : 'Predicted Value',
      StatusLabel: isMonetary ? 'LTV Tier' : 'Value Tier',
      Polarity: 'positive',
      Format: isMonetary ? 'currency' : 'number',
      Bands: isMonetary ? [...DEFAULT_MONETARY_BANDS] : [],
      OutcomeStyles: {},
    };
  }

  // Positive polarity: explicit renewal / retention models
  const isRenewal =
    target.includes('renew') ||
    target.includes('retention');

  if (isRenewal) {
    return {
      ScoreLabel: 'Renewal Probability',
      StatusLabel: 'Renewal Status',
      Polarity: 'positive',
      Format: 'percentage',
      Bands: [...DEFAULT_POSITIVE_BANDS],
      OutcomeStyles: {
        Renewed: { BadgeColor: 'green', Icon: 'fa-check' },
        Active: { BadgeColor: 'green', Icon: 'fa-check' },
        Lapsed: { BadgeColor: 'red', Icon: 'fa-xmark' },
        Cancelled: { BadgeColor: 'red', Icon: 'fa-xmark' },
        Churn: { BadgeColor: 'red', Icon: 'fa-xmark' },
      },
    };
  }

  // Adverse polarity: explicit churn, lapse, risk, or default models
  const isAdverse =
    target.includes('churn') ||
    target.includes('lapse') ||
    target.includes('risk') ||
    target.includes('late') ||
    target.includes('escalat') ||
    target.includes('fraud') ||
    target.includes('default');

  if (isAdverse) {
    return {
      ScoreLabel: 'Risk Score',
      StatusLabel: 'Risk Level',
      Polarity: 'adverse',
      Format: 'percentage',
      Bands: [...DEFAULT_ADVERSE_BANDS],
      OutcomeStyles: {
        Late: { BadgeColor: 'red', Icon: 'fa-circle-exclamation' },
        OnTime: { BadgeColor: 'green', Icon: 'fa-check' },
        Escalated: { BadgeColor: 'red', Icon: 'fa-triangle-exclamation' },
        Normal: { BadgeColor: 'green', Icon: 'fa-check' },
      },
    };
  }

  // Safe fallback: neutral config with no polarity claim and gray styling
  return {
    ScoreLabel: 'Prediction Score',
    StatusLabel: 'Prediction Tier',
    Format: 'percentage',
    Bands: [...DEFAULT_NEUTRAL_BANDS],
    OutcomeStyles: {},
  };
}

/** @deprecated Use {@link ResolveOutcomeConfig}. */
export function resolveOutcomeConfig(modelLike?: {
  Lineage?: string | null;
  TargetVariable?: string | null;
  ProblemType?: string | null;
  outcomeConfig?: OutcomeConfig | null;
}): OutcomeConfig {
  return ResolveOutcomeConfig(modelLike);
}

/**
 * Closes small sentinel gaps between consecutive sorted bands defensively
 * (e.g. [0, 0.3999) and [0.4, 0.6999) -> [0, 0.4) and [0.4, 0.7)).
 */
export function CloseSentinelBandGaps(bands: OutcomeBand[]): OutcomeBand[] {
  if (!bands || bands.length <= 1) return bands;
  const indices = bands.map((_, i) => i).sort((a, b) => bands[a].Min - bands[b].Min);
  const result = bands.map((b) => ({ ...b }));

  for (let i = 0; i < indices.length - 1; i++) {
    const curIdx = indices[i];
    const nextIdx = indices[i + 1];
    const cur = result[curIdx];
    const next = result[nextIdx];
    if (cur.Max < next.Min) {
      const gap = next.Min - cur.Max;
      // Close small gaps (<= 0.01 for probabilities or <= 1 for large monetary thresholds)
      if (gap <= 0.01 || (next.Min >= 10 && gap <= 1)) {
        cur.Max = next.Min;
      }
    }
  }
  return result;
}

/** @deprecated Use {@link CloseSentinelBandGaps}. */
export function closeSentinelBandGaps(bands: OutcomeBand[]): OutcomeBand[] {
  return CloseSentinelBandGaps(bands);
}

/**
 * Normalizes an incoming OutcomeConfig to ensure sensible defaults for any omitted properties.
 */
export function NormalizeOutcomeConfig(cfg: OutcomeConfig): OutcomeConfig {
  const polarity = cfg.Polarity;
  const defaultBands =
    polarity === 'positive'
      ? DEFAULT_POSITIVE_BANDS
      : polarity === 'adverse'
        ? DEFAULT_ADVERSE_BANDS
        : DEFAULT_NEUTRAL_BANDS;
  const rawBands = cfg.Bands && cfg.Bands.length > 0 ? cfg.Bands : [...defaultBands];
  return {
    ScoreLabel:
      cfg.ScoreLabel ??
      (polarity === 'positive'
        ? 'Renewal Probability'
        : polarity === 'adverse'
          ? 'Risk Score'
          : 'Prediction Score'),
    StatusLabel:
      cfg.StatusLabel ??
      (polarity === 'positive'
        ? 'Renewal Status'
        : polarity === 'adverse'
          ? 'Risk Level'
          : 'Prediction Tier'),
    Polarity: polarity,
    Format: cfg.Format,
    Bands: CloseSentinelBandGaps(rawBands),
    OutcomeStyles: cfg.OutcomeStyles ?? {},
  };
}

/** @deprecated Use {@link NormalizeOutcomeConfig}. */
export function normalizeOutcomeConfig(cfg: OutcomeConfig): OutcomeConfig {
  return NormalizeOutcomeConfig(cfg);
}

/**
 * Finds the matching OutcomeBand for a given score.
 * Evaluates half-open intervals [Min, Max) with the top band inclusive [Min, Max].
 * Order-independent matching identical to assignBand (#4104).
 * Returns null if the score is out of range or not finite.
 */
export function ResolveScoreBand(score: number, config?: OutcomeConfig | null): OutcomeBand | null {
  if (typeof score !== 'number' || !Number.isFinite(score)) return null;
  if (!config) return null;
  const rawBands = config.Bands ?? (config.Polarity === 'positive' ? DEFAULT_POSITIVE_BANDS : config.Polarity === 'adverse' ? DEFAULT_ADVERSE_BANDS : DEFAULT_NEUTRAL_BANDS);
  if (!rawBands || rawBands.length === 0) return null;
  const bands = CloseSentinelBandGaps(rawBands);

  // Check normalized [0, 1] bounds without silent clamping
  const isNormalizedProbability = bands.every(b => b.Min >= 0 && b.Max <= 1);
  if (isNormalizedProbability && (score < 0 || score > 1)) {
    return null;
  }

  // Find the top band boundary (highest Max value)
  let maxBoundary = -Infinity;
  for (const b of bands) {
    if (b.Max > maxBoundary) {
      maxBoundary = b.Max;
    }
  }

  // Half-open interval matching: [Min, Max) except for top band which is [Min, Max]
  for (const b of bands) {
    const isTopBand = b.Max === maxBoundary;
    if (isTopBand) {
      if (score >= b.Min && score <= b.Max) {
        return b;
      }
    } else {
      if (score >= b.Min && score < b.Max) {
        return b;
      }
    }
  }

  return null;
}

/** @deprecated Use {@link ResolveScoreBand}. */
export function resolveScoreBand(score: number, config?: OutcomeConfig | null): OutcomeBand | null {
  return ResolveScoreBand(score, config);
}

/**
 * Resolves the visual badge styling and icon for a predicted class.
 */
export function ResolveOutcomeStyle(className: string | undefined | null, config?: OutcomeConfig | null): OutcomeStyle {
  if (!className) {
    return { BadgeColor: 'gray' };
  }

  const styles = config?.OutcomeStyles ?? {};
  // 1. Exact match
  if (styles[className]) {
    return styles[className];
  }

  // 2. Case-insensitive lookup
  const lower = className.toLowerCase();
  for (const [k, v] of Object.entries(styles)) {
    if (k.toLowerCase() === lower) {
      return v;
    }
  }

  // 3. Fallback heuristics for common terms
  if (lower === 'renewed' || lower === 'active' || lower === 'ontime' || lower === 'pass' || lower === 'normal') {
    return { BadgeColor: 'green', Icon: 'fa-check' };
  }
  if (lower === 'lapsed' || lower === 'cancelled' || lower === 'churn' || lower === 'late' || lower === 'fail' || lower === 'escalated') {
    return { BadgeColor: 'red', Icon: 'fa-xmark' };
  }

  return { BadgeColor: 'gray' };
}

/** @deprecated Use {@link ResolveOutcomeStyle}. */
export function resolveOutcomeStyle(className: string | undefined | null, config?: OutcomeConfig | null): OutcomeStyle {
  return ResolveOutcomeStyle(className, config);
}

/**
 * Formats a predicted score into a human-readable display string based on
 * the model's OutcomeConfig format, problem type, and score magnitude.
 */
export function FormatPredictionScore(
  score: number,
  config?: OutcomeConfig | null,
  problemType?: string | null,
): string {
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    return '—';
  }

  const pType = (problemType ?? '').toLowerCase();
  const isCurrency =
    config?.Format === 'currency' ||
    (pType === 'regression' &&
      (config?.ScoreLabel?.toLowerCase().includes('ltv') ||
        config?.ScoreLabel?.toLowerCase().includes('spend') ||
        config?.ScoreLabel?.toLowerCase().includes('revenue') ||
        config?.ScoreLabel?.includes('$'))) ||
    (!config?.Format && score > 1.05 && (config?.ScoreLabel?.toLowerCase().includes('ltv') || config?.ScoreLabel?.toLowerCase().includes('value')));

  if (isCurrency) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: score >= 100 ? 0 : 2,
    }).format(score);
  }

  const isNumeric =
    config?.Format === 'number' ||
    (pType === 'regression' && config?.Format !== 'percentage');

  if (isNumeric) {
    return score.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }

  // Default: percentage (0.0 - 1.0 scale)
  return (score * 100).toFixed(1) + '%';
}

/** @deprecated Use {@link FormatPredictionScore}. */
export function formatPredictionScore(
  score: number,
  config?: OutcomeConfig | null,
  problemType?: string | null,
): string {
  return FormatPredictionScore(score, config, problemType);
}

