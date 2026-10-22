import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';

vi.mock('type-graphql', () => {
    const noopDecorator = () => () => undefined;
    return {
        Resolver: noopDecorator,
        Mutation: noopDecorator,
        Query: noopDecorator,
        Subscription: noopDecorator,
        ObjectType: noopDecorator,
        InputType: noopDecorator,
        Field: noopDecorator,
        Arg: noopDecorator,
        Args: noopDecorator,
        Ctx: noopDecorator,
        PubSub: noopDecorator,
        Root: noopDecorator,
        Float: class {},
        Int: class {},
        ID: class {},
    };
});

import { PipelineProgressFilter, type PipelineProgressNotification } from '../resolvers/PipelineProgressResolver';

const RUN_ID = 'AA11BB22-0000-4000-8000-000000000001';
const OTHER_RUN_ID = 'CC33DD44-0000-4000-8000-000000000002';

function makePayload(pipelineRunID: string): PipelineProgressNotification {
    return {
        PipelineRunID: pipelineRunID,
        Stage: 'extract',
        TotalItems: 100,
        ProcessedItems: 25,
        ElapsedMs: 500,
        PercentComplete: 25,
    };
}

describe('PipelineProgressFilter', () => {
    it('delivers when PipelineRunID matches exactly', () => {
        expect(PipelineProgressFilter({ payload: makePayload(RUN_ID), args: { pipelineRunID: RUN_ID } })).toBe(true);
    });

    it('delivers when PipelineRunID differs only in UUID casing (SQL Server uppercase vs client lowercase)', () => {
        expect(
            PipelineProgressFilter({
                payload: makePayload(RUN_ID.toUpperCase()),
                args: { pipelineRunID: RUN_ID.toLowerCase() },
            })
        ).toBe(true);
    });

    it('rejects notifications for a different pipeline run', () => {
        expect(PipelineProgressFilter({ payload: makePayload(OTHER_RUN_ID), args: { pipelineRunID: RUN_ID } })).toBe(false);
    });
});
