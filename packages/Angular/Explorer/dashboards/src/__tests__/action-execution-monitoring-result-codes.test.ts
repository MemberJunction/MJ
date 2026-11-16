/**
 * @fileoverview The Execution Monitor's numbers must describe the rows it is showing.
 *
 * Reproduces the reported shape — a database of `SUCCESS`-coded runs, which the monitor
 * reported as **0 % (0/181)** with **0 failures** while rendering every row green — and pins
 * the three surfaces that were computed from three different vocabularies: the metric tiles,
 * the result filter chips, and the colour/icon helpers.
 *
 * Driven off the prototype (no constructor/TestBed) with only the members the methods touch
 * stubbed, matching data-explorer-application-entities.test.ts in this directory.
 */
import '@angular/compiler'; // JIT support — the component import evaluates Angular decorators in vitest's node env
import { describe, it, expect } from 'vitest';
import { BehaviorSubject } from 'rxjs';
import type { MJActionEntity, MJActionExecutionLogEntity } from '@memberjunction/core-entities';

import { ActionExecutionMonitoringComponent } from '../Actions/components/execution-monitoring.component';

interface Harness {
    component: ActionExecutionMonitoringComponent;
    calculateMetrics(): void;
    applyFilters(): void;
    setResult(value: string): void;
}

/** One execution log row, only the fields these methods read. */
function execution(resultCode: string | null, opts: { ended?: boolean; startedDaysAgo?: number } = {}): MJActionExecutionLogEntity {
    const startedDaysAgo = opts.startedDaysAgo ?? 0;
    const startedAt = new Date(Date.now() - startedDaysAgo * 24 * 60 * 60 * 1000);
    return {
        ID: `log-${Math.random().toString(36).slice(2)}`,
        ActionID: 'action-1',
        ResultCode: resultCode,
        StartedAt: startedAt,
        EndedAt: (opts.ended ?? true) ? new Date(startedAt.getTime() + 1000) : null,
        UserID: 'user-1',
    } as unknown as MJActionExecutionLogEntity;
}

function buildHarness(executions: MJActionExecutionLogEntity[]): Harness {
    const component = Object.create(ActionExecutionMonitoringComponent.prototype) as ActionExecutionMonitoringComponent;
    const actions = new Map<string, MJActionEntity>([
        ['action-1', { ID: 'action-1', Name: 'Send Welcome Email' } as unknown as MJActionEntity],
    ]);
    Object.assign(component as unknown as Record<string, unknown>, {
        executions,
        actions,
        filteredExecutions: [],
        metrics: {
            totalExecutions: 0,
            successfulExecutions: 0,
            failedExecutions: 0,
            averageDuration: 0,
            executionsToday: 0,
            executionsThisWeek: 0,
            currentlyRunning: 0,
        },
        searchTerm$: new BehaviorSubject<string>(''),
        selectedResult$: new BehaviorSubject<string>('all'),
        selectedTimeRange$: new BehaviorSubject<string>('7days'),
        selectedAction$: new BehaviorSubject<string>('all'),
    });

    const priv = component as unknown as {
        calculateMetrics(): void;
        applyFilters(): void;
        selectedResult$: BehaviorSubject<string>;
    };

    return {
        component,
        calculateMetrics: priv.calculateMetrics.bind(component),
        applyFilters: priv.applyFilters.bind(component),
        setResult: (value: string) => priv.selectedResult$.next(value),
    };
}

describe('Execution Monitor metrics — the reported 0 % (0/181) shape', () => {
    it('counts UPPER_SNAKE SUCCESS rows as successes', () => {
        const harness = buildHarness(Array.from({ length: 181 }, () => execution('SUCCESS')));

        harness.calculateMetrics();

        expect(harness.component.metrics.totalExecutions).toBe(181);
        expect(harness.component.metrics.successfulExecutions).toBe(181);
        expect(harness.component.getSuccessRate()).toBe(100);
    });

    it('counts UPPER_SNAKE failure codes as failures', () => {
        const harness = buildHarness([
            execution('SUCCESS'),
            execution('RUNTIME_ERROR'),
            execution('TIMEOUT'),
            execution('NOT_APPROVED'),
        ]);

        harness.calculateMetrics();

        expect(harness.component.metrics.successfulExecutions).toBe(1);
        expect(harness.component.metrics.failedExecutions).toBe(3);
        expect(harness.component.getSuccessRate()).toBe(25);
    });

    it('still counts the legacy Title Case vocabulary', () => {
        const harness = buildHarness([execution('Success'), execution('Failed'), execution('Error')]);

        harness.calculateMetrics();

        expect(harness.component.metrics.successfulExecutions).toBe(1);
        expect(harness.component.metrics.failedExecutions).toBe(2);
    });

    it('keeps a still-running row out of the success rate rather than counting it against', () => {
        const harness = buildHarness([
            execution('SUCCESS'),
            execution('RUNNING', { ended: false }),
            execution('RUNNING', { ended: false }),
        ]);

        harness.calculateMetrics();

        expect(harness.component.metrics.currentlyRunning).toBe(2);
        // 1 of 1 settled — not 1 of 3.
        expect(harness.component.getSuccessRate()).toBe(100);
    });

    it('does not count an unreadable code as either outcome', () => {
        const harness = buildHarness([execution('SUCCESS'), execution('PARTIAL'), execution(null)]);

        harness.calculateMetrics();

        expect(harness.component.metrics.successfulExecutions).toBe(1);
        expect(harness.component.metrics.failedExecutions).toBe(0);
        expect(harness.component.getSuccessRate()).toBe(100);
    });
});

describe('Execution Monitor result chips — a chip must not select nothing', () => {
    it('the Success chip matches SUCCESS-coded rows', () => {
        const harness = buildHarness([execution('SUCCESS'), execution('SUCCESS'), execution('RUNTIME_ERROR')]);

        harness.setResult('Success');
        harness.applyFilters();

        expect(harness.component.filteredExecutions).toHaveLength(2);
        expect(harness.component.filteredExecutions.every(e => e.ResultCode === 'SUCCESS')).toBe(true);
    });

    it('the Failed chip matches every failure code, not the literal word "Failed"', () => {
        const harness = buildHarness([
            execution('SUCCESS'),
            execution('RUNTIME_ERROR'),
            execution('TIMEOUT'),
            execution('Failed'),
        ]);

        harness.setResult('Failed');
        harness.applyFilters();

        expect(harness.component.filteredExecutions.map(e => e.ResultCode).sort())
            .toEqual(['Failed', 'RUNTIME_ERROR', 'TIMEOUT']);
    });

    it('accepts "Error" as an alias for the same failure bucket', () => {
        const harness = buildHarness([execution('SUCCESS'), execution('SECURITY_ERROR')]);

        harness.setResult('Error');
        harness.applyFilters();

        expect(harness.component.filteredExecutions.map(e => e.ResultCode)).toEqual(['SECURITY_ERROR']);
    });

    it('the Running chip still matches an unfinished row with no code at all', () => {
        const harness = buildHarness([
            execution('SUCCESS'),
            execution(null, { ended: false }),
            execution('RUNNING', { ended: false }),
        ]);

        harness.setResult('Running');
        harness.applyFilters();

        expect(harness.component.filteredExecutions).toHaveLength(2);
    });

    it('"all" still means all', () => {
        const harness = buildHarness([execution('SUCCESS'), execution('TIMEOUT'), execution('PARTIAL')]);

        harness.setResult('all');
        harness.applyFilters();

        expect(harness.component.filteredExecutions).toHaveLength(3);
    });

    it('the visible chip list offers one failure option, and every offered value selects something', () => {
        const harness = buildHarness([
            execution('SUCCESS'),
            execution('RUNTIME_ERROR'),
            execution('RUNNING', { ended: false }),
        ]);

        // `Failed` and `Error` used to be two separate chips that both matched literally and
        // therefore both matched nothing. One option now.
        expect(harness.component.resultOptions.map(o => o.value)).toEqual(['all', 'Success', 'Failed', 'Running']);

        for (const option of harness.component.resultOptions) {
            harness.setResult(option.value);
            harness.applyFilters();
            expect(harness.component.filteredExecutions.length, `chip "${option.value}" selected nothing`).toBeGreaterThan(0);
        }
    });
});

describe('Execution Monitor colours — the tile and the row cannot disagree', () => {
    it('paints an UPPER_SNAKE failure row red', () => {
        const harness = buildHarness([]);

        expect(harness.component.getResultColor('RUNTIME_ERROR')).toBe('error');
        expect(harness.component.getResultIcon('RUNTIME_ERROR')).toContain('exclamation');
    });

    it('paints a SUCCESS row green — the case that rendered green beside a 0 % tile', () => {
        const harness = buildHarness([]);

        expect(harness.component.getResultColor('SUCCESS')).toBe('success');
    });

    it('every row the Success chip selects is painted with the success colour', () => {
        const harness = buildHarness([execution('SUCCESS'), execution('Success'), execution('ok')]);

        harness.setResult('Success');
        harness.applyFilters();

        expect(harness.component.filteredExecutions).toHaveLength(3);
        for (const e of harness.component.filteredExecutions) {
            expect(harness.component.getResultColor(e.ResultCode)).toBe('success');
        }
    });
});
