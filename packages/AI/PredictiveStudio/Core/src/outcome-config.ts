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
    Max: 0.59999,
    BadgeColor: 'amber',
    Icon: 'fa-triangle-exclamation',
    Description: 'Moderate likelihood of positive outcome',
  },
  {
    Key: 'low',
    Label: 'Low',
    Min: 0.0,
    Max: 0.39999,
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
    Max: 0.69999,
    BadgeColor: 'amber',
    Icon: 'fa-triangle-exclamation',
    Description: 'Moderate adverse risk (monitor closely)',
  },
  {
    Key: 'low',
    Label: 'Low Risk',
    Min: 0.0,
    Max: 0.39999,
    BadgeColor: 'green',
    Icon: 'fa-circle-check',
    Description: 'Low adverse risk (healthy)',
  },
];

/**
 * Resolves an effective OutcomeConfig from a model or pipeline, falling back to sensible
 * domain defaults when no explicit configuration is provided.
 */
export function resolveOutcomeConfig(modelLike?: {
  Lineage?: string | null;
  TargetVariable?: string | null;
  ProblemType?: string | null;
  outcomeConfig?: OutcomeConfig | null;
}): OutcomeConfig {
  // 1. Direct explicit object passed in
  if (modelLike?.outcomeConfig && typeof modelLike.outcomeConfig === 'object') {
    return normalizeOutcomeConfig(modelLike.outcomeConfig);
  }

  // 2. Parse from Lineage JSON if available
  if (modelLike?.Lineage && typeof modelLike.Lineage === 'string') {
    try {
      const parsed = JSON.parse(modelLike.Lineage) as Record<string, unknown>;
      const cfg = (parsed.outcomeConfig ?? parsed.OutcomeConfig) as OutcomeConfig | undefined;
      if (cfg && typeof cfg === 'object') {
        return normalizeOutcomeConfig(cfg);
      }
    } catch {
      // ignore JSON parse errors in Lineage
    }
  }

  // 3. Infer intelligent default based on target variable name
  const target = (modelLike?.TargetVariable ?? '').toLowerCase();
  const isRenewal =
    target.includes('renew') ||
    target.includes('retention') ||
    target === 'status';

  if (isRenewal) {
    return {
      ScoreLabel: 'Renewal Probability',
      StatusLabel: 'Renewal Status',
      Polarity: 'positive',
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

  // Default adverse risk model (e.g. churn risk, late payment, escalation)
  return {
    ScoreLabel: 'Prediction Score',
    StatusLabel: 'Risk Level',
    Polarity: 'adverse',
    Bands: [...DEFAULT_ADVERSE_BANDS],
    OutcomeStyles: {
      Late: { BadgeColor: 'red', Icon: 'fa-circle-exclamation' },
      OnTime: { BadgeColor: 'green', Icon: 'fa-check' },
      Escalated: { BadgeColor: 'red', Icon: 'fa-triangle-exclamation' },
      Normal: { BadgeColor: 'green', Icon: 'fa-check' },
    },
  };
}

/**
 * Normalizes an incoming OutcomeConfig to ensure sensible defaults for any omitted properties.
 */
function normalizeOutcomeConfig(cfg: OutcomeConfig): OutcomeConfig {
  const polarity = cfg.Polarity ?? 'adverse';
  const defaultBands = polarity === 'positive' ? DEFAULT_POSITIVE_BANDS : DEFAULT_ADVERSE_BANDS;
  return {
    ScoreLabel: cfg.ScoreLabel ?? (polarity === 'positive' ? 'Renewal Probability' : 'Prediction Score'),
    StatusLabel: cfg.StatusLabel ?? (polarity === 'positive' ? 'Renewal Status' : 'Risk Level'),
    Polarity: polarity,
    Bands: cfg.Bands && cfg.Bands.length > 0 ? cfg.Bands : [...defaultBands],
    OutcomeStyles: cfg.OutcomeStyles ?? {},
  };
}

/**
 * Finds the matching OutcomeBand for a given score.
 * Supports both standard normalized probability scales [0, 1] and continuous
 * regression/monetary scales (e.g. LTV $0 - $10,000+).
 */
export function resolveScoreBand(score: number, config?: OutcomeConfig | null): OutcomeBand | null {
  if (!config) return null;
  const bands = config.Bands ?? (config.Polarity === 'positive' ? DEFAULT_POSITIVE_BANDS : DEFAULT_ADVERSE_BANDS);
  if (!bands || bands.length === 0) return null;

  // Determine whether bands define a standard 0..1 probability scale or an arbitrary continuous/monetary range
  const isNormalizedProbability = bands.every(b => b.Min >= -1e-4 && b.Max <= 1 + 1e-4);
  const s = isNormalizedProbability ? Math.max(0, Math.min(1, score)) : score;

  // Match band where Min <= s <= Max (or within float tolerance of 1e-4)
  for (const b of bands) {
    if (s >= b.Min - 1e-4 && s <= b.Max + 1e-4) {
      return b;
    }
  }

  // Fallback to closest band if score falls outside all explicit ranges
  let bestBand = bands[0];
  let minDistance = Infinity;
  for (const b of bands) {
    const dist = s < b.Min ? b.Min - s : s > b.Max ? s - b.Max : 0;
    if (dist < minDistance) {
      minDistance = dist;
      bestBand = b;
    }
  }
  return bestBand;
}

/**
 * Resolves the visual badge styling and icon for a predicted class.
 */
export function resolveOutcomeStyle(className: string | undefined | null, config?: OutcomeConfig | null): OutcomeStyle {
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
