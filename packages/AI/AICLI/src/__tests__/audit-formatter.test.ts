/**
 * Unit tests for AuditFormatter utility class
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MJAIAgentRunEntity } from '@memberjunction/core-entities';

vi.mock('@memberjunction/core-entities', () => ({
    MJAIAgentRunEntity: class {},
}));

import { AuditFormatter } from '../lib/audit-formatter';

describe('AuditFormatter', () => {
    let formatter: AuditFormatter;

    beforeEach(() => {
        formatter = new AuditFormatter();
    });

    describe('FormatRunList', () => {
        it('returns a message when no runs are provided', () => {
            const output = formatter.FormatRunList([], 'json');
            expect(output).toContain('No runs found');
        });

        it('serializes plain objects from ResultType: simple in json format without throwing', () => {
            const plainRun = {
                ID: '11111111-2222-3333-4444-555555555555',
                Agent: 'Customer Insight Specialist',
                Status: 'Completed',
                StartedAt: new Date('2026-04-20T01:00:00.000Z'),
                CompletedAt: new Date('2026-04-20T01:00:05.000Z'),
            } as unknown as MJAIAgentRunEntity;

            const output = formatter.FormatRunList([plainRun], 'json');
            const parsed = JSON.parse(output) as Array<{ ID: string; Agent: string; Status: string }>;

            expect(parsed).toHaveLength(1);
            expect(parsed[0].ID).toBe('11111111-2222-3333-4444-555555555555');
            expect(parsed[0].Agent).toBe('Customer Insight Specialist');
            expect(parsed[0].Status).toBe('Completed');
        });

        it('calls GetAll() when runs are BaseEntity instances in json format', () => {
            const getAll = vi.fn().mockReturnValue({
                ID: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
                Agent: 'Flow Agent',
                Status: 'Success',
            });
            const entityRun = {
                ID: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
                Agent: 'Flow Agent',
                Status: 'Success',
                GetAll: getAll,
            } as unknown as MJAIAgentRunEntity;

            const output = formatter.FormatRunList([entityRun], 'json');
            const parsed = JSON.parse(output) as Array<{ ID: string; Agent: string; Status: string }>;

            expect(getAll).toHaveBeenCalledTimes(1);
            expect(parsed).toEqual([
                {
                    ID: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
                    Agent: 'Flow Agent',
                    Status: 'Success',
                },
            ]);
        });

        it('formats plain objects in compact and table formats', () => {
            const plainRun = {
                ID: '11111111-2222-3333-4444-555555555555',
                Agent: 'Customer Insight Specialist',
                Status: 'Completed',
                StartedAt: new Date('2026-04-20T01:00:00.000Z'),
                CompletedAt: new Date('2026-04-20T01:00:05.000Z'),
            } as unknown as MJAIAgentRunEntity;

            const compactOutput = formatter.FormatRunList([plainRun], 'compact');
            expect(compactOutput).toContain('11111111');
            expect(compactOutput).toContain('Customer Insight Specialist');
            expect(compactOutput).toContain('5.0s');

            const tableOutput = formatter.FormatRunList([plainRun], 'table');
            expect(tableOutput).toContain('11111111');
            expect(tableOutput).toContain('Customer Insight Specialist');
            expect(tableOutput).toContain('5.0s');
        });
    });
});
