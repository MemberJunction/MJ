/**
 * @fileoverview `ResultCode` means one thing, and these are the rules.
 *
 * The defect: the Execution Monitor compared `ResultCode === 'Success'` and
 * `['Failed','Error']`, while the writer (`packages/Actions/Runtime/src/types.ts`, passed
 * through verbatim by `ActionEngine`) emits UPPER_SNAKE. On a real database that reported
 * **"0 % (0/181)"** directly above 181 rows rendered GREEN — because the same component's
 * colour helpers lowercased first and the metric did not.
 *
 * The writer's constant list cannot be imported here (`@memberjunction/ng-dashboards` does
 * not depend on `@memberjunction/action-runtime`), so the list is transcribed below with its
 * source cited, and the classifier is required to handle every entry. If the runtime ever adds
 * a code whose shape the classifier cannot read, adding it here is how that gets noticed.
 */
import { describe, it, expect } from 'vitest';
import {
    actionResultColor,
    actionResultIcon,
    actionSuccessRate,
    classifyActionResultCode,
    isActionResultFailure,
    isActionResultSuccess,
} from '../Actions/action-result-code';

/**
 * Every code `RuntimeActionResultCode` can emit, transcribed from
 * `packages/Actions/Runtime/src/types.ts`. `SUCCESS` is the only non-failure in the set.
 */
const RUNTIME_FAILURE_CODES = [
    'INVALID_TYPE',
    'MISSING_CODE',
    'NOT_APPROVED',
    'INACTIVE',
    'RUNTIME_ERROR',
    'TIMEOUT',
    'MEMORY_LIMIT',
    'SYNTAX_ERROR',
    'SECURITY_ERROR',
    'UNEXPECTED_ERROR',
] as const;

describe('classifyActionResultCode — the writer\'s vocabulary', () => {
    it('reads the Runtime executor\'s SUCCESS as a success', () => {
        expect(classifyActionResultCode('SUCCESS')).toBe('success');
    });

    it.each(RUNTIME_FAILURE_CODES)('reads %s as a failure', (code) => {
        expect(classifyActionResultCode(code)).toBe('failure');
    });

    it('never classifies a Runtime failure code as a success', () => {
        for (const code of RUNTIME_FAILURE_CODES) {
            expect(isActionResultSuccess(code)).toBe(false);
        }
    });
});

describe('classifyActionResultCode — the legacy vocabulary still works', () => {
    it.each([
        ['Success', 'success'],
        ['Failed', 'failure'],
        ['Error', 'failure'],
        ['Running', 'running'],
    ] as const)('%s → %s', (code, expected) => {
        expect(classifyActionResultCode(code)).toBe(expected);
    });

    it('accepts the other success spellings the Overview and Card heuristics allowed', () => {
        for (const code of ['ok', 'OK', 'Completed', 'COMPLETE', 'succeeded']) {
            expect(classifyActionResultCode(code)).toBe('success');
        }
    });
});

describe('classifyActionResultCode — normalisation', () => {
    it('is case-insensitive', () => {
        expect(classifyActionResultCode('success')).toBe('success');
        expect(classifyActionResultCode('sUcCeSs')).toBe('success');
        expect(classifyActionResultCode('runtime_error')).toBe('failure');
    });

    it('trims surrounding whitespace', () => {
        expect(classifyActionResultCode('  SUCCESS  ')).toBe('success');
    });

    it('folds separators, so hyphen/space/dot spellings agree with the underscore one', () => {
        expect(classifyActionResultCode('RUNTIME-ERROR')).toBe('failure');
        expect(classifyActionResultCode('Runtime Error')).toBe('failure');
        expect(classifyActionResultCode('IN-PROGRESS')).toBe('running');
        expect(classifyActionResultCode('in progress')).toBe('running');
    });
});

describe('classifyActionResultCode — numeric codes', () => {
    it.each(['200', '201', '204'])('%s is a success', (code) => {
        expect(classifyActionResultCode(code)).toBe('success');
    });

    it.each(['400', '401', '404', '500', '503'])('%s is a failure', (code) => {
        expect(classifyActionResultCode(code)).toBe('failure');
    });

    it('does not treat a non-3-digit number as a status', () => {
        expect(classifyActionResultCode('42')).toBe('unknown');
    });
});

describe('classifyActionResultCode — unknown is an answer, not a default bucket', () => {
    it.each([null, undefined, '', '   '])('%s classifies as unknown', (code) => {
        expect(classifyActionResultCode(code)).toBe('unknown');
    });

    it('classifies an unrecognised custom code as unknown, NOT as a failure', () => {
        // Counting it as a failure would invent an incident; counting it as a success would
        // hide one. Neither is honest about a code nobody here can read.
        expect(classifyActionResultCode('PARTIAL')).toBe('unknown');
        expect(isActionResultSuccess('PARTIAL')).toBe(false);
        expect(isActionResultFailure('PARTIAL')).toBe(false);
    });

    it('checks the exact success/running lists BEFORE the failure markers', () => {
        // 'SUCCESS' must not be dragged into failure by a marker match, and a code that
        // merely CONTAINS a success word is not thereby a success.
        expect(classifyActionResultCode('SUCCESS')).toBe('success');
        expect(classifyActionResultCode('SUCCESS_WITH_ERRORS')).toBe('failure');
        expect(classifyActionResultCode('NOT_SUCCESSFUL')).toBe('unknown');
    });
});

describe('actionSuccessRate', () => {
    it('reports 100 % for a set of SUCCESS-coded runs — the exact case that showed 0 %', () => {
        const codes = Array.from({ length: 181 }, () => 'SUCCESS');
        expect(actionSuccessRate(codes)).toBe(100);
    });

    it('excludes still-running runs from BOTH halves of the fraction', () => {
        // 2 success, 2 failure, 4 running → 50 %, not 25 %.
        expect(actionSuccessRate(['SUCCESS', 'SUCCESS', 'TIMEOUT', 'RUNTIME_ERROR', 'RUNNING', 'RUNNING', 'RUNNING', 'RUNNING'])).toBe(50);
    });

    it('excludes unreadable codes from both halves too', () => {
        expect(actionSuccessRate(['SUCCESS', 'PARTIAL', null, ''])).toBe(100);
    });

    it('reports 0 when nothing has settled — there is no rate yet', () => {
        expect(actionSuccessRate(['RUNNING', 'RUNNING'])).toBe(0);
        expect(actionSuccessRate([])).toBe(0);
    });

    it('rounds to a whole percentage', () => {
        expect(actionSuccessRate(['SUCCESS', 'SUCCESS', 'TIMEOUT'])).toBe(67);
    });
});

describe('actionResultColor / actionResultIcon agree with the classification', () => {
    it('paints an UPPER_SNAKE failure red, not neutral', () => {
        // `RUNTIME_ERROR`.toLowerCase() is 'runtime_error', which fell through the old
        // switch's `default` and rendered as informational blue.
        expect(actionResultColor('RUNTIME_ERROR')).toBe('error');
        expect(actionResultIcon('RUNTIME_ERROR')).toContain('exclamation');
    });

    it('never disagrees with classifyActionResultCode across the whole vocabulary', () => {
        const expected = {
            success: { color: 'success', icon: 'fa-check-circle' },
            failure: { color: 'error', icon: 'fa-exclamation-circle' },
            running: { color: 'warning', icon: 'fa-spinner' },
            unknown: { color: 'info', icon: 'fa-info-circle' },
        } as const;
        const codes = ['SUCCESS', 'Success', ...RUNTIME_FAILURE_CODES, 'Failed', 'Error', 'Running', 'PARTIAL', '', null];
        for (const code of codes) {
            const klass = classifyActionResultCode(code);
            expect(actionResultColor(code)).toBe(expected[klass].color);
            expect(actionResultIcon(code)).toContain(expected[klass].icon);
        }
    });
});
