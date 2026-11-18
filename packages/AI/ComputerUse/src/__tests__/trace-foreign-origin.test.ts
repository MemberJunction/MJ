import { describe, it, expect } from 'vitest';
import { RecordTrace, TraceUrlMatches } from '../engine/trace.js';
import { ComputerUseResult } from '../types/results.js';
import { StepRecord, JudgeVerdict } from '../types/judge.js';
import { ActionExecutionResult, ClickElementAction, InteractiveElement } from '../types/browser.js';
import { GoalPostcondition } from '../types/trace.js';

/**
 * A login run passes through the identity provider's pages. Their URLs carry the IdP tenant
 * (for example `dev-abc.us.auth0.com`), so a script that stores them absolute fails its URL
 * guards on any other tenant and puts the tenant name into committed metadata. URLs on other
 * origins than the app's are stored as path fragments, which match by containment.
 */

const APP = 'http://localhost:4200';
const IDP = 'https://dev-tenant.us.auth0.com';
const RECORDED_AT = '2026-11-12T10:00:00.000Z';

function step(n: number, before: string, after: string): StepRecord {
    const s = new StepRecord();
    s.StepNumber = n;
    s.ControllerReasoning = `step ${n}`;
    const el = new InteractiveElement();
    el.Index = 0; el.Role = 'button'; el.Name = `Button ${n}`; el.Selector = `#b${n}`;
    s.InteractiveElements = [el];
    const action = new ClickElementAction();
    action.Index = 0;
    const r = new ActionExecutionResult(action);
    r.Success = true;
    s.ActionResults = [r];
    s.UrlBefore = before;
    s.Url = before;
    s.UrlAfter = after;
    return s;
}

function completed(steps: StepRecord[]): ComputerUseResult {
    const r = new ComputerUseResult();
    r.Status = 'Completed'; r.Success = true; r.Steps = steps;
    const v = new JudgeVerdict();
    v.Done = true; v.Confidence = 1;
    r.FinalJudgeVerdict = v;
    return r;
}

function loginRun(): ComputerUseResult {
    return completed([
        step(1, `${APP}/`, `${IDP}/u/login?state=abc123`),
        step(2, `${IDP}/u/login?state=abc123`, `${IDP}/u/login/password?state=abc123`),
        step(3, `${IDP}/u/login/password?state=abc123`, `${APP}/app/home`),
    ]);
}

function urlPost(url: string): GoalPostcondition {
    const p = new GoalPostcondition();
    p.Kind = 'url';
    p.UrlPattern = url;
    return p;
}

describe('RecordTrace — URLs on another origin than the app', () => {
    it('stores identity-provider URLs as path fragments and keeps app URLs absolute', () => {
        const trace = RecordTrace({ result: loginRun(), testId: 'T001', goal: 'Log in', recordedAt: RECORDED_AT, appOrigin: `${APP}/` });

        expect(JSON.stringify(trace)).not.toContain('auth0.com');
        expect(trace.Steps[0].Precondition?.UrlPattern).toBe(`${APP}/`);
        expect(trace.Steps[0].Postcondition?.UrlPattern).toBe('/u/login');
        expect(trace.Steps[1].UrlBefore).toBe('/u/login');
        expect(trace.Steps[1].Precondition?.UrlPattern).toBe('/u/login');
        expect(trace.Steps[1].Postcondition?.UrlPattern).toBe('/u/login/password');
        expect(trace.Steps[2].Postcondition?.UrlPattern).toBe(`${APP}/app/home`);
    });

    it('stores a goal URL postcondition on another origin as a path fragment', () => {
        const trace = RecordTrace({
            result: loginRun(),
            testId: 'T001',
            goal: 'Log out',
            recordedAt: RECORDED_AT,
            appOrigin: APP,
            goalPostconditions: [urlPost(`${IDP}/u/login?state=xyz`), urlPost(`${APP}/app/home`)],
        });

        expect(trace.GoalPostconditions.map(p => p.UrlPattern)).toEqual(['/u/login', `${APP}/app/home`]);
    });

    it('uses the origin of the first step when no app origin is given', () => {
        const trace = RecordTrace({ result: loginRun(), testId: 'T001', goal: 'Log in', recordedAt: RECORDED_AT });

        expect(JSON.stringify(trace)).not.toContain('auth0.com');
        expect(trace.Steps[2].Postcondition?.UrlPattern).toBe(`${APP}/app/home`);
    });

    it('keeps URLs absolute when the first step is on a page with no origin and no app origin is given', () => {
        const run = completed([
            step(1, 'about:blank', `${APP}/`),
            step(2, `${APP}/`, `${APP}/app/home`),
        ]);
        const trace = RecordTrace({ result: run, testId: 'T001', goal: 'Open home', recordedAt: RECORDED_AT });

        expect(trace.Steps[1].Postcondition?.UrlPattern).toBe(`${APP}/app/home`);
    });

    it('produces guards that match the same page on another tenant', () => {
        const trace = RecordTrace({ result: loginRun(), testId: 'T001', goal: 'Log in', recordedAt: RECORDED_AT, appOrigin: APP });

        const guard = trace.Steps[1].Precondition?.UrlPattern ?? '';
        expect(TraceUrlMatches(guard, 'https://other-tenant.eu.auth0.com/u/login?state=zzz')).toBe(true);
    });
});
