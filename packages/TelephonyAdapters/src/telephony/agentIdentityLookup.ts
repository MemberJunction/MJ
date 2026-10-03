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
import type { MJAIBridgeAgentIdentityEntity } from '@memberjunction/core-entities';

const AGENT_IDENTITY_ENTITY = 'MJ: AI Bridge Agent Identities';
const PHONE_IDENTITY_TYPE = 'PhoneNumber';

/** Finds the ACTIVE phone-number identity for a dialed number on a provider, or `null`. Never throws. */
export async function FindPhoneAgentIdentity(dialedNumber: string, providerId: string, contextUser: UserInfo): Promise<MJAIBridgeAgentIdentityEntity | null> {
    const normalized = (dialedNumber ?? '').trim();
    if (!normalized) {
        return null;
    }
    const result = await new RunView().RunView<MJAIBridgeAgentIdentityEntity>(
        {
            EntityName: AGENT_IDENTITY_ENTITY,
            ExtraFilter: `IdentityType='${PHONE_IDENTITY_TYPE}' AND IdentityValue='${EscapeSQLString(normalized)}' AND ProviderID='${EscapeSQLString(providerId)}' AND IsActive=1`,
            MaxRows: 1,
            ResultType: 'entity_object',
        },
        contextUser,
    );
    if (!result.Success) {
        LogError(`[Telephony] agent-identity lookup failed: ${result.ErrorMessage}`);
        return null;
    }
    return result.Results?.[0] ?? null;
}

/** Loads an agent identity by id, requiring it to be active; `null` when it is missing or inactive. */
export async function LoadActiveAgentIdentity(agentIdentityId: string, contextUser: UserInfo, provider: IMetadataProvider): Promise<MJAIBridgeAgentIdentityEntity | null> {
    const entity = await provider.GetEntityObject<MJAIBridgeAgentIdentityEntity>(AGENT_IDENTITY_ENTITY, contextUser);
    if (!(await entity.Load(agentIdentityId)) || !entity.IsActive) {
        return null;
    }
    return entity;
}
