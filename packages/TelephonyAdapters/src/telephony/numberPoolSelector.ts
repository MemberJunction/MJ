/**
 * @fileoverview Outbound caller-ID number pool selector.
 *
 * Implements selection over `MJ: Number Pools` and `MJ: Phone Numbers` using:
 * - RoundRobin: evenly rotates through active numbers in the pool;
 * - LocalPresence: prefers numbers matching the area code / country prefix of the callee (ToNumber),
 *   falling back to RoundRobin if no match;
 * - Random: picks randomly among qualifying pool numbers.
 *
 * Enforces:
 * - PhoneNumber.Status = 'Active' (Inactive or Porting numbers are skipped);
 * - MaxConcurrentPerNumber ceiling: counts active `MJ: Interactions` for each candidate number,
 *   skipping numbers that have reached or exceeded the ceiling.
 *
 * @module @memberjunction/telephony-adapters
 */

import { IMetadataProvider, LogError, RunView, UserInfo } from '@memberjunction/core';
import { BaseSingleton, EscapeSQLString } from '@memberjunction/global';
import type { MJNumberPoolEntity, MJPhoneNumberEntity, MJInteractionEntity } from '@memberjunction/core-entities';

const NUMBER_POOL_ENTITY = 'MJ: Number Pools';
const PHONE_NUMBER_ENTITY = 'MJ: Phone Numbers';
const INTERACTION_ENTITY = 'MJ: Interactions';

export interface NumberPoolSelectionRequest {
    /** The pool to select a number from. */
    NumberPoolID: string;
    /** The callee's number (used for LocalPresence matching). */
    ToNumber?: string;
    /** Telephony carrier provider ID to optionally filter numbers by carrier. */
    ProviderID?: string;
    ContextUser: UserInfo;
    MetadataProvider?: IMetadataProvider;
}

export interface SelectedNumberPoolResult {
    PhoneNumber: MJPhoneNumberEntity;
    Number: string;
    PhoneNumberID: string;
    SelectionRule: MJNumberPoolEntity['SelectionRule'];
}

/** Selects numbers from outbound number pools according to configured policies. */
export class NumberPoolSelector extends BaseSingleton<NumberPoolSelector> {
    public constructor() {
        super();
    }

    private readonly roundRobinPointers = new Map<string, number>();

    public static get Instance(): NumberPoolSelector {
        return NumberPoolSelector.getInstance<NumberPoolSelector>();
    }

    /** Resets in-memory round robin pointers (primarily for deterministic unit tests). */
    public ResetPointers(): void {
        this.roundRobinPointers.clear();
    }

    /**
     * Selects an active phone number from the given pool, honouring concurrency limits
     * and the pool's selection rule.
     *
     * @returns The selected phone number, or `null` if no qualifying number is available.
     */
    public async SelectNumber(request: NumberPoolSelectionRequest): Promise<SelectedNumberPoolResult | null> {
        const pool = await this.loadPool(request.NumberPoolID, request.ContextUser, request.MetadataProvider);
        if (!pool) {
            LogError(`[NumberPoolSelector] pool '${request.NumberPoolID}' not found.`);
            return null;
        }

        const candidateNumbers = await this.loadActiveNumbers(request.NumberPoolID, request.ProviderID, request.ContextUser, request.MetadataProvider);
        if (!candidateNumbers.length) {
            LogError(`[NumberPoolSelector] no active phone numbers found in pool '${pool.Name}' (${pool.ID}).`);
            return null;
        }

        // Filter numbers by concurrency cap if MaxConcurrentPerNumber is set
        const qualifyingNumbers = await this.filterByConcurrencyCap(pool, candidateNumbers, request.ContextUser, request.MetadataProvider);
        if (!qualifyingNumbers.length) {
            LogError(`[NumberPoolSelector] all active numbers in pool '${pool.Name}' are at capacity (cap: ${pool.MaxConcurrentPerNumber}).`);
            return null;
        }

        const chosen = this.applySelectionRule(pool, qualifyingNumbers, request.ToNumber);
        if (!chosen) {
            return null;
        }

        return {
            PhoneNumber: chosen,
            Number: chosen.Number,
            PhoneNumberID: chosen.ID,
            SelectionRule: pool.SelectionRule,
        };
    }

    private async loadPool(poolId: string, user: UserInfo, provider?: IMetadataProvider): Promise<MJNumberPoolEntity | null> {
        try {
            const runView = provider ? RunView.FromMetadataProvider(provider) : new RunView();
            if (!runView.ProviderToUse && typeof runView.RunView !== 'function') {
                return null;
            }
            const result = await runView.RunView<MJNumberPoolEntity>(
                {
                    EntityName: NUMBER_POOL_ENTITY,
                    ExtraFilter: `ID='${EscapeSQLString(poolId)}'`,
                    MaxRows: 1,
                    ResultType: 'entity_object',
                },
                user,
            );
            return result.Success && result.Results?.length ? result.Results[0] : null;
        } catch (e) {
            LogError(`[NumberPoolSelector] error loading pool: ${e instanceof Error ? e.message : String(e)}`);
            return null;
        }
    }

    private async loadActiveNumbers(poolId: string, providerId: string | undefined, user: UserInfo, provider?: IMetadataProvider): Promise<MJPhoneNumberEntity[]> {
        try {
            const runView = provider ? RunView.FromMetadataProvider(provider) : new RunView();
            if (!runView.ProviderToUse && typeof runView.RunView !== 'function') {
                return [];
            }
            const providerFilter = providerId ? ` AND ProviderID='${EscapeSQLString(providerId)}'` : '';
            const result = await runView.RunView<MJPhoneNumberEntity>(
                {
                    EntityName: PHONE_NUMBER_ENTITY,
                    ExtraFilter: `NumberPoolID='${EscapeSQLString(poolId)}' AND Status='Active'${providerFilter}`,
                    ResultType: 'entity_object',
                },
                user,
            );
            return result.Success && result.Results ? result.Results : [];
        } catch (e) {
            LogError(`[NumberPoolSelector] error loading active numbers: ${e instanceof Error ? e.message : String(e)}`);
            return [];
        }
    }

    private async filterByConcurrencyCap(
        pool: MJNumberPoolEntity,
        candidates: MJPhoneNumberEntity[],
        user: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<MJPhoneNumberEntity[]> {
        const maxConcurrent = pool.MaxConcurrentPerNumber;
        if (maxConcurrent == null || maxConcurrent <= 0) {
            return candidates;
        }

        const candidateIds = candidates.map((c) => `'${EscapeSQLString(c.ID)}'`).join(',');
        const activeCounts = new Map<string, number>();

        try {
            const runView = provider ? RunView.FromMetadataProvider(provider) : new RunView();
            if (!runView.ProviderToUse && typeof runView.RunView !== 'function') {
                return candidates;
            }
            const result = await runView.RunView<MJInteractionEntity>(
                {
                    EntityName: INTERACTION_ENTITY,
                    ExtraFilter: `Status='Active' AND PhoneNumberID IN (${candidateIds})`,
                    ResultType: 'entity_object',
                },
                user,
            );

            if (result.Success && result.Results) {
                for (const interaction of result.Results) {
                    if (interaction.PhoneNumberID) {
                        const current = activeCounts.get(interaction.PhoneNumberID) ?? 0;
                        activeCounts.set(interaction.PhoneNumberID, current + 1);
                    }
                }
            }
        } catch (e) {
            LogError(`[NumberPoolSelector] error checking concurrency cap: ${e instanceof Error ? e.message : String(e)}`);
        }

        return candidates.filter((candidate) => {
            const count = activeCounts.get(candidate.ID) ?? 0;
            return count < maxConcurrent;
        });
    }

    private applySelectionRule(
        pool: MJNumberPoolEntity,
        candidates: MJPhoneNumberEntity[],
        toNumber?: string,
    ): MJPhoneNumberEntity | null {
        if (!candidates.length) {
            return null;
        }

        switch (pool.SelectionRule) {
            case 'Random':
                return candidates[Math.floor(Math.random() * candidates.length)];

            case 'LocalPresence': {
                if (toNumber) {
                    const matched = this.matchLocalPresence(candidates, toNumber);
                    if (matched.length > 0) {
                        return this.pickRoundRobin(pool.ID, matched);
                    }
                }
                // Fall back to round robin across all candidates
                return this.pickRoundRobin(pool.ID, candidates);
            }

            case 'RoundRobin':
            default:
                return this.pickRoundRobin(pool.ID, candidates);
        }
    }

    private pickRoundRobin(poolId: string, list: MJPhoneNumberEntity[]): MJPhoneNumberEntity {
        const current = this.roundRobinPointers.get(poolId) ?? 0;
        const index = current % list.length;
        this.roundRobinPointers.set(poolId, index + 1);
        return list[index];
    }

    /**
     * Matches candidate numbers against `toNumber` for local presence.
     * Checks area code match (first 5 chars for NANP +1NXX, e.g. +1415),
     * then country prefix (e.g. +1).
     */
    private matchLocalPresence(candidates: MJPhoneNumberEntity[], toNumber: string): MJPhoneNumberEntity[] {
        const normalizedTo = toNumber.trim();
        if (!normalizedTo.startsWith('+')) {
            return [];
        }

        // Try matching area code (+1 followed by 3-digit area code = 5 chars, or other 5-char prefix)
        if (normalizedTo.length >= 5) {
            const areaCodePrefix = normalizedTo.slice(0, 5);
            const areaMatches = candidates.filter((c) => (c.Number ?? '').startsWith(areaCodePrefix));
            if (areaMatches.length > 0) {
                return areaMatches;
            }
        }

        // Try 4-char prefix
        if (normalizedTo.length >= 4) {
            const prefix4 = normalizedTo.slice(0, 4);
            const matches4 = candidates.filter((c) => (c.Number ?? '').startsWith(prefix4));
            if (matches4.length > 0) {
                return matches4;
            }
        }

        // Try country code prefix (e.g. +1 or +44)
        const countryPrefix = normalizedTo.startsWith('+1') ? '+1' : normalizedTo.slice(0, 3);
        const countryMatches = candidates.filter((c) => (c.Number ?? '').startsWith(countryPrefix));
        return countryMatches;
    }
}
