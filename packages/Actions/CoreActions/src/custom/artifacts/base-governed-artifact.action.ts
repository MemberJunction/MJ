import { ActionParam, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { IMetadataProvider, Metadata } from '@memberjunction/core';
import { CleanAndParseJSON } from '@memberjunction/global';
import type { ArtifactMutationOperation } from '@memberjunction/ai-agents';

/**
 * Shared parameter-extraction and attribution helpers for the 4 Governed Artifact CoreActions.
 * All business logic lives in `GovernedArtifactService` (`@memberjunction/ai-agents`); each action
 * stays thin, validates inputs/outputs, and preserves MJ's metadata & permission boundaries.
 */
export abstract class BaseGovernedArtifactAction extends BaseAction {
    protected resolveProvider(params: RunActionParams): IMetadataProvider {
        const provider = (params as { Provider?: IMetadataProvider }).Provider;
        return provider ?? Metadata.Provider;
    }

    protected extractAgentAttribution(params: RunActionParams): { agentRunId?: string; agentName?: string } {
        // Attribution must come exclusively from trusted server-stamped params.Context
        // (never from user/LLM-supplied Action Params, which could spoof agent presence or cross-run tracking).
        const ctx = (params.Context ?? undefined) as Record<string, unknown> | undefined;
        const rawRunId = ctx && typeof ctx.AgentRunID === 'string' && ctx.AgentRunID.trim()
            ? ctx.AgentRunID.trim()
            : undefined;
        const rawAgentName = ctx && typeof ctx.AgentName === 'string' && ctx.AgentName.trim()
            ? ctx.AgentName.trim()
            : undefined;
        return {
            agentRunId: rawRunId,
            agentName: rawAgentName,
        };
    }

    protected getParamValue(params: RunActionParams, name: string): unknown {
        const param = params.Params?.find((p) => p.Name?.trim().toLowerCase() === name.toLowerCase());
        return param?.Value;
    }

    protected getStringParam(params: RunActionParams, name: string): string | undefined {
        const value = this.getParamValue(params, name);
        if (value === undefined || value === null) return undefined;
        const str = String(value).trim();
        return str.length > 0 ? str : undefined;
    }

    protected getNumericParam(params: RunActionParams, name: string): number | undefined {
        const value = this.getParamValue(params, name);
        if (value === undefined || value === null) return undefined;
        const num = Number(value);
        return Number.isFinite(num) ? num : undefined;
    }

    protected getObjectParam(params: RunActionParams, name: string): Record<string, unknown> | undefined {
        const value = this.getParamValue(params, name);
        if (value === undefined || value === null) return undefined;
        if (typeof value === 'object' && !Array.isArray(value)) {
            return value as Record<string, unknown>;
        }
        if (typeof value === 'string' && value.trim()) {
            const parsed = CleanAndParseJSON<unknown>(value);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed as Record<string, unknown>;
            }
        }
        return undefined;
    }

    protected getStringArrayParam(params: RunActionParams, name: string): string[] | undefined {
        const value = this.getParamValue(params, name);
        if (Array.isArray(value)) {
            const items = value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map(v => v.trim());
            return items.length > 0 ? items : undefined;
        }
        if (typeof value === 'string' && value.trim()) {
            const parsed = CleanAndParseJSON<unknown>(value);
            if (Array.isArray(parsed)) {
                const items = parsed.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map(v => v.trim());
                return items.length > 0 ? items : undefined;
            }
            const split = value.split(',').map(v => v.trim()).filter(Boolean);
            return split.length > 0 ? split : undefined;
        }
        return undefined;
    }

    protected getOperationsParam(params: RunActionParams, name: string): ArtifactMutationOperation[] | undefined {
        let value = this.getParamValue(params, name);
        if (typeof value === 'string' && value.trim()) {
            value = CleanAndParseJSON<unknown>(value);
        }
        if (!Array.isArray(value)) return undefined;
        const ops: ArtifactMutationOperation[] = [];
        for (const item of value) {
            if (!item || typeof item !== 'object') continue;
            const rec = item as Record<string, unknown>;
            if (typeof rec.tool === 'string' && rec.tool.trim()) {
                ops.push({
                    tool: rec.tool.trim(),
                    input: rec.input && typeof rec.input === 'object' && !Array.isArray(rec.input)
                        ? (rec.input as Record<string, unknown>)
                        : undefined,
                });
            }
        }
        return ops.length > 0 ? ops : undefined;
    }

    protected setOutputParam(params: RunActionParams, name: string, value: unknown): void {
        const existing = params.Params?.find((p) => p.Name?.trim().toLowerCase() === name.toLowerCase());
        if (existing) {
            existing.Value = value;
            existing.Type = existing.Type === 'Input' ? 'Both' : existing.Type || 'Output';
        } else {
            if (!params.Params) {
                params.Params = [];
            }
            const output = new ActionParam();
            output.Name = name;
            output.Value = value;
            output.Type = 'Output';
            params.Params.push(output);
        }
    }
}
