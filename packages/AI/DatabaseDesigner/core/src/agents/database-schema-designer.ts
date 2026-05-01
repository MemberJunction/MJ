/**
 * @module database-schema-designer
 * @description Loop sub-agent that translates functional requirements into a
 * concrete TableDefinition via LLM-driven conversation.
 *
 * The agent extends BaseAgent and overrides `validateSuccessNextStep` to
 * enforce that the LLM actually produced a valid TableDefinition JSON before
 * the run is allowed to declare success.  This is a safety net on top of the
 * FinalPayloadValidationMode: "Retry" setting in the agent metadata.
 *
 * Modification mode: when `SchemaDesign.ModificationType === 'alter'` is
 * present the agent shows a before/after diff of proposed column changes and
 * waits for user approval before emitting the updated TableDefinition.
 */

import { BaseAgent } from '@memberjunction/ai-agents';
import type {
    ExecuteAgentParams,
    BaseAgentNextStep,
} from '@memberjunction/ai-core-plus';
import type {
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import { RegisterClass } from '@memberjunction/global';

import type { DatabaseDesignerPayload, SchemaDesignEntry } from '../interfaces.js';
import type { TableDefinition } from '@memberjunction/schema-engine';

// ─── Driver registration ─────────────────────────────────────────────────────

@RegisterClass(BaseAgent, 'DatabaseDesignerSchemaDesigner')
export class DatabaseDesignerSchemaDesigner extends BaseAgent {

    /**
     * Post-LLM validation hook.  Called by the Loop agent framework after the
     * model outputs a 'Success' next-step.
     *
     * Verifies that `SchemaDesign.TableDefinition` has been fully populated
     * before allowing the success to propagate.  If the LLM skipped or
     * partially filled the field, we issue a `Retry` with specific guidance.
     */
    protected override async validateSuccessNextStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        // Base class runs MinExecutionsPerRun and FinalPayloadValidation checks
        const baseResult = await super.validateSuccessNextStep(
            params, nextStep, currentPayload, agentRun, currentStep
        );
        if (baseResult.step === 'Retry') {
            return baseResult;
        }

        const payload = currentPayload as DatabaseDesignerPayload;
        const tables = payload.SchemaDesign?.Tables;

        const errors = this.collectTablesErrors(tables);
        if (errors.length > 0) {
            return {
                ...nextStep,
                step: 'Retry',
                retryInstructions: this.buildRetryMessage(errors),
            };
        }

        return nextStep;
    }

    // ─── Validation helpers ───────────────────────────────────────────────

    /**
     * Collect all structural problems with SchemaDesign.Tables[].
     * Returns an empty array when all definitions are complete and valid.
     */
    private collectTablesErrors(tables: SchemaDesignEntry[] | undefined): string[] {
        const errors: string[] = [];

        if (!tables?.length) {
            errors.push('SchemaDesign.Tables[] is missing or empty.');
            return errors;
        }

        for (let i = 0; i < tables.length; i++) {
            const entry = tables[i];
            const prefix = tables.length === 1
                ? ''
                : `Tables[${i}] (${entry.TableDefinition?.EntityName ?? 'unknown'}): `;
            const entryErrors = this.collectTableDefinitionErrors(entry.TableDefinition);
            errors.push(...entryErrors.map(e => `${prefix}${e}`));
        }

        return errors;
    }

    /**
     * Collect all structural problems with a single TableDefinition.
     * Returns an empty array when the definition is complete and valid.
     */
    private collectTableDefinitionErrors(
        tableDefinition: TableDefinition | undefined
    ): string[] {
        const errors: string[] = [];

        if (!tableDefinition) {
            errors.push('TableDefinition is missing entirely.');
            return errors; // no point checking sub-fields
        }

        if (!tableDefinition.SchemaName?.trim()) {
            errors.push('TableDefinition.SchemaName is empty or missing.');
        }
        if (!tableDefinition.TableName?.trim()) {
            errors.push('TableDefinition.TableName is empty or missing.');
        }
        if (!tableDefinition.EntityName?.trim()) {
            errors.push('TableDefinition.EntityName is empty or missing.');
        }
        if (!Array.isArray(tableDefinition.Columns) || tableDefinition.Columns.length === 0) {
            errors.push('TableDefinition.Columns must contain at least one column.');
        }

        return errors;
    }

    /** Format a retry message that guides the LLM to fix the specific gaps. */
    private buildRetryMessage(errors: string[]): string {
        return [
            '## Schema Designer: Output Incomplete',
            '',
            'Your response was almost correct, but the following issues prevent success:',
            '',
            ...errors.map((e, i) => `${i + 1}. ${e}`),
            '',
            'Please revise your response to populate SchemaDesign.Tables[] with one entry per table.',
            'Each entry must contain a complete `TableDefinition` with:',
            '- `SchemaName` (e.g. "__mj_UDT")',
            '- `TableName` (PascalCase, no spaces)',
            '- `EntityName` (human-readable name as it will appear in MemberJunction)',
            '- `Columns` (at least one column; do NOT include ID, __mj_CreatedAt, or __mj_UpdatedAt)',
        ].join('\n');
    }
}
