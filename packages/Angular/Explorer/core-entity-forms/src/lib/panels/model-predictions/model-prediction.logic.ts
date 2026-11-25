/**
 * Pure, framework-free logic for the entity-agnostic Model Predictions panel (§5.8.5).
 *
 * The panel reads predictions as Feature Values: the entity's `Active` scoring bindings the user holds, the latest value
 * of each from `MJ: Latest Feature Values`, the binding's `Champion` history from `MJ: Feature Values`, and the lineage
 * of the value (its scoring run and the scoring model's `record-panel` output binding). Every read is built in PS Core
 * (`PredictionPanelQueries`), so the panel and the G5.6 gate send the same parameters, and every card is built here, so
 * the DOM is tested on the same rules. Nothing in this file is entity-specific or domain-specific.
 */

import { AuthorizationEvaluator, type AuthorizationInfo, type UserInfo } from '@memberjunction/core';
import type {
    MJMLModelScoringBindingEntity,
    MJMLOutputBindingEntity,
    MJMLScoringRunEntity,
    MJvwLatestFeatureValuesEntity,
} from '@memberjunction/core-entities';
import { IndexByUUID } from '@memberjunction/global';
import { AtRiskRules, PredictionPanelQueries, StoredPrediction, type RiskBandDisplay, type StoredPredictionValue } from '@memberjunction/predictive-studio-core';

/** The neutral tercile a 0–1 value falls into: position on the value axis only, no moral direction. */
export type PredictionBand = 'low' | 'mid' | 'high';

/** How a prediction's primary value renders: a classification's adverse probability, or a regression's point. */
export type PredictionValueKind = 'probability' | 'numeric';

/**
 * The `MJ: ML Model Scoring Bindings` fields the panel reads: exactly the fields its read names, so a field the read
 * names that the entity lacks is a compile error.
 */
export type PanelBindingRow = Pick<MJMLModelScoringBindingEntity, (typeof PredictionPanelQueries.BindingFields)[number]>;

/** The value fields the panel reads, from `MJ: Latest Feature Values` (the latest value) and `MJ: Feature Values` (the history). */
export type PanelValueRow = Pick<MJvwLatestFeatureValuesEntity, (typeof PredictionPanelQueries.ValueFields)[number]>;

/** The `MJ: ML Scoring Runs` fields the lineage reads. */
export type PanelRunRow = Pick<MJMLScoringRunEntity, (typeof PredictionPanelQueries.RunFields)[number]>;

/** The `MJ: ML Output Bindings` fields the card reads (the scoring model's `record-panel` row). */
export type PanelOutputBindingRow = Pick<MJMLOutputBindingEntity, (typeof PredictionPanelQueries.OutputBindingFields)[number]>;

/** One per-record driver of a prediction, for display. */
export interface PredictionDriver {
    /** The humanized source column. */
    Name: string;
    /** The contribution's magnitude. */
    Importance: number;
    /** The magnitude as a 0–100 share of the strongest driver, for the bar width. */
    RelativePct: number;
    /** True when the driver points up on the card: it raised the adverse outcome, or (raw-contribution) the score. */
    RaisesAdverse: boolean;
}

/** One class of a classification, in the model's class order, with its probability. */
export interface PredictionClass {
    Class: string;
    /** 0–100, rounded. */
    Pct: number;
}

/** One point of a prediction's history, with its sparkline coordinates on a 0–100 box. */
export interface PredictionHistoryPoint {
    ID: string;
    /** The value's as-of date, formatted. */
    AsOf: string;
    /** The value as the card shows it ("72%", "1,240.5"). */
    Display: string;
    X: number;
    Y: number;
}

/** Where a shown value came from. */
export interface PredictionLineage {
    /** `Model` for a scored value, `Human` for a person's value of the binding's feature. */
    Source: PanelValueRow['Source'];
    /** The scoring model's version, read through the value's scoring run; null without a run. */
    ModelVersion: number | null;
    ScoringRunID: string | null;
    /** The value's as-of date, formatted; null when undated. */
    AsOf: string | null;
    /** True when the scored record was in the model's training set: the score is optimistic. */
    InTraining: boolean;
}

/** A resolved prediction card: one per authorized binding with a value for the record. */
export interface PredictionCard {
    BindingID: string;
    /** The model that scored the value; null for a person's value. */
    ModelID: string | null;
    /** The card's title: the `record-panel` output binding's label, else the binding's feature name. */
    Label: string;
    Kind: PredictionValueKind;
    /** "72%" (adverse probability) or a formatted number. */
    DisplayValue: string;
    /** 0–100 gauge fill of a classification's adverse probability; 0 for a regression. */
    GaugePct: number;
    Band: PredictionBand | null;
    /** The risk band's label of a classification ("High risk"); null for a regression. */
    StatusLabel: string | null;
    /** The risk band's badge colour, `gray` for a regression. */
    BadgeColor: RiskBandDisplay['BadgeColor'] | 'gray';
    BadgeIcon: string | null;
    /** The predicted class of a classification; null for a regression. */
    Class: string | null;
    /** The predicted class's probability ("72%"); null when not stored. */
    ClassProbability: string | null;
    /** Every class with its probability, in the stored class order. */
    Classes: PredictionClass[];
    Drivers: PredictionDriver[];
    History: PredictionHistoryPoint[];
    /** The history as an SVG polyline `points` attribute on a 0–100 box. */
    SparklinePoints: string;
    /** "Pipeline v3", or the pipeline alone when the version is unknown. */
    Provenance: string;
    /** When the value was computed, formatted. */
    LastScored: string | null;
    Lineage: PredictionLineage;
}

/** The record panel's rules: its authorization check and its cards. */
export class ModelPredictionLogic {
    /** Maximum number of per-record drivers shown per card. */
    public static readonly MaxDrivers = 5;

    /** A finite number from a dynamic value, or null. */
    public static ToNumber(value: unknown): number | null { // unknown: a stored JSON member or a view column of any type
        if (typeof value === 'number') return Number.isFinite(value) ? value : null;
        if (typeof value === 'string' && value.trim() !== '') {
            const n = Number(value);
            return Number.isFinite(n) ? n : null;
        }
        return null;
    }

    /** The neutral tercile of a 0–1 value, clamped. */
    public static BandFor(value: number): PredictionBand {
        const v = Math.max(0, Math.min(1, value));
        if (v < 1 / 3) return 'low';
        if (v < 2 / 3) return 'mid';
        return 'high';
    }

    /** A 0–1 value as a clamped, rounded 0–100 integer. */
    public static GaugePct(value: number): number {
        return Math.round(Math.max(0, Math.min(1, value)) * 100);
    }

    /** A short date ("Nov 3, 2026") of a moment in the viewer's time zone, or null for a missing or invalid date. */
    public static FormatDate(value: Date | string | null | undefined): string | null {
        return ModelPredictionLogic.formatShortDate(value, undefined);
    }

    /**
     * A short date ("Nov 3, 2026") of a calendar date stored as midnight UTC (an as-of date), read in UTC so the viewer's
     * time zone never moves it to the day before; null for a missing or invalid date.
     */
    public static FormatCalendarDate(value: Date | string | null | undefined): string | null {
        return ModelPredictionLogic.formatShortDate(value, 'UTC');
    }

    private static formatShortDate(value: Date | string | null | undefined, timeZone: string | undefined): string | null {
        if (!value) return null;
        const d = value instanceof Date ? value : new Date(value);
        if (isNaN(d.getTime())) return null;
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone });
    }

    /**
     * The bindings whose view authorization `user` holds: an Owner holds every authorization, anyone else through
     * `AuthorizationEvaluator.UserCanExecuteWithAncestors` (the rule `vwUserHeldAuthorizations` states in SQL). A binding
     * with no view authorization, or one naming an authorization not in `authorizations`, matches no user (fail closed).
     * The row-level security filter on both value entities is the guarantee; this check keeps the panel from showing a
     * card the filter would leave empty.
     */
    public static AuthorizedBindings<T extends Pick<PanelBindingRow, 'ViewAuthorizationID'>>(
        bindings: readonly T[],
        user: UserInfo,
        authorizations: readonly AuthorizationInfo[],
    ): T[] {
        const evaluator = new AuthorizationEvaluator();
        const all = [...authorizations];
        const byId = IndexByUUID(all);
        return bindings.filter((b) => {
            if (!b.ViewAuthorizationID) return false;
            const auth = byId.Get(b.ViewAuthorizationID);
            if (!auth) return false;
            return user.Type === 'Owner' || evaluator.UserCanExecuteWithAncestors(auth, user, all);
        });
    }

    /**
     * One binding's card from its latest value, its history, the scoring model's `record-panel` output binding and the
     * value's scoring run; null when the record has no value of the binding's feature. The value is what the row stores
     * (§5.8.1): a classification's `ValueNumeric` is the adverse-class probability and `ValueText` the predicted class,
     * with `Probabilities` (in the model's class order) and `Drivers` in `ValueJSON`; a regression's `ValueNumeric` is the
     * point prediction. No record column is read.
     */
    public static BuildCard(
        binding: PanelBindingRow,
        latest: PanelValueRow | null,
        history: readonly PanelValueRow[],
        outputBinding: PanelOutputBindingRow | null,
        run: PanelRunRow | null,
    ): PredictionCard | null {
        if (latest === null) return null;
        const stored = StoredPrediction.Parse(latest.ValueJSON);
        const numeric = ModelPredictionLogic.ToNumber(latest.ValueNumeric);
        const kind: PredictionValueKind = latest.ValueText !== null ? 'probability' : 'numeric';
        const band = kind === 'probability' && numeric !== null ? AtRiskRules.RiskBandDisplayFor(AtRiskRules.RiskBandFor(Math.max(0, Math.min(1, numeric)))) : null;
        const confidence = ModelPredictionLogic.ToNumber(latest.Confidence);
        const modelVersion = run ? ModelPredictionLogic.ToNumber(run.ModelVersion) : null;
        const points = ModelPredictionLogic.historyPoints(history, kind);
        return {
            BindingID: binding.ID,
            ModelID: latest.MLModelID,
            Label: outputBinding?.Label?.trim() || binding.FeatureName,
            Kind: kind,
            DisplayValue: ModelPredictionLogic.formatValue(numeric, kind),
            GaugePct: kind === 'probability' && numeric !== null ? ModelPredictionLogic.GaugePct(numeric) : 0,
            Band: kind === 'probability' && numeric !== null ? ModelPredictionLogic.BandFor(numeric) : null,
            StatusLabel: band ? band.Label : null,
            BadgeColor: band ? band.BadgeColor : 'gray',
            BadgeIcon: band ? band.Icon : null,
            Class: latest.ValueText,
            ClassProbability: latest.ValueText !== null && confidence !== null ? `${ModelPredictionLogic.GaugePct(confidence)}%` : null,
            Classes: stored.Probabilities.map((p) => ({ Class: p.Class, Pct: ModelPredictionLogic.GaugePct(p.Probability) })),
            Drivers: ModelPredictionLogic.drivers(stored, outputBinding),
            History: points,
            SparklinePoints: points.map((p) => `${p.X},${p.Y}`).join(' '),
            Provenance: modelVersion !== null ? `${binding.MLTrainingPipeline || binding.FeatureName} v${modelVersion}` : (binding.MLTrainingPipeline || binding.FeatureName),
            LastScored: ModelPredictionLogic.FormatDate(latest.ComputedAt),
            Lineage: {
                Source: latest.Source,
                ModelVersion: modelVersion,
                ScoringRunID: latest.MLScoringRunID,
                AsOf: ModelPredictionLogic.FormatCalendarDate(latest.EffectiveAsOf),
                InTraining: latest.InTraining === true,
            },
        };
    }

    /** A card's primary value: the adverse probability as a percentage, or the point prediction; "—" when missing. */
    private static formatValue(numeric: number | null, kind: PredictionValueKind): string {
        if (numeric === null) return '—';
        return kind === 'probability' ? `${ModelPredictionLogic.GaugePct(numeric)}%` : numeric.toLocaleString(undefined, { maximumFractionDigits: 4 });
    }

    /** The history in as-of order with sparkline coordinates: a probability on a fixed 0–1 scale, a regression on its own range. */
    private static historyPoints(history: readonly PanelValueRow[], kind: PredictionValueKind): PredictionHistoryPoint[] {
        const rows = [...history]
            .filter((r) => ModelPredictionLogic.ToNumber(r.ValueNumeric) !== null)
            .sort((a, b) => ModelPredictionLogic.time(a.EffectiveAsOf) - ModelPredictionLogic.time(b.EffectiveAsOf) || ModelPredictionLogic.time(a.ComputedAt) - ModelPredictionLogic.time(b.ComputedAt));
        const values = rows.map((r) => ModelPredictionLogic.ToNumber(r.ValueNumeric) || 0);
        const min = kind === 'probability' ? 0 : Math.min(...values);
        const max = kind === 'probability' ? 1 : Math.max(...values);
        const span = max - min;
        return rows.map((r, i) => {
            const v = values[i];
            const y = span > 0 ? (1 - (v - min) / span) * 100 : 50;
            return {
                ID: r.ID,
                AsOf: ModelPredictionLogic.FormatCalendarDate(r.EffectiveAsOf) || ModelPredictionLogic.FormatDate(r.ComputedAt) || '—',
                Display: ModelPredictionLogic.formatValue(v, kind),
                X: rows.length > 1 ? Math.round((i / (rows.length - 1)) * 100) : 50,
                Y: Math.round(Math.max(0, Math.min(100, y))),
            };
        });
    }

    /**
     * The per-record drivers, strongest first (at most {@link MaxDrivers}): pointing up when the stored effect raises the
     * adverse outcome, or, when the `record-panel` output binding signs by `raw-contribution`, when the contribution is positive.
     */
    private static drivers(stored: StoredPredictionValue, outputBinding: PanelOutputBindingRow | null): PredictionDriver[] {
        const raw = outputBinding?.DriverDirectionRelativeTo === 'raw-contribution';
        const top = [...stored.Drivers]
            .filter((d) => d.Contribution !== 0)
            .sort((a, b) => Math.abs(b.Contribution) - Math.abs(a.Contribution))
            .slice(0, ModelPredictionLogic.MaxDrivers);
        const strongest = top.length > 0 ? Math.abs(top[0].Contribution) : 0;
        return top.map((d) => ({
            Name: AtRiskRules.HumanizeFeatureName(d.SourceColumn),
            Importance: Math.abs(d.Contribution),
            RelativePct: strongest > 0 ? Math.round((Math.abs(d.Contribution) / strongest) * 100) : 0,
            RaisesAdverse: raw ? d.Contribution > 0 : d.RaisesAdverse,
        }));
    }

    /** Epoch milliseconds of a date, 0 when missing or invalid (an undated value sorts first). */
    private static time(value: Date | string | null | undefined): number {
        if (!value) return 0;
        const t = (value instanceof Date ? value : new Date(value)).getTime();
        return isNaN(t) ? 0 : t;
    }
}
