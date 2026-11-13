import * as vm from 'node:vm';
import {
    GetSafeRegexBatchSandboxExecutor,
    GetSafeRegexSandboxExecutor,
    RegisterSafeRegexBatchSandboxExecutor,
    RegisterSafeRegexSandboxExecutor,
    SafeRegexBatchSandboxResult,
    SafeRegexSearchBatchDetailed
} from '@memberjunction/core-entities';

interface VmRegexState {
    rx: RegExp;
    s: string;
}

interface VmBatchRegexState {
    rx: RegExp;
    items: readonly string[];
    out: boolean[];
    idx: number;
}

const VM_REGEX_STATE: VmRegexState = { rx: /(?:)/, s: '' };
const VM_REGEX_CONTEXT = vm.createContext(VM_REGEX_STATE);
const VM_REGEX_SCRIPT = new vm.Script('rx.test(s)');

const VM_BATCH_REGEX_STATE: VmBatchRegexState = {
    rx: /(?:)/,
    items: [],
    out: [],
    idx: 0
};
const VM_BATCH_REGEX_CONTEXT = vm.createContext(VM_BATCH_REGEX_STATE);
const VM_BATCH_REGEX_SCRIPT = new vm.Script(
    '{ for (; idx < items.length; idx++) { rx.lastIndex = 0; out[idx] = rx.test(items[idx]); } idx; }'
);

function isVmTimeoutError(err: Error | { code?: string; message?: string } | string | null | undefined): boolean {
    const msg =
        err instanceof Error
            ? err.message
            : typeof err === 'object' && err !== null && 'message' in err && typeof err.message === 'string'
              ? err.message
              : String(err);
    const errCode =
        typeof err === 'object' && err !== null && 'code' in err && typeof err.code === 'string' ? err.code : '';
    return errCode === 'ERR_SCRIPT_EXECUTION_TIMEOUT' || msg.includes('Script execution timed out');
}

export function EnsureNodeVmSafeRegexExecutorRegistered(): void {
    if (!GetSafeRegexSandboxExecutor()) {
        RegisterSafeRegexSandboxExecutor((regex: RegExp, input: string, maxDurationMs: number) => {
            regex.lastIndex = 0;
            VM_REGEX_STATE.rx = regex;
            VM_REGEX_STATE.s = input;
            try {
                const matched = Boolean(
                    VM_REGEX_SCRIPT.runInContext(VM_REGEX_CONTEXT, {
                        timeout: Math.max(1, Math.ceil(maxDurationMs))
                    })
                );
                return { Matched: matched, TimedOut: false };
            } catch (err) {
                if (isVmTimeoutError(err as Error | { code?: string; message?: string })) {
                    return { Matched: false, TimedOut: true };
                }
                throw err;
            } finally {
                VM_REGEX_STATE.s = '';
            }
        });
    }

    if (!GetSafeRegexBatchSandboxExecutor()) {
        RegisterSafeRegexBatchSandboxExecutor(
            (regex: RegExp, inputs: readonly string[], maxDurationMs: number): SafeRegexBatchSandboxResult => {
                regex.lastIndex = 0;
                VM_BATCH_REGEX_STATE.rx = regex;
                VM_BATCH_REGEX_STATE.items = inputs;
                VM_BATCH_REGEX_STATE.out = new Array<boolean>(inputs.length).fill(false);
                VM_BATCH_REGEX_STATE.idx = 0;
                try {
                    VM_BATCH_REGEX_SCRIPT.runInContext(VM_BATCH_REGEX_CONTEXT, {
                        timeout: Math.max(1, Math.ceil(maxDurationMs))
                    });
                    const matches = VM_BATCH_REGEX_STATE.out.map(Boolean);
                    return { Matches: matches, TimedOut: false };
                } catch (err) {
                    if (isVmTimeoutError(err as Error | { code?: string; message?: string })) {
                        const timedOutIndex = VM_BATCH_REGEX_STATE.idx;
                        const partialMatches = VM_BATCH_REGEX_STATE.out.slice(0, inputs.length).map(Boolean);
                        return {
                            Matches: partialMatches,
                            TimedOut: true,
                            TimedOutIndex: timedOutIndex
                        };
                    }
                    throw err;
                } finally {
                    VM_BATCH_REGEX_STATE.items = [];
                    VM_BATCH_REGEX_STATE.out = [];
                }
            }
        );
    }
}

export interface SafeRegexBatchRecoveryResult {
    Matches: boolean[];
    InputTooLong: boolean[];
    TimedOut: boolean[];
    BudgetSkipped: boolean[];
    BudgetExpired: boolean;
}

export function ExecuteSafeRegexBatchWithRecovery(
    regex: RegExp,
    texts: readonly string[],
    deadlineMs: number,
    perCallMaxMs: number = 40,
    maxInputBytes: number = 65_536
): SafeRegexBatchRecoveryResult {
    EnsureNodeVmSafeRegexExecutorRegistered();

    const total = texts.length;
    const matches = new Array<boolean>(total).fill(false);
    const inputTooLong = new Array<boolean>(total).fill(false);
    const timedOut = new Array<boolean>(total).fill(false);
    const budgetSkipped = new Array<boolean>(total).fill(false);
    let budgetExpired = false;

    let cursor = 0;
    while (cursor < total) {
        const remainingMs = deadlineMs - performance.now();
        if (remainingMs <= 0) {
            budgetExpired = true;
            for (let j = cursor; j < total; j++) {
                budgetSkipped[j] = true;
            }
            break;
        }

        const sliceTexts = texts.slice(cursor);
        const callBudget = Math.min(perCallMaxMs, remainingMs);
        const batchRes = SafeRegexSearchBatchDetailed(regex, sliceTexts, callBudget, maxInputBytes);

        if (!batchRes.TimedOut) {
            for (let j = 0; j < sliceTexts.length; j++) {
                matches[cursor + j] = batchRes.Matches[j];
                inputTooLong[cursor + j] = batchRes.InputTooLong[j];
            }
            cursor += sliceTexts.length;
        } else {
            const timedOutIndexInSlice =
                typeof batchRes.TimedOutIndex === 'number' &&
                batchRes.TimedOutIndex >= 0 &&
                batchRes.TimedOutIndex < sliceTexts.length
                    ? batchRes.TimedOutIndex
                    : 0;

            // a. Keep all completed results for indices 0 .. timedOutIndex - 1
            for (let j = 0; j < timedOutIndexInSlice; j++) {
                matches[cursor + j] = batchRes.Matches[j];
                inputTooLong[cursor + j] = batchRes.InputTooLong[j];
            }

            // b. If timedOutIndexInSlice > 0: advance cursor without marking as timed out
            if (timedOutIndexInSlice > 0) {
                cursor += timedOutIndexInSlice;
                continue;
            }

            // c. If timedOutIndexInSlice === 0: sliceTexts[0] already ran at index 0 with the entire callBudget to itself
            if (callBudget < perCallMaxMs) {
                budgetExpired = true;
                for (let j = cursor; j < total; j++) {
                    budgetSkipped[j] = true;
                }
                break;
            }

            timedOut[cursor] = true;
            cursor += 1;
        }
    }

    return {
        Matches: matches,
        InputTooLong: inputTooLong,
        TimedOut: timedOut,
        BudgetSkipped: budgetSkipped,
        BudgetExpired: budgetExpired
    };
}
