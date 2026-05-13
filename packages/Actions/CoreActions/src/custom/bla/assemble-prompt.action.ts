import { BaseAction } from '@memberjunction/actions';
import type { RunActionParams, ActionResultSimple, ActionParam } from '@memberjunction/actions-base';
import { LogError, LogStatus, Metadata, RunView } from '@memberjunction/core';
import type { MJAIPromptEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BLAPromptAssembler } from './services/BLAPromptAssembler';
import type { BLAChatMessage } from './services/types';

/**
 * Action: BLA - Assemble Prompt
 *
 * Inputs:
 *   - PromptName          (required) name of the __mj.AIPrompt the assembly belongs to
 *   - OrganizationID      (optional) betty.Organization scope
 *   - InstanceID          (optional) betty.Instance scope
 *   - ConversationHistory (optional) JSON string of [{role, content}, ...]
 *
 * Outputs:
 *   - ResolvedPromptID         the AIPrompt.ID resolved from PromptName
 *   - AssembledSystemText      System-role components concatenated by Sort (\n\n separators)
 *   - AssembledMessages        JSON string of full ChatMessage[] (history + components in Sort order)
 *   - SelectedComponentCount   number of distinct (Name) components selected after cascade
 *
 * Thin wrapper — all real work is in BLAPromptAssembler.
 */
@RegisterClass(BaseAction, '__BLA_AssemblePrompt')
export class BLAAssemblePromptAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const promptName = this.getStringParam(params, 'PromptName');
            if (!promptName) {
                return { Success: false, ResultCode: 'MISSING_PROMPT_NAME', Message: "Required parameter 'PromptName' was not provided." };
            }

            const organizationID = this.getOptionalUuidParam(params, 'OrganizationID');
            const instanceID = this.getOptionalUuidParam(params, 'InstanceID');
            const conversationHistory = this.parseConversationHistory(params);

            const resolvedPromptID = await this.resolvePromptID(promptName, params);
            if (!resolvedPromptID) {
                return { Success: false, ResultCode: 'PROMPT_NOT_FOUND', Message: `No active __mj.AIPrompt row found with Name='${promptName}'.` };
            }

            const assembler = new BLAPromptAssembler();
            const result = await assembler.Assemble(
                {
                    PromptID: resolvedPromptID,
                    OrganizationID: organizationID,
                    InstanceID: instanceID,
                    ConversationHistory: conversationHistory,
                },
                params.ContextUser,
            );

            this.addOutputParam(params, 'ResolvedPromptID', resolvedPromptID);
            this.addOutputParam(params, 'AssembledSystemText', result.AssembledSystemText);
            this.addOutputParam(params, 'AssembledMessages', JSON.stringify(result.AssembledMessages));
            this.addOutputParam(params, 'SelectedComponentCount', result.SelectedComponentCount);

            LogStatus(`[BLA_AssemblePrompt] PromptName='${promptName}' -> ${result.SelectedComponentCount} component(s), ${result.AssembledMessages.length} total ChatMessage(s)`);

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: JSON.stringify({
                    ResolvedPromptID: resolvedPromptID,
                    SelectedComponentCount: result.SelectedComponentCount,
                    TotalMessageCount: result.AssembledMessages.length,
                }),
            };
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            LogError(`[BLA_AssemblePrompt] Unexpected failure: ${msg}`);
            return { Success: false, ResultCode: 'UNEXPECTED_ERROR', Message: msg };
        }
    }

    /** Resolve an active AIPrompt row's ID by exact Name match. Returns null if not found. */
    private async resolvePromptID(promptName: string, params: RunActionParams): Promise<string | null> {
        const rv = new RunView();
        const escaped = promptName.replace(/'/g, "''");
        const result = await rv.RunView<MJAIPromptEntity>({
            EntityName: 'MJ: AI Prompts',
            ExtraFilter: `Name='${escaped}' AND Status='Active'`,
            MaxRows: 1,
            ResultType: 'simple',
        }, params.ContextUser);

        if (!result.Success) {
            LogError(`[BLA_AssemblePrompt] resolvePromptID RunView failed: ${result.ErrorMessage}`);
            return null;
        }
        const rows = result.Results ?? [];
        return rows.length > 0 ? (rows[0] as { ID: string }).ID : null;
    }

    private parseConversationHistory(params: RunActionParams): BLAChatMessage[] {
        const raw = this.getStringParam(params, 'ConversationHistory');
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? (parsed as BLAChatMessage[]) : [];
        } catch (e) {
            LogError(`[BLA_AssemblePrompt] ConversationHistory was not valid JSON; treating as empty: ${e instanceof Error ? e.message : String(e)}`);
            return [];
        }
    }

    private getStringParam(params: RunActionParams, name: string): string | undefined {
        const found = params.Params.find(p => p.Name.trim().toLowerCase() === name.toLowerCase());
        if (!found || found.Value === undefined || found.Value === null) return undefined;
        const value = String(found.Value).trim();
        return value.length > 0 ? value : undefined;
    }

    /** Like getStringParam but additionally returns null (not undefined) when not provided — matches DB nullable column semantics. */
    private getOptionalUuidParam(params: RunActionParams, name: string): string | null {
        const value = this.getStringParam(params, name);
        return value ?? null;
    }

    private addOutputParam(params: RunActionParams, name: string, value: unknown): void {
        const existing = params.Params.find(p => p.Name === name);
        if (existing) {
            existing.Value = value;
            existing.Type = 'Output';
            return;
        }
        params.Params.push({ Name: name, Type: 'Output', Value: value } as ActionParam);
    }
}

// Reference Metadata so the bundler keeps the import — used in the future
// if we move PromptID lookup off RunView. No-op at runtime.
void Metadata;
