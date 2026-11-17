import { RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { IMetadataProvider, Metadata } from '@memberjunction/core';
import type { ArtifactJsonValue, ArtifactToolArgs } from '@memberjunction/ai-core-plus';
import type { ArtifactMutationOperation } from '@memberjunction/ai-agents';

export type GovernedActionParamValue = ArtifactJsonValue | object | undefined;

interface ActionContextWithAttribution {
    AgentRunID?: string;
    AgentName?: string;
}

interface ParamsWithProvider {
    Provider?: IMetadataProvider;
}

interface RawOperationItem {
    tool?: ArtifactJsonValue;
    input?: ArtifactJsonValue;
}

/**
 * Shared parameter-extraction and attribution helpers for the 4 Governed Artifact CoreActions.
 * All business logic lives in `GovernedArtifactService` (`@memberjunction/ai-agents`); each action
 * stays thin, validates inputs/outputs, and preserves MJ's metadata & permission boundaries.
 */
export abstract class BaseGovernedArtifactAction extends BaseAction {
    protected resolveProvider(params: RunActionParams): IMetadataProvider {
        const provider = (params as ParamsWithProvider).Provider;
        return provider ?? Metadata.Provider;
    }

    protected extractAgentAttribution(params: RunActionParams): { agentRunId?: string; agentName?: string } {
        // Attribution must come exclusively from trusted server-stamped params.Context
        // (never from user/LLM-supplied Action Params, which could spoof agent presence or cross-run tracking).
        const rawContext: GovernedActionParamValue = params.Context;
        const ctx =
            rawContext && typeof rawContext === 'object' && !Array.isArray(rawContext)
                ? (rawContext as ActionContextWithAttribution)
                : undefined;
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

    protected getParamValue(params: RunActionParams, name: string): GovernedActionParamValue {
        const param = params.Params?.find((p) => p.Name?.trim().toLowerCase() === name.toLowerCase());
        return param?.Value as GovernedActionParamValue;
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

    protected getObjectParam(params: RunActionParams, name: string): ArtifactToolArgs | undefined {
        const value = this.getParamValue(params, name);
        if (value === undefined || value === null) return undefined;
        if (typeof value === 'object' && !Array.isArray(value)) {
            return value as ArtifactToolArgs;
        }
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                try {
                    const parsed = JSON.parse(trimmed) as ArtifactJsonValue;
                    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                        return parsed as ArtifactToolArgs;
                    }
                } catch {
                    return undefined;
                }
            }
        }
        return undefined;
    }

    protected getStringArrayParam(params: RunActionParams, name: string): string[] | undefined {
        const value = this.getParamValue(params, name);
        if (Array.isArray(value)) {
            const items = value
                .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
                .map((v) => v.trim());
            return items.length > 0 ? items : undefined;
        }
        if (typeof value === 'string' && value.trim()) {
            const trimmed = value.trim();
            if (trimmed.startsWith('[')) {
                try {
                    const parsed = JSON.parse(trimmed) as ArtifactJsonValue;
                    if (Array.isArray(parsed)) {
                        const items = parsed
                            .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
                            .map((v) => v.trim());
                        return items.length > 0 ? items : undefined;
                    }
                } catch {
                    // Fall through to comma-separated parsing
                }
            }
            const split = value.split(',').map((v) => v.trim()).filter(Boolean);
            return split.length > 0 ? split : undefined;
        }
        return undefined;
    }

    protected parseOperationsParam(
        params: RunActionParams,
        name: string,
    ): { operations?: ArtifactMutationOperation[]; errorMessage?: string } {
        let value = this.getParamValue(params, name);
        if (value === undefined || value === null) {
            return {};
        }
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (!trimmed) {
                return {};
            }
            try {
                value = JSON.parse(trimmed) as ArtifactJsonValue;
            } catch (err) {
                return {
                    errorMessage: `Parameter '${name}' is not valid JSON (${err instanceof Error ? err.message : String(err)}). Expected an array like [{ "tool": "write_cells", "input": { ... } }].`,
                };
            }
        }
        if (!Array.isArray(value)) {
            return {
                errorMessage: `Parameter '${name}' must be an array of { tool: string, input?: object } items.`,
            };
        }
        const ops: ArtifactMutationOperation[] = [];
        for (let idx = 0; idx < value.length; idx++) {
            const item = value[idx];
            if (!item || typeof item !== 'object' || Array.isArray(item)) {
                return {
                    errorMessage: `${name}[${idx}] must be an object with required string field 'tool', e.g. { "tool": "write_cells", "input": { ... } }.`,
                };
            }
            const rec = item as RawOperationItem;
            if (typeof rec.tool !== 'string' || !rec.tool.trim()) {
                return {
                    errorMessage: `${name}[${idx}] is missing required string field 'tool', e.g. { "tool": "write_cells", "input": { ... } }.`,
                };
            }
            let parsedInput: ArtifactToolArgs | undefined;
            if (rec.input !== undefined && rec.input !== null) {
                if (typeof rec.input === 'string') {
                    const trimmedInput = rec.input.trim();
                    if (trimmedInput) {
                        try {
                            const parsed = JSON.parse(trimmedInput) as ArtifactJsonValue;
                            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                                return {
                                    errorMessage: `${name}[${idx}].input must decode to a JSON object matching the '${rec.tool.trim()}' tool schema.`,
                                };
                            }
                            parsedInput = parsed as ArtifactToolArgs;
                        } catch (err) {
                            return {
                                errorMessage: `${name}[${idx}].input is invalid JSON (${err instanceof Error ? err.message : String(err)}).`,
                            };
                        }
                    }
                } else if (typeof rec.input === 'object' && !Array.isArray(rec.input)) {
                    parsedInput = rec.input as ArtifactToolArgs;
                } else {
                    return {
                        errorMessage: `${name}[${idx}].input must be an object matching the '${rec.tool.trim()}' tool schema.`,
                    };
                }
            }
            ops.push({
                tool: rec.tool.trim(),
                input: parsedInput,
            });
        }
        return { operations: ops };
    }

    protected getOperationsParam(params: RunActionParams, name: string): ArtifactMutationOperation[] | undefined {
        const parsed = this.parseOperationsParam(params, name);
        return parsed.operations && parsed.operations.length > 0 ? parsed.operations : undefined;
    }

    protected setOutputParam(params: RunActionParams, name: string, value: GovernedActionParamValue): void {
        const existing = params.Params?.find((p) => p.Name?.trim().toLowerCase() === name.toLowerCase());
        if (existing) {
            existing.Value = value;
            const existingType = existing.Type?.trim().toLowerCase();
            existing.Type = existingType === 'input' || existingType === 'both' ? 'Both' : 'Output';
        } else {
            if (!params.Params) {
                params.Params = [];
            }
            // Plain object literal is required so GraphQL ActionResolver -> CopyScalarsAndArrays
            // (which skips class instances with constructor !== Object) serializes output params.
            params.Params.push({
                Name: name,
                Value: value,
                Type: 'Output',
            });
        }
    }
}
