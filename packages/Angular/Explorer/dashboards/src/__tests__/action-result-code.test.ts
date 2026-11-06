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
    ActionResultColor,
    ActionResultIcon,
    ActionSuccessRate,
    ClassifyActionResultCode,
    IsActionResultFailure,
    IsActionResultSuccess,
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

describe('ClassifyActionResultCode — the writer\'s vocabulary', () => {
    it('reads the Runtime executor\'s SUCCESS as a success', () => {
        expect(ClassifyActionResultCode('SUCCESS')).toBe('success');
    });

    it.each(RUNTIME_FAILURE_CODES)('reads %s as a failure', (code) => {
        expect(ClassifyActionResultCode(code)).toBe('failure');
    });

    it('never classifies a Runtime failure code as a success', () => {
        for (const code of RUNTIME_FAILURE_CODES) {
            expect(IsActionResultSuccess(code)).toBe(false);
        }
    });
});

describe('ClassifyActionResultCode — the legacy vocabulary still works', () => {
    it.each([
        ['Success', 'success'],
        ['Failed', 'failure'],
        ['Error', 'failure'],
        ['Running', 'running'],
    ] as const)('%s → %s', (code, expected) => {
        expect(ClassifyActionResultCode(code)).toBe(expected);
    });

    it('accepts the other success spellings the Overview and Card heuristics allowed', () => {
        for (const code of ['ok', 'OK', 'Completed', 'COMPLETE', 'succeeded']) {
            expect(ClassifyActionResultCode(code)).toBe('success');
        }
    });
});

describe('ClassifyActionResultCode — normalisation', () => {
    it('is case-insensitive', () => {
        expect(ClassifyActionResultCode('success')).toBe('success');
        expect(ClassifyActionResultCode('sUcCeSs')).toBe('success');
        expect(ClassifyActionResultCode('runtime_error')).toBe('failure');
    });

    it('trims surrounding whitespace', () => {
        expect(ClassifyActionResultCode('  SUCCESS  ')).toBe('success');
    });

    it('folds separators, so hyphen/space/dot spellings agree with the underscore one', () => {
        expect(ClassifyActionResultCode('RUNTIME-ERROR')).toBe('failure');
        expect(ClassifyActionResultCode('Runtime Error')).toBe('failure');
        expect(ClassifyActionResultCode('IN-PROGRESS')).toBe('running');
        expect(ClassifyActionResultCode('in progress')).toBe('running');
    });
});

describe('ClassifyActionResultCode — numeric codes', () => {
    it.each(['200', '201', '204'])('%s is a success', (code) => {
        expect(ClassifyActionResultCode(code)).toBe('success');
    });

    it.each(['400', '401', '404', '500', '503'])('%s is a failure', (code) => {
        expect(ClassifyActionResultCode(code)).toBe('failure');
    });

    it('does not treat a non-3-digit number as a status', () => {
        expect(ClassifyActionResultCode('42')).toBe('unknown');
    });
});

describe('ClassifyActionResultCode — unknown is an answer, not a default bucket', () => {
    it.each([null, undefined, '', '   '])('%s classifies as unknown', (code) => {
        expect(ClassifyActionResultCode(code)).toBe('unknown');
    });

    it('classifies an unrecognised custom code as unknown, NOT as a failure', () => {
        // Counting it as a failure would invent an incident; counting it as a success would
        // hide one. Neither is honest about a code nobody here can read.
        expect(ClassifyActionResultCode('PARTIAL')).toBe('unknown');
        expect(IsActionResultSuccess('PARTIAL')).toBe(false);
        expect(IsActionResultFailure('PARTIAL')).toBe(false);
    });

    it('checks the exact success/running lists BEFORE the failure markers', () => {
        // 'SUCCESS' must not be dragged into failure by a marker match, and a code that
        // merely CONTAINS a success word is not thereby a success.
        expect(ClassifyActionResultCode('SUCCESS')).toBe('success');
        expect(ClassifyActionResultCode('SUCCESS_WITH_ERRORS')).toBe('failure');
        expect(ClassifyActionResultCode('NOT_SUCCESSFUL')).toBe('unknown');
    });
});

describe('ActionSuccessRate', () => {
    it('reports 100 % for a set of SUCCESS-coded runs — the exact case that showed 0 %', () => {
        const codes = Array.from({ length: 181 }, () => 'SUCCESS');
        expect(ActionSuccessRate(codes)).toBe(100);
    });

    it('excludes still-running runs from BOTH halves of the fraction', () => {
        // 2 success, 2 failure, 4 running → 50 %, not 25 %.
        expect(ActionSuccessRate(['SUCCESS', 'SUCCESS', 'TIMEOUT', 'RUNTIME_ERROR', 'RUNNING', 'RUNNING', 'RUNNING', 'RUNNING'])).toBe(50);
    });

    it('excludes unreadable codes from both halves too', () => {
        expect(ActionSuccessRate(['SUCCESS', 'PARTIAL', null, ''])).toBe(100);
    });

    it('reports 0 when nothing has settled — there is no rate yet', () => {
        expect(ActionSuccessRate(['RUNNING', 'RUNNING'])).toBe(0);
        expect(ActionSuccessRate([])).toBe(0);
    });

    it('rounds to a whole percentage', () => {
        expect(ActionSuccessRate(['SUCCESS', 'SUCCESS', 'TIMEOUT'])).toBe(67);
    });
});

describe('ActionResultColor / ActionResultIcon agree with the classification', () => {
    it('paints an UPPER_SNAKE failure red, not neutral', () => {
        // `RUNTIME_ERROR`.toLowerCase() is 'runtime_error', which fell through the old
        // switch's `default` and rendered as informational blue.
        expect(ActionResultColor('RUNTIME_ERROR')).toBe('error');
        expect(ActionResultIcon('RUNTIME_ERROR')).toContain('exclamation');
    });

    it('never disagrees with ClassifyActionResultCode across the whole vocabulary', () => {
        const expected = {
            success: { color: 'success', icon: 'fa-check-circle' },
            failure: { color: 'error', icon: 'fa-exclamation-circle' },
            running: { color: 'warning', icon: 'fa-spinner' },
            unknown: { color: 'info', icon: 'fa-info-circle' },
        } as const;
        const codes = ['SUCCESS', 'Success', ...RUNTIME_FAILURE_CODES, 'Failed', 'Error', 'Running', 'PARTIAL', '', null];
        for (const code of codes) {
            const klass = ClassifyActionResultCode(code);
            expect(ActionResultColor(code)).toBe(expected[klass].color);
            expect(ActionResultIcon(code)).toContain(expected[klass].icon);
        }
    });
});
