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
 * owned by `targetAgentId`. Returns the verified template entity or `null` if invalid, inactive,
 * or belonging to a different agent.
 */
export async function VerifyActiveRhythmTemplate(
    rhythmTemplateId: string | null | undefined,
    targetAgentId: string,
    contextUser: UserInfo,
    md: IMetadataProvider
): Promise<MJAIAgentRhythmTemplateEntity | null> {
    const trimmedId = (rhythmTemplateId ?? '').trim();
    if (!trimmedId || !targetAgentId.trim()) {
        return null;
    }

    const rv = RunView.FromMetadataProvider(md);
    const res = await rv.RunView<MJAIAgentRhythmTemplateEntity>(
        {
            EntityName: 'MJ: AI Agent Rhythm Templates',
            ExtraFilter: `ID='${EscapeSQLString(trimmedId)}' AND AgentID='${EscapeSQLString(
                targetAgentId
            )}' AND Status='Active'`,
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
    if (template.Status !== 'Active' || !UUIDsEqual(template.AgentID, targetAgentId)) {
        return null;
    }
    return template;
}
