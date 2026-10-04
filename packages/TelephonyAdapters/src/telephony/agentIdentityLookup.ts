/**
 * @fileoverview Looks up the agent identity (a phone number an agent answers on) for a call.
 *
 * Routing is data: an `MJ: AI Bridge Agent Identities` row says "this number, on this provider, is answered by this
 * agent". An inbound call is routed by finding the active row for the dialed number and the carrier's provider row.
 *
 * @module @memberjunction/telephony-adapters
 */

import { IMetadataProvider, LogError, RunView, UserInfo } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import type { MJAIBridgeAgentIdentityEntity, MJPhoneNumberEntity } from '@memberjunction/core-entities';

const AGENT_IDENTITY_ENTITY = 'MJ: AI Bridge Agent Identities';
const PHONE_NUMBER_ENTITY = 'MJ: Phone Numbers';
const PHONE_IDENTITY_TYPE = 'PhoneNumber';
function getRunView(metadataProvider?: IMetadataProvider): RunView | null {
    try {
        if (metadataProvider && typeof (metadataProvider as { RunView?: unknown }).RunView === 'function') {
            return RunView.FromMetadataProvider(metadataProvider);
        }
        const rv = new RunView();
        if (rv.ProviderToUse || typeof rv.RunView === 'function') {
            return rv;
        }
        return null;
    } catch {
        return null;
    }
}

/** Finds an ACTIVE phone number row by dialed number and optional provider, or `null`. Never throws. */
export async function FindPhoneNumber(
    dialedNumber: string,
    providerId: string | undefined,
    contextUser: UserInfo,
    metadataProvider?: IMetadataProvider,
): Promise<MJPhoneNumberEntity | null> {
    const normalized = (dialedNumber ?? '').trim();
    if (!normalized) {
        return null;
    }
    const runView = getRunView(metadataProvider);
    if (!runView) {
        return null;
    }
    try {
        const providerFilter = providerId ? ` AND ProviderID='${EscapeSQLString(providerId)}'` : '';
        const result = await runView.RunView<MJPhoneNumberEntity>(
            {
                EntityName: PHONE_NUMBER_ENTITY,
                ExtraFilter: `Number='${EscapeSQLString(normalized)}' AND Status='Active'${providerFilter}`,
                MaxRows: 1,
                ResultType: 'entity_object',
            },
            contextUser,
        );
        if (!result.Success) {
            LogError(`[Telephony] phone-number lookup failed: ${result.ErrorMessage}`);
            return null;
        }
        return result.Results?.[0] ?? null;
    } catch (e) {
        LogError(`[Telephony] phone-number lookup error: ${e instanceof Error ? e.message : String(e)}`);
        return null;
    }
}

/**
 * Finds the ACTIVE phone-number identity for a dialed number on a provider, or `null`. Never throws.
 *
 * Inbound routing by number: directly looks up the active agent identity for the dialed number,
 * falling back to resolving through the `PhoneNumber` row if needed.
 */
export async function FindPhoneAgentIdentity(
    dialedNumber: string,
    providerId: string,
    contextUser: UserInfo,
    metadataProvider?: IMetadataProvider,
): Promise<MJAIBridgeAgentIdentityEntity | null> {
    const normalized = (dialedNumber ?? '').trim();
    if (!normalized) {
        return null;
    }
    const runView = getRunView(metadataProvider);
    if (!runView) {
        return null;
    }

    try {
        // 1. Direct agent-identity lookup
        const result = await runView.RunView<MJAIBridgeAgentIdentityEntity>(
            {
                EntityName: AGENT_IDENTITY_ENTITY,
                ExtraFilter: `IdentityType='${PHONE_IDENTITY_TYPE}' AND IdentityValue='${EscapeSQLString(normalized)}' AND ProviderID='${EscapeSQLString(providerId)}' AND IsActive=1`,
                MaxRows: 1,
                ResultType: 'entity_object',
            },
            contextUser,
        );
        if (result.Success && result.Results?.length) {
            return result.Results[0];
        }

        // 2. Fallback: check if the number maps to a canonical PhoneNumber row
        const phone = await FindPhoneNumber(normalized, providerId, contextUser, metadataProvider);
        if (phone?.Number && phone.Number !== normalized) {
            const fallbackResult = await runView.RunView<MJAIBridgeAgentIdentityEntity>(
                {
                    EntityName: AGENT_IDENTITY_ENTITY,
                    ExtraFilter: `IdentityType='${PHONE_IDENTITY_TYPE}' AND IdentityValue='${EscapeSQLString(phone.Number)}' AND ProviderID='${EscapeSQLString(providerId)}' AND IsActive=1`,
                    MaxRows: 1,
                    ResultType: 'entity_object',
                },
                contextUser,
            );
            if (fallbackResult.Success && fallbackResult.Results?.length) {
                return fallbackResult.Results[0];
            }
        }

        if (!result.Success) {
            LogError(`[Telephony] agent-identity lookup failed: ${result.ErrorMessage}`);
        }
        return null;
    } catch (e) {
        LogError(`[Telephony] agent-identity lookup error: ${e instanceof Error ? e.message : String(e)}`);
        return null;
    }
}

/**
 * Resolves an inbound call to its `PhoneNumber` row and `AgentIdentity` row.
 * Resolves dialed number to agent identity and `PhoneNumber` row.
 */
export async function FindInboundRoute(
    dialedNumber: string,
    providerId: string,
    contextUser: UserInfo,
    metadataProvider?: IMetadataProvider,
): Promise<{ PhoneNumber: MJPhoneNumberEntity | null; AgentIdentity: MJAIBridgeAgentIdentityEntity | null }> {
    const normalized = (dialedNumber ?? '').trim();
    if (!normalized) {
        return { PhoneNumber: null, AgentIdentity: null };
    }

    const agentIdentity = await FindPhoneAgentIdentity(normalized, providerId, contextUser, metadataProvider);
    const phoneNumber = await FindPhoneNumber(normalized, providerId, contextUser, metadataProvider);
    return { PhoneNumber: phoneNumber, AgentIdentity: agentIdentity };
}

/** Loads an agent identity by id, requiring it to be active; `null` when it is missing or inactive. */
export async function LoadActiveAgentIdentity(agentIdentityId: string, contextUser: UserInfo, provider: IMetadataProvider): Promise<MJAIBridgeAgentIdentityEntity | null> {
    const entity = await provider.GetEntityObject<MJAIBridgeAgentIdentityEntity>(AGENT_IDENTITY_ENTITY, contextUser);
    if (!(await entity.Load(agentIdentityId)) || !entity.IsActive) {
        return null;
    }
    return entity;
}
