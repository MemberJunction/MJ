/**
 * @fileoverview Pure validation of a `WorkflowSpec`.
 *
 * Free of database access on purpose, so it runs identically wherever a spec is authored: an MCP
 * tool an external agent calls, an Action an internal agent calls, the canvas, and the server-side
 * persist path. One definition of "valid" means a workflow that passes in the editor cannot be
 * rejected for a different reason at save — the same property `ValidateTaskGraphSpec` gives graphs.
 *
 * Every check reports ALL failures rather than throwing on the first: a producer fixing a malformed
 * workflow should see every problem at once, not discover them one round-trip at a time.
 *
 * @module @memberjunction/ai-core-plus
 */
import { FormatValidationErrors, ValidateTaskGraphSpec } from './task-graph-validator';
import {
    ENTITY_INVOCATION_TYPES,
    IsAfterInvocationType,
    NormalizeInvocationType,
    NormalizeTriggers,
    TriggerKey,
    WORKFLOW_TRIGGER_INVOCATION_TYPES,
    type WorkflowSpec,
    type WorkflowSpecValidationError,
    type WorkflowSpecValidationResult,
} from './workflow-spec';

/**
 * Validates a workflow's structure and its triggers.
 *
 * The graph is delegated to `ValidateTaskGraphSpec` rather than re-checked here. That is the point
 * of `graph` being `TaskGraphSpec` verbatim: a workflow cannot accept a graph the engine would
 * reject, and there is no second opinion about what a valid graph is.
 */
export function ValidateWorkflowSpec(spec: WorkflowSpec): WorkflowSpecValidationResult {
    const errors: WorkflowSpecValidationError[] = [];

    if (!spec?.name?.trim()) {
        errors.push({ Code: 'MissingName', Message: 'A workflow needs a name.' });
    }

    if (!spec?.graph) {
        errors.push({ Code: 'MissingGraph', Message: 'A workflow needs a graph of steps.' });
    } else {
        const graph = ValidateTaskGraphSpec(spec.graph);
        if (!graph.Valid) {
            // Carried across as one error with the graph's own messages inlined, rather than
            // flattened into peers: the caller needs to know the failure is in the graph, and the
            // graph's codes are already machine-readable for anyone who wants to branch on them.
            errors.push({
                Code: 'InvalidGraph',
                Message: `The workflow's steps are not valid:\n${FormatValidationErrors(graph.Errors)}`,
            });
        }
    }

    const triggers = spec?.graph ? NormalizeTriggers(spec) : (spec?.triggers ?? []);
    const seen = new Set<string>();

    triggers.forEach((trigger, index) => {
        switch (trigger.type) {
            case 'EntityEvent':
                if (!trigger.entityName?.trim()) {
                    errors.push({
                        Code: 'MissingEntityName',
                        Message: 'An entity-change trigger needs an entity to watch.',
                        TriggerIndex: index,
                    });
                }
                if (!trigger.invocationType?.trim()) {
                    errors.push({
                        Code: 'MissingInvocationType',
                        Message: 'An entity-change trigger needs to say which change fires it (Create, Update, or Delete).',
                        TriggerIndex: index,
                    });
                } else {
                    const resolved = NormalizeInvocationType(trigger.invocationType);
                    if (!resolved) {
                        // Caught here rather than at save: a trigger bound to a nonexistent invocation
                        // type persists happily and then never fires, which is undebuggable from the UI.
                        errors.push({
                            Code: 'UnknownInvocationType',
                            Message:
                                `"${trigger.invocationType}" is not a change this platform fires. Use Create, Update or Delete — ` +
                                `or name one exactly: ${ENTITY_INVOCATION_TYPES.join(', ')}.`,
                            TriggerIndex: index,
                        });
                    } else if (!IsAfterInvocationType(resolved)) {
                        // Refused, not merely discouraged. `Validate` and `Before*` run inside the save
                        // — synchronously, in the held transaction, able to abort it — so a workflow
                        // bound there puts an unbounded agent run in the middle of a user's save.
                        errors.push({
                            Code: 'UnsupportedInvocationType',
                            Message:
                                `A workflow cannot run during "${resolved}" — that runs inside the save itself and would ` +
                                `hold it open. Use one of: ${WORKFLOW_TRIGGER_INVOCATION_TYPES.join(', ')}.`,
                            TriggerIndex: index,
                        });
                    }
                }
                if (trigger.filter?.trim()) {
                    // Rejected rather than saved-and-ignored. Narrowing by predicate needs the
                    // before/after values of the change, a contract that does not exist yet;
                    // accepting the field would give the author a workflow firing on every save while
                    // they believed it was narrowed. Accepting it later is additive — the reverse
                    // would break specs already published against it.
                    errors.push({
                        Code: 'UnsupportedFilter',
                        Message:
                            'Narrowing an entity-change trigger by predicate is not supported yet, and a filter would be ' +
                            'silently ignored. Remove it, or narrow with scopeEntityName/scopeRecordID.',
                        TriggerIndex: index,
                    });
                }
                if (trigger.scopeRecordID && !trigger.scopeEntityName) {
                    // A record ID without its entity is unresolvable — IDs are only unique within an
                    // entity — so this would silently watch nothing rather than fail loudly later.
                    errors.push({
                        Code: 'ScopeWithoutEntity',
                        Message: 'Watching a single record also needs the entity that record belongs to.',
                        TriggerIndex: index,
                    });
                }
                break;

            case 'Schedule':
                if (!trigger.cron?.trim()) {
                    errors.push({
                        Code: 'MissingCron',
                        Message: 'A scheduled trigger needs a schedule.',
                        TriggerIndex: index,
                    });
                }
                break;

            case 'OnDemand':
                break;

            default:
                // The union is closed on purpose (Publish-No-Break): a caller inventing a trigger
                // kind must fail here rather than persist something no substrate will ever fire.
                errors.push({
                    Code: 'UnknownTriggerType',
                    Message: `Unrecognized trigger type "${(trigger as { type?: string })?.type}".`,
                    TriggerIndex: index,
                });
                break;
        }

        const key = TriggerKey(trigger as Parameters<typeof TriggerKey>[0]);
        if (seen.has(key)) {
            // Two identical triggers would reconcile to one owned row anyway, so the second is not
            // merely redundant — it is a silent no-op the author would never see.
            errors.push({
                Code: 'DuplicateTrigger',
                Message: 'This workflow already has an identical trigger.',
                TriggerIndex: index,
            });
        }
        seen.add(key);
    });

    return { Valid: errors.length === 0, Errors: errors };
}

/** Renders validation failures one per line, each tagged with its machine-readable code. */
export function FormatWorkflowValidationErrors(errors: readonly WorkflowSpecValidationError[]): string {
    return errors
        .map((e) => `[${e.Code}]${e.TriggerIndex !== undefined ? ` (trigger ${e.TriggerIndex + 1})` : ''} ${e.Message}`)
        .join('\n');
}
