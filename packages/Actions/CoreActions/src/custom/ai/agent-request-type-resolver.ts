import { UserInfo } from '@memberjunction/core';
import { AIEngineBase } from '@memberjunction/ai-engine-base';

/** Name of the `MJ: AI Agent Request Types` row that marks a request as needing a human decision. */
export const APPROVAL_REQUEST_TYPE_NAME = 'Approval';

/**
 * Resolves an `MJ: AI Agent Request Types` id by its name through the AI engine's cached
 * request types. Returns null when the type is not seeded in this environment; callers should
 * surface that as a result code rather than save a request with an unknown type.
 */
export async function ResolveAgentRequestTypeId(typeName: string, contextUser: UserInfo): Promise<string | null> {
    await AIEngineBase.Instance.EnsureLoaded(contextUser);
    return AIEngineBase.Instance.GetAgentRequestTypeByName(typeName)?.ID ?? null;
}
