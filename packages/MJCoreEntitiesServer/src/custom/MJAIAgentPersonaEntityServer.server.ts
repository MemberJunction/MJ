import {
    BaseEntity,
    EntityDeleteOptions,
    IMetadataProvider,
    UserInfo,
    ValidationErrorInfo,
    ValidationErrorType,
    ValidationResult,
} from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { MJAIAgentEntity, MJAIAgentPersonaEntity } from '@memberjunction/core-entities';
import { IsAgentAdminOrOwnerUser } from './MJAIAgentEntityServer.server';

/**
 * Pure ownership check for `MJ: AI Agent Personas` mutations by non-Owner (`UI` role) users.
 * Non-admin users may only attach, update, or remove personas on a derived agent
 * (`BaseAgentID != null`) whose `OwnerUserID === user.ID`.
 */
export function ValidateAgentPersonaOwnership(
    targetAgent: Pick<MJAIAgentEntity, 'ID' | 'BaseAgentID' | 'OwnerUserID'> | null,
    user: UserInfo | null | undefined,
    agentId: string | null | undefined
): ValidationErrorInfo[] {
    if (IsAgentAdminOrOwnerUser(user) || !user) {
        return [];
    }
    if (!targetAgent || !targetAgent.BaseAgentID || !UUIDsEqual(targetAgent.OwnerUserID, user.ID)) {
        return [
            new ValidationErrorInfo(
                'AgentID',
                'Non-administrator users can only configure personas on their own derived agent instances.',
                agentId ?? null,
                ValidationErrorType.Failure
            ),
        ];
    }
    return [];
}

/**
 * Server-side `MJ: AI Agent Personas` entity subclass enforcing non-Owner (`UI` role) sandboxing.
 *
 * The `UI` role holds Create/Update/Delete on `MJ: AI Agent Personas` so users can choose a voice
 * persona and customize `StyleOverride` (`Tone` + `SpeakingStyle`) on their own personal derived
 * agents (such as *Pepper* or *Cato*). This subclass prevents non-admin users from modifying
 * personas on system/catalog agents or another user's derived agent.
 */
@RegisterClass(BaseEntity, 'MJ: AI Agent Personas')
export class MJAIAgentPersonaEntityServer extends MJAIAgentPersonaEntity {
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        if (!result.Success) {
            return result;
        }

        const user = this.ContextCurrentUser;
        if (IsAgentAdminOrOwnerUser(user) || !user) {
            return result;
        }

        const preSaveAgentId =
            (this.GetFieldByName('AgentID')?.OldValue as string | null | undefined) ?? this.AgentID;
        const targetIds = new Set<string>();
        if (preSaveAgentId) targetIds.add(preSaveAgentId);
        if (this.AgentID) targetIds.add(this.AgentID);

        for (const agentId of targetIds) {
            const targetAgent = await this.loadAgent(agentId);
            const errors = ValidateAgentPersonaOwnership(targetAgent, user, agentId);
            if (errors.length > 0) {
                result.Errors.push(...errors);
                result.Success = false;
                break;
            }
        }
        return result;
    }

    public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        const user = this.ContextCurrentUser;
        if (!IsAgentAdminOrOwnerUser(user) && user) {
            const preSaveAgentId =
                (this.GetFieldByName('AgentID')?.OldValue as string | null | undefined) ?? this.AgentID;
            const targetAgent = preSaveAgentId ? await this.loadAgent(preSaveAgentId) : null;
            const errors = ValidateAgentPersonaOwnership(targetAgent, user, preSaveAgentId);
            if (errors.length > 0) {
                this.LatestResult?.Errors.push(...errors);
                return false;
            }
        }
        return super.Delete(options);
    }

    private async loadAgent(agentId: string): Promise<MJAIAgentEntity | null> {
        const md = this.ProviderToUse as unknown as IMetadataProvider;
        const agent = await md.GetEntityObject<MJAIAgentEntity>('MJ: AI Agents', this.ContextCurrentUser);
        if (await agent.Load(agentId)) {
            return agent;
        }
        return null;
    }
}
