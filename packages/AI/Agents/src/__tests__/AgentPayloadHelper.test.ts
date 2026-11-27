/**
 * Dedicated interface-level unit tests for Slice s2 (`BaseAgentPayloadHelper` / `AgentPayloadHelper`).
 * Exercises media placeholder interception/resolution, starting & final payload validation,
 * held completion drafts, and `LastStepPayload` directly against a mock `AgentRunContext`.
 */
import { describe, expect, it, vi } from 'vitest';
import type { ActionParam, MJActionEntityExtended } from '@memberjunction/actions-base';
import type {
    BaseAgentNextStep,
    ExecuteAgentParams,
    MJAIAgentEntityExtended,
    MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { UserInfo } from '@memberjunction/core';
import { ResolveAgentHelper } from '../helpers/AgentHelperResolver';
import { AgentPayloadHelper } from '../helpers/payload/AgentPayloadHelper';
import { BaseAgentPayloadHelper } from '../helpers/payload/BaseAgentPayloadHelper';
import { CreateMockAgentRunContext } from './helpers/mock-agent-run-context';

describe('Slice s2 — BaseAgentPayloadHelper & AgentPayloadHelper', () => {
    const helper = new AgentPayloadHelper();

    it('resolves AgentPayloadHelper via ClassFactory for BaseAgentPayloadHelper', () => {
        const resolved = ResolveAgentHelper({
            SeamKey: 'payload',
            BaseClass: BaseAgentPayloadHelper,
            DefaultClass: AgentPayloadHelper,
        });
        expect(resolved).toBeInstanceOf(AgentPayloadHelper);
    });

    it('intercepts large binary/media outputs into placeholders and resolves them recursively in payloads', () => {
        const ctx = CreateMockAgentRunContext();
        const largeBase64 = 'A'.repeat(AgentPayloadHelper.LARGE_BINARY_THRESHOLD + 50);
        const actionEntity = {
            Params: { Items: [{ Name: 'Images', ValueType: 'MediaOutput' }] },
        } as unknown as MJActionEntityExtended;

        const params: ActionParam[] = [
            {
                Name: 'Images',
                Type: 'Output',
                Value: [{ modality: 'Image', mimeType: 'image/png', data: largeBase64 }],
            },
        ];

        const sanitized = helper.InterceptLargeBinaryContent(ctx, params, actionEntity);
        expect(ctx.MediaOutputs).toHaveLength(1);
        const refId = ctx.MediaOutputs[0].refId!;
        expect(JSON.stringify(sanitized[0].Value)).toContain(`\${media:${refId}}`);

        const resolved = helper.ResolveMediaPlaceholdersInPayload(ctx, {
            nested: [`\${media:${refId}}`],
            plain: 42,
        });
        expect(resolved.nested[0]).toBe(`data:image/png;base64,${largeBase64}`);
        expect(resolved.plain).toBe(42);
    });

    it('enforces StartingPayloadValidation in Fail and Warn modes', async () => {
        const ctx = CreateMockAgentRunContext();
        const schema = JSON.stringify({ customerId: 'string' });

        const failResult = await helper.HandleStartingPayloadValidation(ctx, {
            agent: {
                ID: 'a1',
                Name: 'StrictAgent',
                StartingPayloadValidation: schema,
                StartingPayloadValidationMode: 'Fail',
            } as MJAIAgentEntityExtended,
            payload: { wrongField: 123 },
            conversationMessages: [],
            contextUser: { ID: 'u1' } as UserInfo,
        });
        expect(failResult).not.toBeNull();
        expect(failResult?.success).toBe(false);
        expect(ctx.AgentRun?.Status).toBe('Failed');

        const warnResult = await helper.HandleStartingPayloadValidation(ctx, {
            agent: {
                ID: 'a1',
                Name: 'WarnAgent',
                StartingPayloadValidation: schema,
                StartingPayloadValidationMode: 'Warn',
            } as MJAIAgentEntityExtended,
            payload: { wrongField: 123 },
            conversationMessages: [],
            contextUser: { ID: 'u1' } as UserInfo,
        });
        expect(warnResult).toBeNull();
    });

    it('validates final payload schema and handles Retry -> Failed retry cap via ValidateSuccessNextStep', async () => {
        const ctx = CreateMockAgentRunContext();
        ctx.Hooks.HandleFinalPayloadValidationFailure = (p, step, payload, mode, errors, run, curStep) =>
            helper.HandleFinalPayloadValidationFailure(ctx, p, step, payload, mode, errors, run, curStep);

        const params = {
            agent: {
                ID: 'a1',
                Name: 'ReportAgent',
                FinalPayloadValidation: JSON.stringify({ title: 'string' }),
                FinalPayloadValidationMode: 'Retry',
                FinalPayloadValidationMaxRetries: 2,
            } as MJAIAgentEntityExtended,
            conversationMessages: [],
            contextUser: { ID: 'u1' } as UserInfo,
        } as ExecuteAgentParams;
        const stepEntity = { ID: 'step-1' } as MJAIAgentRunStepEntityExtended;
        const successStep: BaseAgentNextStep<{ title?: string }> = { step: 'Success', terminate: true };

        const first = await helper.ValidateSuccessNextStep(ctx, params, successStep, {}, ctx.AgentRun!, stepEntity);
        expect(first.step).toBe('Retry');
        expect(ctx.ValidationRetryCount).toBe(1);

        const second = await helper.ValidateSuccessNextStep(ctx, params, successStep, {}, ctx.AgentRun!, stepEntity);
        expect(second.step).toBe('Failed');
        expect(second.terminate).toBe(true);
    });

    it('holds completion drafts on refused completion and commits them on accepted completion', () => {
        const ctx = CreateMockAgentRunContext();
        const params = {
            agent: { ID: 'a1', Name: 'DraftAgent' } as MJAIAgentEntityExtended,
            conversationMessages: [],
            contextUser: { ID: 'u1' } as UserInfo,
        } as ExecuteAgentParams;

        const completionStep: BaseAgentNextStep<{ summary?: string }> = {
            step: 'Success',
            terminate: true,
            payloadChangeRequest: { newElements: { summary: 'v1' } },
        };

        const draft = helper.BuildCompletionDraft(ctx, params, completionStep, {}, false);
        expect(draft.payload).toEqual({ summary: 'v1' });

        // Refused completion holds the change without committing
        const refused = helper.ResolveTurnPayload(ctx, { step: 'Retry', terminate: false }, {}, draft);
        expect(refused.committedDraft).toBe(false);
        expect(refused.payload).toEqual({});
        helper.UpdateHeldCompletionChanges(ctx, completionStep, false, false);
        expect(ctx.HeldCompletionChanges).toHaveLength(1);

        // Next turn sees held changes applied to working payload
        expect(helper.WithHeldCompletionChanges(ctx, params, {})).toEqual({ summary: 'v1' });

        // Accepted completion commits and clears held list
        const accepted = helper.ResolveTurnPayload(ctx, { step: 'Success', terminate: true }, {}, draft);
        expect(accepted.committedDraft).toBe(true);
        expect(accepted.payload).toEqual({ summary: 'v1' });
        helper.UpdateHeldCompletionChanges(ctx, completionStep, true, false);
        expect(ctx.HeldCompletionChanges).toHaveLength(0);
    });

    it('resolves LastStepPayload across inline and pointer-deduplicated steps', () => {
        const step1Id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
        const step2Id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
        expect(
            AgentPayloadHelper.LastStepPayload([
                { ID: step1Id, StepNumber: 1, PayloadAtEnd: '{"ok":true}', PayloadAtEndSourceStepID: null },
                { ID: step2Id, StepNumber: 2, PayloadAtEnd: null, PayloadAtEndSourceStepID: step1Id },
            ])
        ).toBe('{"ok":true}');
    });

    it('skips payload feedback check when decisions are disabled', async () => {
        const ctx = CreateMockAgentRunContext();
        const createSpy = vi.spyOn(ctx.Hooks, 'CreateStepEntity');
        await helper.CheckPayloadChangesWhenOn(
            ctx,
            { requiresFeedback: true, analysis: undefined },
            { step: 'Retry', terminate: false },
            {} as Parameters<typeof helper.CheckPayloadChangesWhenOn>[3],
            { payloadFeedbackCheck: true },
            { agent: { ID: 'a1', Name: 'A' } as MJAIAgentEntityExtended, conversationMessages: [], contextUser: { ID: 'u1' } as UserInfo }
        );
        expect(createSpy).not.toHaveBeenCalled();
    });
});
