/**
 * @fileoverview All 7 standard Guided Tour triggers (§5.1 & §11):
 * FirstVisit (MJ App/NavItem + URL glob/regex), EntityFormOpened, Signal,
 * AppUpgraded, Struggle (only repeated save validation failures & "how do I" omnibar),
 * Schedule, AgentSuggested.
 * @module @memberjunction/tours-runtime
 */

import { CompositeFilter, IsCompositeFilter, IsSimpleFilter } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import type { TourCapabilityRequirement, TourLocation } from '../host-contracts';
import { BuildFilterEvalContext } from '../tour-graph-compiler';
import { BaseTourTrigger } from './base-trigger';
import type { TourTriggerContext, TourTriggerMatch } from './plugin-types';

function noMatch(ctx: TourTriggerContext, reason?: string): TourTriggerMatch {
    return { Matched: false, Delivery: ctx.Trigger.Delivery, Reason: reason };
}

function matchUrlPattern(
    pattern: string,
    url: string,
    mode: 'glob' | 'regex' | 'exact' = 'glob',
): boolean {
    if (mode === 'exact') {
        return url === pattern;
    }
    if (mode === 'regex') {
        try {
            return new RegExp(pattern).test(url);
        } catch {
            return false;
        }
    }
    // Glob pattern matching (supports **, *, ?)
    const escaped = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '___DOUBLE_STAR___')
        .replace(/\*/g, '[^/]*')
        .replace(/___DOUBLE_STAR___/g, '.*')
        .replace(/\?/g, '.');
    return new RegExp(`^${escaped}$`).test(url);
}

function locationMatchesConfig(config: Record<string, unknown>, loc: TourLocation): boolean {
    const appName = typeof config['ApplicationName'] === 'string' ? config['ApplicationName'] : undefined;
    const navItemKey = typeof config['NavItemKey'] === 'string' ? config['NavItemKey'] : undefined;
    const driverClass = typeof config['DriverClass'] === 'string' ? config['DriverClass'] : undefined;
    const urlPattern = typeof config['UrlPattern'] === 'string' ? config['UrlPattern'] : undefined;
    const urlMatchMode =
        config['UrlMatchMode'] === 'regex' || config['UrlMatchMode'] === 'exact'
            ? config['UrlMatchMode']
            : 'glob';

    if (appName && loc.ApplicationName !== appName) return false;
    if (navItemKey && loc.NavItemKey !== navItemKey) return false;
    if (driverClass && loc.DriverClass !== driverClass) return false;
    if (urlPattern) {
        if (!loc.Url) return false;
        if (!matchUrlPattern(urlPattern, loc.Url, urlMatchMode)) return false;
    }
    return Boolean(appName || navItemKey || driverClass || urlPattern);
}

@RegisterClass(BaseTourTrigger, 'FirstVisit')
export class FirstVisitTrigger extends BaseTourTrigger {
    public Evaluate(ctx: TourTriggerContext): TourTriggerMatch {
        if (this.isWithinCooldown(ctx)) {
            return noMatch(ctx, 'Trigger is within cooldown.');
        }

        // Already ran this tour at least once -> not first visit
        const hasAnyRun = ctx.Runs.some((r) => r.TourKey === ctx.Tour.TourKey);
        if (hasAnyRun) {
            return noMatch(ctx, 'User has already started or completed this tour.');
        }

        const config = ctx.Trigger.Configuration ?? {};
        const hasExplicitLocationRule = Boolean(
            config['ApplicationName'] ||
                config['NavItemKey'] ||
                config['DriverClass'] ||
                config['UrlPattern'],
        );

        if (hasExplicitLocationRule) {
            if (!locationMatchesConfig(config, ctx.Location)) {
                return noMatch(ctx, 'Current location does not match FirstVisit trigger location.');
            }
            return { Matched: true, Delivery: ctx.Trigger.Delivery };
        }

        // Fall back to Tour.StartLocation if trigger configuration omitted location criteria
        const startLoc = ctx.Tour.StartLocation;
        if (startLoc) {
            const fallbackConfig: Record<string, unknown> = {
                ApplicationName: startLoc.ApplicationName,
                NavItemKey: startLoc.NavItemKey,
                DriverClass: startLoc.DriverClass,
                UrlPattern: startLoc.UrlPattern,
                UrlMatchMode: startLoc.UrlMatchMode,
            };
            if (!locationMatchesConfig(fallbackConfig, ctx.Location)) {
                return noMatch(ctx, 'Current location does not match tour StartLocation.');
            }
        }

        return { Matched: true, Delivery: ctx.Trigger.Delivery };
    }
}

@RegisterClass(BaseTourTrigger, 'EntityFormOpened')
export class EntityFormOpenedTrigger extends BaseTourTrigger {
    public override readonly RequiredCapabilities: TourCapabilityRequirement = {
        MJForms: true,
    };

    public Evaluate(ctx: TourTriggerContext): TourTriggerMatch {
        if (this.isWithinCooldown(ctx)) {
            return noMatch(ctx, 'Trigger is within cooldown.');
        }
        const config = ctx.Trigger.Configuration ?? {};
        const targetEntity = typeof config['EntityName'] === 'string' ? config['EntityName'] : undefined;
        const requireNewRecord = config['NewRecordOnly'] === true;

        const currentEntity = ctx.Location.EntityName ?? ctx.EntityEvent?.EntityName;
        if (!currentEntity) {
            return noMatch(ctx, 'No open entity form in current location.');
        }
        if (targetEntity && currentEntity !== targetEntity) {
            return noMatch(ctx, `Open entity '${currentEntity}' does not match '${targetEntity}'.`);
        }
        if (requireNewRecord && ctx.Location.RecordId) {
            return noMatch(ctx, 'EntityFormOpened configured for new records only.');
        }
        return { Matched: true, Delivery: ctx.Trigger.Delivery };
    }
}

@RegisterClass(BaseTourTrigger, 'Signal')
export class SignalTrigger extends BaseTourTrigger {
    public Evaluate(ctx: TourTriggerContext): TourTriggerMatch {
        if (this.isWithinCooldown(ctx)) {
            return noMatch(ctx, 'Trigger is within cooldown.');
        }
        const config = ctx.Trigger.Configuration ?? {};
        const expectedKey = typeof config['SignalKey'] === 'string' ? config['SignalKey'].trim() : '';
        if (!expectedKey || !ctx.SignalEvent || ctx.SignalEvent.SignalKey !== expectedKey) {
            return noMatch(ctx, 'Signal key did not match.');
        }
        const payloadFilter = config['PayloadFilter'];
        if (
            payloadFilter &&
            typeof payloadFilter === 'object' &&
            (IsCompositeFilter(payloadFilter as never) || IsSimpleFilter(payloadFilter as never))
        ) {
            const cf = CompositeFilter.FromJSON(payloadFilter);
            if (!cf.Evaluate(BuildFilterEvalContext(ctx.SignalEvent.Payload ?? {}))) {
                return noMatch(ctx, 'Signal payload filter did not match.');
            }
        }
        return { Matched: true, Delivery: ctx.Trigger.Delivery };
    }
}

@RegisterClass(BaseTourTrigger, 'AppUpgraded')
export class AppUpgradedTrigger extends BaseTourTrigger {
    public override readonly RequiredCapabilities: TourCapabilityRequirement = {
        Navigation: ['MJ App'],
    };

    public Evaluate(ctx: TourTriggerContext): TourTriggerMatch {
        if (this.isWithinCooldown(ctx)) {
            return noMatch(ctx, 'Trigger is within cooldown.');
        }
        const config = ctx.Trigger.Configuration ?? {};
        const appName =
            (typeof config['ApplicationName'] === 'string' ? config['ApplicationName'] : undefined) ??
            ctx.Tour.ApplicationName ??
            undefined;
        const targetVersion =
            (typeof config['Version'] === 'string' ? config['Version'] : undefined) ??
            ctx.Tour.Configuration?.AppVersionTag;

        if (!appName || !targetVersion) {
            return noMatch(ctx, 'AppUpgraded requires ApplicationName and Version.');
        }

        const installedVersion = ctx.InstalledAppVersions?.get(appName);
        if (!installedVersion || installedVersion !== targetVersion) {
            return noMatch(ctx, `Installed version for '${appName}' does not match '${targetVersion}'.`);
        }
        const seenVersion = ctx.SeenAppVersions?.get(appName);
        if (seenVersion === targetVersion) {
            return noMatch(ctx, `User has already seen '${appName}' version '${targetVersion}'.`);
        }
        return { Matched: true, Delivery: ctx.Trigger.Delivery };
    }
}

/**
 * Struggle trigger (§11):
 * Uses ONLY high-signal indicators:
 *   1. Repeated validation failures on Save (never idle time or back-and-forth nav)
 *   2. `"how do I"` omnibar searches
 * Always offers quietly (`Offer` / Sage orb, never auto-launching a modal).
 */
@RegisterClass(BaseTourTrigger, 'Struggle')
export class StruggleTrigger extends BaseTourTrigger {
    public Evaluate(ctx: TourTriggerContext): TourTriggerMatch {
        if (this.isWithinCooldown(ctx)) {
            return noMatch(ctx, 'Trigger is within cooldown.');
        }
        const evt = ctx.StruggleEvent;
        if (!evt) {
            return noMatch(ctx, 'No struggle signal present.');
        }

        const config = ctx.Trigger.Configuration ?? {};
        const minFailures = typeof config['MinValidationFailures'] === 'number' ? config['MinValidationFailures'] : 2;
        const targetEntity = typeof config['EntityName'] === 'string' ? config['EntityName'] : undefined;

        if (evt.Kind === 'RepeatedSaveValidationFailure') {
            const count = evt.FailureCount ?? 0;
            if (count < minFailures) {
                return noMatch(ctx, `Save validation failures (${count}) below threshold (${minFailures}).`);
            }
            if (targetEntity && evt.EntityName !== targetEntity) {
                return noMatch(ctx, 'Validation failure entity does not match.');
            }
            return {
                Matched: true,
                Delivery: 'Offer',
                Reason: 'RepeatedSaveValidationFailure',
            };
        }

        if (evt.Kind === 'HowDoIOmnibarQuery') {
            const query = (evt.QueryText ?? '').trim().toLowerCase();
            if (!query.includes('how do i')) {
                return noMatch(ctx, 'Omnibar query is not a "how do I" query.');
            }
            const keywords = Array.isArray(config['Keywords'])
                ? config['Keywords'].filter((k): k is string => typeof k === 'string')
                : [];
            if (keywords.length > 0 && !keywords.some((kw) => query.includes(kw.toLowerCase()))) {
                return noMatch(ctx, 'Query did not match Struggle trigger keywords.');
            }
            return {
                Matched: true,
                Delivery: 'Offer',
                Reason: 'HowDoIOmnibarQuery',
            };
        }

        return noMatch(ctx, 'Unsupported struggle indicator.');
    }
}

@RegisterClass(BaseTourTrigger, 'Schedule')
export class ScheduleTrigger extends BaseTourTrigger {
    public Evaluate(ctx: TourTriggerContext): TourTriggerMatch {
        if (this.isWithinCooldown(ctx)) {
            return noMatch(ctx, 'Trigger is within cooldown.');
        }
        const config = ctx.Trigger.Configuration ?? {};
        const nowMs = (ctx.Now ?? new Date()).getTime();
        const startIso = typeof config['StartAt'] === 'string' ? config['StartAt'] : undefined;
        const endIso = typeof config['EndAt'] === 'string' ? config['EndAt'] : undefined;

        if (startIso) {
            const startMs = Date.parse(startIso);
            if (!Number.isFinite(startMs) || nowMs < startMs) {
                return noMatch(ctx, 'Schedule window has not started yet.');
            }
        }
        if (endIso) {
            const endMs = Date.parse(endIso);
            if (!Number.isFinite(endMs) || nowMs > endMs) {
                return noMatch(ctx, 'Schedule window has expired.');
            }
        }

        return { Matched: Boolean(startIso || endIso), Delivery: ctx.Trigger.Delivery };
    }
}

@RegisterClass(BaseTourTrigger, 'AgentSuggested')
export class AgentSuggestedTrigger extends BaseTourTrigger {
    public override readonly RequiredCapabilities: TourCapabilityRequirement = {
        Agent: ['Chat', 'Voice', 'Chat and Voice'],
    };

    public Evaluate(ctx: TourTriggerContext): TourTriggerMatch {
        if (this.isWithinCooldown(ctx)) {
            return noMatch(ctx, 'Trigger is within cooldown.');
        }
        const config = ctx.Trigger.Configuration ?? {};
        const explicitSuggested = config['Suggested'] === true;
        const signalMatch =
            ctx.SignalEvent?.SignalKey === 'tours.agent.suggested' &&
            ctx.SignalEvent.Payload?.['TourKey'] === ctx.Tour.TourKey;

        if (!explicitSuggested && !signalMatch) {
            return noMatch(ctx, 'Tour was not suggested by an agent.');
        }
        return { Matched: true, Delivery: ctx.Trigger.Delivery };
    }
}
