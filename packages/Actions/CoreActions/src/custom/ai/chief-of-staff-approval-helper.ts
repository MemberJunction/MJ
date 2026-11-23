import { IMetadataProvider, RunView, UserInfo } from '@memberjunction/core';
import {
    MJAIAgentRequestEntity,
    MJAIAgentRhythmTemplateEntity,
} from '@memberjunction/core-entities';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';

/**
 * Verifies that `approvalRequestId` refers to a real `MJ: AI Agent Requests` row in the database
 * whose `Status === 'Approved'`, `RequestForUserID` matches `ownerUserId`, and `AgentID` matches
 * `targetAgentId`. Never trusts self-attested boolean flags supplied by an executing LLM.
 */
export async function VerifyApprovedAgentRequest(
    approvalRequestId: string | null | undefined,
    ownerUserId: string,
    targetAgentId: string,
    contextUser: UserInfo,
    md: IMetadataProvider
): Promise<boolean> {
    const trimmedId = (approvalRequestId ?? '').trim();
    if (!trimmedId || !ownerUserId.trim() || !targetAgentId.trim()) {
        return false;
    }

    const rv = RunView.FromMetadataProvider(md);
    const res = await rv.RunView<MJAIAgentRequestEntity>(
        {
            EntityName: 'MJ: AI Agent Requests',
            ExtraFilter: `ID='${EscapeSQLString(trimmedId)}' AND RequestForUserID='${EscapeSQLString(
                ownerUserId
            )}' AND AgentID='${EscapeSQLString(targetAgentId)}' AND Status='Approved'`,
            MaxRows: 1,
            SkipTotalRowCount: true,
            ResultType: 'entity_object',
        },
        contextUser
    );
    if (!res.Success || !Array.isArray(res.Results) || res.Results.length === 0) {
        return false;
    }

    const row = res.Results[0];
    return (
        row.Status === 'Approved' &&
        UUIDsEqual(row.RequestForUserID, ownerUserId) &&
        UUIDsEqual(row.AgentID, targetAgentId)
    );
}

/**
 * Verifies that `rhythmTemplateId` refers to an `Active` `MJ: AI Agent Rhythm Templates` row
 * owned by `targetAgentIdOrChain` (either the target agent itself or any prototype ancestor in its
 * `BaseAgentID` inheritance chain). Returns the verified template entity or `null` if invalid,
 * inactive, or belonging to an unrelated agent.
 */
export async function VerifyActiveRhythmTemplate(
    rhythmTemplateId: string | null | undefined,
    targetAgentIdOrChain: string | readonly string[],
    contextUser: UserInfo,
    md: IMetadataProvider
): Promise<MJAIAgentRhythmTemplateEntity | null> {
    const trimmedId = (rhythmTemplateId ?? '').trim();
    const allowedIds = (Array.isArray(targetAgentIdOrChain) ? targetAgentIdOrChain : [targetAgentIdOrChain])
        .map((id) => (id ?? '').trim())
        .filter((id) => id.length > 0);
    if (!trimmedId || allowedIds.length === 0) {
        return null;
    }

    const agentFilter =
        allowedIds.length === 1
            ? `AgentID='${EscapeSQLString(allowedIds[0])}'`
            : `AgentID IN (${allowedIds.map((id) => `'${EscapeSQLString(id)}'`).join(',')})`;

    const rv = RunView.FromMetadataProvider(md);
    const res = await rv.RunView<MJAIAgentRhythmTemplateEntity>(
        {
            EntityName: 'MJ: AI Agent Rhythm Templates',
            ExtraFilter: `ID='${EscapeSQLString(trimmedId)}' AND ${agentFilter} AND Status='Active'`,
            MaxRows: 1,
            SkipTotalRowCount: true,
            ResultType: 'entity_object',
        },
        contextUser
    );
    if (!res.Success || !Array.isArray(res.Results) || res.Results.length === 0) {
        return null;
    }

    const template = res.Results[0];
    if (template.Status !== 'Active' || !allowedIds.some((id) => UUIDsEqual(template.AgentID, id))) {
        return null;
    }
    return template;
}
