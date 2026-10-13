import { describe, it, expect } from 'vitest';
import { RecordTrace } from '../engine/trace.js';
import { ComputerUseResult } from '../types/results.js';
import { StepRecord, JudgeVerdict } from '../types/judge.js';
import { ActionExecutionResult, ClickElementAction, InteractiveElement } from '../types/browser.js';

/**
 * Secrets must not survive into a recorded trace.
 *
 * `Text` and `Url` are tokenized back to `%name%` placeholders precisely so a
 * stored script can be replayed with fresh values and committed to a repo. The
 * step's `Instruction` — the controller's own free-text reasoning — was not,
 * and the controller narrates what it is doing:
 *
 *   "I need to log in using the provided credentials (user@example.com /
 *    hunter2). I will fill the email and password fields..."
 *
 * Every recorded login step therefore wrote the password verbatim into the
 * metadata. Found in 3 committed MJ suite scripts.
 */

const RECORDED_AT = '2026-09-11T10:00:00.000Z';
const PASSWORD = 'sup3rs3cret!';
const USERNAME = 'computeruse@example.com';

function loginStep(): StepRecord {
    const s = new StepRecord();
    s.StepNumber = 1;
    s.ControllerReasoning =
        `I need to log in using the provided credentials (${USERNAME} / ${PASSWORD}). ` +
        `I will fill the email and password fields, then click Continue.`;
    const el = new InteractiveElement();
    el.Index = 0; el.Role = 'textbox'; el.Name = 'Email address'; el.Selector = '#email';
    s.InteractiveElements = [el];
    const action = new ClickElementAction();
    action.Index = 0;
    const r = new ActionExecutionResult(action);
    r.Success = true;
    s.ActionResults = [r];
    s.Url = 'https://idp.example.com/u/login';
    s.UrlAfter = 'https://idp.example.com/u/login';
    return s;
}

function completedResult(steps: StepRecord[]): ComputerUseResult {
    const r = new ComputerUseResult();
    r.Status = 'Completed'; r.Success = true; r.Steps = steps;
    const v = new JudgeVerdict();
    v.Done = true; v.Confidence = 1;
    r.FinalJudgeVerdict = v;
    return r;
}

describe('recordTrace — secrets in the instruction', () => {
    it('tokenizes credentials the controller narrated into its reasoning', () => {
        const trace = RecordTrace({
            result: completedResult([loginStep()]),
            testId: 'T001',
            goal: 'Log in',
            recordedAt: RECORDED_AT,
            variables: ['authUsername', 'authPassword'],
            variableValues: { authUsername: USERNAME, authPassword: PASSWORD },
        });

        const instruction = trace.Steps[0].Instruction;
        expect(instruction).not.toContain(PASSWORD);
        expect(instruction).not.toContain(USERNAME);
        expect(instruction).toContain('%authPassword%');
        expect(instruction).toContain('%authUsername%');
    });

    it('leaves the reasoning untouched when no variable values were supplied', () => {
        const trace = RecordTrace({
            result: completedResult([loginStep()]),
            testId: 'T001',
            goal: 'Log in',
            recordedAt: RECORDED_AT,
        });

        expect(trace.Steps[0].Instruction).toContain('I need to log in');
    });
});
