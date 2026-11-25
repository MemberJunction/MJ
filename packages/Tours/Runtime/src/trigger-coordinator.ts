/**
 * @fileoverview Headless trigger coordinator implementing §11 proactive trigger
 * evaluation, preferences filtering, and session interruption budget throttling.
 * @module @memberjunction/tours-runtime
 */

import { MJGlobal } from '@memberjunction/global';
import type {
    ITourHost,
    TourLocation,
    TourPrincipal,
} from './host-contracts';
import { BaseTourTrigger } from './plugins/base-trigger';
import type { TourEntityEventPayload } from './plugins/plugin-types';
import { RegisterStandardTourPlugins } from './plugins/register-standard-plugins';
import { TourEligibilityEvaluator } from './plugins/standard-eligibility-policies';
import type {
    TourDefinition,
    TourPreferences,
    TourRunRecord,
    TourRunStatus,
    TourTriggerDefinition,
    TourTriggerDelivery,
} from './types';

RegisterStandardTourPlugins();

/** Default maximum proactive tour offers shown per browser session to prevent interruption fatigue (§11). */
const DEFAULT_MAX_OFFERS_PER_SESSION = 1;

/** Default minimum interval (ms) between proactive tour offers (2 minutes) to avoid back-to-back prompts (§11). */
const DEFAULT_MIN_OFFER_INTERVAL_MS = 120_000;

export interface TourTriggerCoordinatorOptions {
    MaxOffersPerSession?: number;
    MinOfferIntervalMs?: number;
    EligibilityEvaluator?: TourEligibilityEvaluator;
}

export interface TourTriggerEvaluationRequest {
    Tours: TourDefinition[];
    Host: ITourHost;
    Location: TourLocation;
    Principal: TourPrincipal;
    Runs: TourRunRecord[];
    Preferences: TourPreferences;
    ActiveSessionStatus?: TourRunStatus | null;
    SignalKey?: string;
    SignalPayload?: Record<string, unknown>;
    EntityEvent?: TourEntityEventPayload;
    Now?: Date;
}

export interface TourTriggerOfferMatch {
    Tour: TourDefinition;
    Trigger: TourTriggerDefinition;
    Delivery: TourTriggerDelivery;
}

/**
 * Coordinates proactive tour trigger evaluation across eligible tours while enforcing
 * user preferences, dismissed offers, and the session interruption budget.
 */
export class TourTriggerCoordinator {
    private readonly _maxOffersPerSession: number;
    private readonly _minOfferIntervalMs: number;
    private readonly _eligibilityEvaluator: TourEligibilityEvaluator;

    private _offersShownCount = 0;
    private _lastOfferShownAtMs: number | null = null;
    private readonly _dismissedTourKeys = new Set<string>();

    constructor(options: TourTriggerCoordinatorOptions = {}) {
        this._maxOffersPerSession = options.MaxOffersPerSession ?? DEFAULT_MAX_OFFERS_PER_SESSION;
        this._minOfferIntervalMs = options.MinOfferIntervalMs ?? DEFAULT_MIN_OFFER_INTERVAL_MS;
        this._eligibilityEvaluator = options.EligibilityEvaluator ?? new TourEligibilityEvaluator();
    }

    public EvaluateForContext(
        args: TourTriggerEvaluationRequest,
    ): TourTriggerOfferMatch | null {
        if (args.ActiveSessionStatus === 'In Progress') {
            return null;
        }

        const now = args.Now ?? new Date();
        const nowMs = now.getTime();

        const ranked = this._eligibilityEvaluator.RankEligibleTours(args.Tours, {
            Host: args.Host,
            Location: args.Location,
            Principal: args.Principal,
            Preferences: args.Preferences,
            Runs: args.Runs,
            RequestedExplicitly: false,
            Now: now,
        });

        for (const { Tour: tour } of ranked) {
            if (this._dismissedTourKeys.has(tour.TourKey)) {
                continue;
            }

            const activeTriggers = (tour.Triggers ?? [])
                .filter((t) => t.Status === 'Active')
                .sort(
                    (a, b) =>
                        (b.Priority ?? tour.Priority ?? 100) -
                        (a.Priority ?? tour.Priority ?? 100),
                );

            for (const trigger of activeTriggers) {
                const reg = MJGlobal.Instance.ClassFactory.GetRegistration(
                    BaseTourTrigger,
                    trigger.TriggerType,
                );
                if (!reg) {
                    continue;
                }

                const triggerPlugin = MJGlobal.Instance.ClassFactory.CreateInstance<BaseTourTrigger>(
                    BaseTourTrigger,
                    trigger.TriggerType,
                );
                if (!triggerPlugin) {
                    continue;
                }

                const match = triggerPlugin.Evaluate({
                    Tour: tour,
                    Trigger: trigger,
                    Host: args.Host,
                    Location: args.Location,
                    Principal: args.Principal,
                    Runs: args.Runs,
                    SignalEvent: args.SignalKey
                        ? { SignalKey: args.SignalKey, Payload: args.SignalPayload }
                        : undefined,
                    EntityEvent: args.EntityEvent,
                    Now: now,
                });

                if (!match.Matched) {
                    continue;
                }

                if (match.Delivery === 'Beacon' && !args.Preferences.ShowBeacons) {
                    continue;
                }

                if (
                    match.Delivery === 'Offer' ||
                    match.Delivery === 'Auto' ||
                    match.Delivery === 'Notification'
                ) {
                    if (args.Preferences.OffersEnabled === false) {
                        continue;
                    }
                    if (this._offersShownCount >= this._maxOffersPerSession) {
                        continue;
                    }
                    if (
                        this._lastOfferShownAtMs !== null &&
                        nowMs - this._lastOfferShownAtMs < this._minOfferIntervalMs
                    ) {
                        continue;
                    }
                }

                return {
                    Tour: tour,
                    Trigger: trigger,
                    Delivery: match.Delivery,
                };
            }
        }

        return null;
    }

    public RecordOfferShown(_tourKey: string, now?: Date): void {
        this._offersShownCount++;
        this._lastOfferShownAtMs = (now ?? new Date()).getTime();
    }

    public DismissOffer(tourKey: string): void {
        this._dismissedTourKeys.add(tourKey);
    }

    public ResetSessionBudget(): void {
        this._offersShownCount = 0;
        this._lastOfferShownAtMs = null;
        this._dismissedTourKeys.clear();
    }
}
