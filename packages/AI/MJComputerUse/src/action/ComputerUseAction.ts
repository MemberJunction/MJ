/**
 * MJ Action wrapper for the Computer Use engine.
 *
 * Exposes Computer Use as a standard MJ Action that can be invoked
 * by any MJ agent, workflow, or external caller. Maps flat ActionParam[]
 * to MJRunComputerUseParams, delegates to MJComputerUseEngine.Run(),
 * and maps the result back to ActionResultSimple with output params.
 *
 * Input params (all string-typed scalars):
 * - Goal (required): Natural-language goal
 * - StartUrl (optional): Starting URL
 * - Headless (optional): "true"/"false" (default: "true")
 * - MaxSteps (optional): Number string (default: "30")
 * - AllowedDomains (optional): Comma-delimited domain list
 * - BlockedDomains (optional): Comma-delimited domain list
 * - ControllerPromptName (optional): MJ AI Prompt entity name for controller (resolved by engine, routed through AIPromptRunner)
 * - JudgePromptName (optional): MJ AI Prompt entity name for judge (resolved by engine, routed through AIPromptRunner)
 * - JudgeFrequency (optional): "EveryStep", "EveryNSteps:N", or "OnStagnation:N"
 * - AgentRunId (optional): Parent agent run ID for linking prompt runs
 *
 * Output params (added to Params array):
 * - Success: "true"/"false"
 * - Status: ComputerUseStatus string
 * - TotalSteps: Number string
 * - FinalUrl: Final browser URL
 * - FinalScreenshot: Base64 PNG string
 * - Error: Error message if any
 */

import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

import type { ComputerUseResult } from '@memberjunction/computer-use';

import { MJComputerUseEngine } from '../engine/MJComputerUseEngine.js';
import { MJRunComputerUseParams, PromptEntityRef } from '../types/mj-params.js';
import { parseJudgeFrequency } from '../utils/judge-frequency-parser.js';

@RegisterClass(BaseAction, 'Computer Use')
export class ComputerUseAction extends BaseAction {

    protected async InternalRunAction(
        params: RunActionParams
    ): Promise<ActionResultSimple> {
        try {
            const runParams = this.buildRunParams(params);
            const engine = new MJComputerUseEngine();
            const result = await engine.Run(runParams);
            return this.mapToActionResult(result, params);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: `Computer Use action failed: ${message}`,
                Params: params.Params,
            };
        }
    }

    /**
     * Extract flat ActionParam[] into typed MJRunComputerUseParams.
     * All action params are string-typed; we coerce as needed.
     */
    private buildRunParams(params: RunActionParams): MJRunComputerUseParams {
        const runParams = new MJRunComputerUseParams();

        // Required
        runParams.Goal = this.getStringParam(params, 'Goal') ?? '';

        // Optional scalars
        runParams.StartUrl = this.getStringParam(params, 'StartUrl');
        runParams.Headless = this.getBooleanParam(params, 'Headless', true);
        runParams.MaxSteps = this.getNumericParam(params, 'MaxSteps', 30);

        // Comma-delimited lists → arrays
        const allowed = this.getStringParam(params, 'AllowedDomains');
        if (allowed) {
            runParams.AllowedDomains = allowed.split(',').map(d => d.trim()).filter(Boolean);
        }

        const blocked = this.getStringParam(params, 'BlockedDomains');
        if (blocked) {
            runParams.BlockedDomains = blocked.split(',').map(d => d.trim()).filter(Boolean);
        }

        // MJ Prompt entity refs (resolved by MJComputerUseEngine into full entities,
        // then routed through AIPromptRunner for template rendering, model selection,
        // prompt run logging, and token tracking)
        runParams.ControllerPromptRef = this.buildPromptRef(params, 'ControllerPromptName');
        runParams.JudgePromptRef = this.buildPromptRef(params, 'JudgePromptName');

        // Judge frequency (format: "EveryStep", "EveryNSteps:5", "OnStagnation:3")
        const judgeFreqStr = this.getStringParam(params, 'JudgeFrequency');
        if (judgeFreqStr) {
            runParams.JudgeFrequency = parseJudgeFrequency(judgeFreqStr);
        }

        // MJ-specific
        runParams.ContextUser = params.ContextUser;
        runParams.AgentRunId = this.getStringParam(params, 'AgentRunId');

        return runParams;
    }

    /**
     * Map ComputerUseResult to ActionResultSimple with output params.
     */
    private mapToActionResult(
        result: ComputerUseResult,
        params: RunActionParams
    ): ActionResultSimple {
        // Add output params
        this.addOutputParam(params, 'Success', String(result.Success));
        this.addOutputParam(params, 'Status', result.Status);
        this.addOutputParam(params, 'TotalSteps', String(result.TotalSteps));
        this.addOutputParam(params, 'FinalUrl', result.FinalUrl);

        if (result.FinalScreenshot) {
            this.addOutputParam(params, 'FinalScreenshot', result.FinalScreenshot);
        }

        if (result.Error) {
            this.addOutputParam(params, 'Error', result.Error.Message);
        }

        if (result.FinalJudgeVerdict) {
            this.addOutputParam(params, 'JudgeVerdict', JSON.stringify({
                Done: result.FinalJudgeVerdict.Done,
                Confidence: result.FinalJudgeVerdict.Confidence,
                Reason: result.FinalJudgeVerdict.Reason,
            }));
        }

        return {
            Success: result.Success,
            ResultCode: result.Status,
            Message: result.Success
                ? `Goal achieved in ${result.TotalSteps} steps`
                : `Run ended with status: ${result.Status}`,
            Params: params.Params,
        };
    }

    // ─── Prompt Ref Builder ──────────────────────────────────

    /**
     * Build a PromptEntityRef from an action param containing a prompt name.
     * Returns undefined if the param is not provided.
     * The engine resolves the ref to a full AIPromptEntityExtended at run time.
     */
    private buildPromptRef(
        params: RunActionParams,
        paramName: string
    ): PromptEntityRef | undefined {
        const promptName = this.getStringParam(params, paramName);
        if (!promptName) return undefined;

        const ref = new PromptEntityRef();
        ref.PromptName = promptName;
        return ref;
    }

    // ─── Param Extraction Helpers ─────────────────────────────

    private getStringParam(params: RunActionParams, name: string): string | undefined {
        const param = params.Params.find(
            p => p.Name.toLowerCase() === name.toLowerCase()
        );
        return param?.Value != null ? String(param.Value) : undefined;
    }

    private getBooleanParam(params: RunActionParams, name: string, defaultValue: boolean): boolean {
        const str = this.getStringParam(params, name);
        if (str == null) return defaultValue;
        return str.toLowerCase() === 'true';
    }

    private getNumericParam(params: RunActionParams, name: string, defaultValue: number): number {
        const str = this.getStringParam(params, name);
        if (str == null) return defaultValue;
        const num = Number(str);
        return isNaN(num) ? defaultValue : num;
    }

    private addOutputParam(params: RunActionParams, name: string, value: string): void {
        params.Params.push({ Name: name, Value: value, Type: 'Output' });
    }

}
