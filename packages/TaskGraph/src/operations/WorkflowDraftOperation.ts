/**
 * @fileoverview `Workflow.Draft` — turn a description into a workflow's steps.
 *
 * **Why this exists.** The Create Workflow front door offers three doors, and the middle one says
 * *"Say what you want done. We draft the steps; you refine them on the canvas."* Without this
 * operation that sentence is a promise the product does not keep — the author types a brief and
 * lands on an empty canvas, which is worse than not offering the door at all.
 *
 * **It persists nothing.** The draft goes back to the caller and onto the canvas; `Workflow.Save` is
 * what commits. That split is what makes the tile's other promise — *"Nothing is saved until you
 * approve it"* — true rather than merely stated, and it is the same draft-then-confirm shape dry-run
 * and Plan Mode already established.
 *
 * **A Remote Operation, per the program's standing rule**, so drafting is reachable from MCP, an
 * Action wrapper and the editor by the same typed call — not a mutation only the Explorer client can
 * make.
 *
 * @module @memberjunction/task-graph
 */
import { RegisterClass } from '@memberjunction/global';
import { BaseRemotableOperation, IMetadataProvider, LogError, RunView, UserInfo } from '@memberjunction/core';
import {
    WorkflowDraftOperation,
    type WorkflowDraftInput,
    type WorkflowDraftOutput,
} from '@memberjunction/core-entities';
import {
    AIPromptParams,
    FormatValidationErrors,
    ValidateTaskGraphSpec,
    type TaskGraphSpec,
} from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptRunner } from '@memberjunction/ai-prompts';

/** The seeded prompt that does the drafting. */
export const WORKFLOW_DRAFTING_PROMPT = 'Workflow Drafting';

/**
 * How many agent names the prompt is told about.
 *
 * Bounded because the list goes into a prompt: an instance with hundreds of agents would spend most
 * of its context enumerating them, and a model choosing between 300 names chooses worse than one
 * choosing between 40. Top-level agents come first — those are the ones a workflow step can actually
 * be assigned to.
 */
export const MAX_AGENTS_OFFERED = 40;

/** `Workflow.Draft` — draft a workflow's steps from a description. Persists nothing. */
@RegisterClass(BaseRemotableOperation, 'Workflow.Draft')
export class WorkflowDraftServerOperation extends WorkflowDraftOperation {
    protected async InternalExecute(
        input: WorkflowDraftInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<WorkflowDraftOutput> {
        const description = input?.description?.trim();
        const workflowName = input?.workflowName?.trim();
        if (!description) return { success: false, errorMessage: 'A description is required to draft a workflow.' };
        if (!workflowName) return { success: false, errorMessage: 'A workflow name is required.' };

        try {
            await AIEngine.Instance.Config(false, user, provider);
            const prompt = AIEngine.Instance.Prompts.find((p) => p.Name === WORKFLOW_DRAFTING_PROMPT);
            if (!prompt) {
                return {
                    success: false,
                    errorMessage: `The '${WORKFLOW_DRAFTING_PROMPT}' prompt is not present — has the metadata seed been pushed?`,
                };
            }

            const agentNames = await this.resolveAssignableAgents(provider, user);
            if (agentNames.length === 0) {
                // Stated rather than drafted around: every step needs an assignment, so a draft
                // produced with no agents to assign would be invalid the moment it was validated.
                return {
                    success: false,
                    errorMessage: 'No agents are available to run workflow steps on this instance, so there is nothing to draft with.',
                };
            }

            const params = new AIPromptParams();
            params.prompt = prompt;
            params.contextUser = user;
            params.data = {
                description,
                workflowName,
                availableAgents: agentNames.join('\n'),
            };

            const result = await new AIPromptRunner().ExecutePrompt<TaskGraphSpec>(params);
            if (!result.success || !result.result) {
                return { success: false, errorMessage: result.errorMessage ?? 'The workflow could not be drafted.' };
            }

            return this.acceptDraft(result.result, workflowName);
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            LogError(`[Workflow.Draft] Drafting failed for "${workflowName}": ${message}`);
            return { success: false, errorMessage: message };
        }
    }

    /**
     * Checks the model's output against the SAME validator the canvas and `Workflow.Save` run.
     *
     * A draft that comes back must be savable. Returning something that only fails later — on the
     * canvas, or worse at save time — would put the author in the position of debugging a graph they
     * did not write, which is precisely the work this operation was meant to save them.
     */
    protected acceptDraft(draft: TaskGraphSpec, workflowName: string): WorkflowDraftOutput {
        // The name is the author's, not the model's: they typed it on the front door, and a model
        // quietly renaming their workflow is a small betrayal of a field they filled in themselves.
        const graph: TaskGraphSpec = { ...draft, workflowName };

        const validation = ValidateTaskGraphSpec(graph);
        if (!validation.Valid) {
            return {
                success: false,
                errorMessage: `The drafted workflow was not usable:\n${FormatValidationErrors(validation.Errors)}`,
            };
        }
        return { success: true, graph };
    }

    /**
     * Agent names a step may be assigned to.
     *
     * Top-level agents only. A sub-agent exists to be called by its parent, so offering one as a
     * workflow step would produce a draft that looks fine and assigns work to something that was
     * never meant to be entered directly.
     */
    protected async resolveAssignableAgents(provider: IMetadataProvider, user: UserInfo): Promise<string[]> {
        const result = await RunView.FromMetadataProvider(provider).RunView<{ Name: string }>(
            {
                EntityName: 'MJ: AI Agents',
                ExtraFilter: `Status='Active' AND ParentID IS NULL`,
                Fields: ['Name'],
                OrderBy: 'Name ASC',
                MaxRows: MAX_AGENTS_OFFERED,
                ResultType: 'simple',
            },
            user,
        );
        if (!result.Success) {
            throw new Error(result.ErrorMessage ?? 'The list of available agents could not be read.');
        }
        return (result.Results ?? []).map((a) => a.Name).filter((n) => !!n);
    }
}

/** Keeps the registration from being tree-shaken out of a bundled host. */
export function LoadWorkflowDraftOperation(): void {
    // Referencing the class is what the bundler needs.
    void WorkflowDraftServerOperation;
}
