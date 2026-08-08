/**
 * Tests for the Create Workflow front door.
 *
 * Two kinds of assertion here, and the second is the unusual one:
 *
 * 1. **Behaviour** — which door is open, what each one requires before it will let you through, and
 *    the refusal to promote a run that has not settled.
 * 2. **Vocabulary (D18)** — the rule is that end users see *Workflow*; *graph*, *DAG*, *node* and
 *    *Flow Agent* survive in metadata and dev docs only. That rule is invisible to a compiler and
 *    easy to erode one label at a time, so the words are asserted against the template and the
 *    option data the same way behaviour is.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
    DEFAULT_WORKFLOW_START_MODE,
    WORKFLOW_START_OPTIONS,
    type PromotableRun,
} from '../workflows.types';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const TEMPLATE = path.join(HERE, '..', 'components', 'create-workflow.component.html');
const DASHBOARD_TEMPLATE = path.join(HERE, '..', 'workflows-dashboard.component.html');

describe('the three doors', () => {
    it('offers exactly the three from the locked mockup, in order', () => {
        expect(WORKFLOW_START_OPTIONS.map((o) => o.Mode)).toEqual(['blank', 'describe', 'past-run']);
    });

    it('opens on "Describe it"', () => {
        // Pre-selected because it is the only door that needs no prior knowledge of the product;
        // the other two assume you know the shape you want, or that a good run already happened.
        expect(DEFAULT_WORKFLOW_START_MODE).toBe('describe');
    });

    it('gives every door a promise and a "when to use this"', () => {
        // A tile with no Meta is a tile that tells you what it does but not when to pick it, which
        // is the actual question someone has on this screen.
        for (const option of WORKFLOW_START_OPTIONS) {
            expect(option.Title.length, `${option.Mode} title`).toBeGreaterThan(0);
            expect(option.Blurb.length, `${option.Mode} blurb`).toBeGreaterThan(0);
            expect(option.Meta.length, `${option.Mode} meta`).toBeGreaterThan(0);
        }
    });

    it('promises that nothing is saved before approval, on the door that drafts for you', () => {
        // The one door where a user might reasonably fear an agent is writing things on their behalf.
        const describe = WORKFLOW_START_OPTIONS.find((o) => o.Mode === 'describe')!;
        expect(describe.Meta.toLowerCase()).toContain('nothing is saved');
    });

    it('says up front that only finished runs can be promoted', () => {
        const past = WORKFLOW_START_OPTIONS.find((o) => o.Mode === 'past-run')!;
        expect(past.Meta.toLowerCase()).toContain('finished');
    });
});

describe('D18 vocabulary — end users see "Workflow", never the substrate', () => {
    const forbidden = [
        // Word-boundary matched so "workflow" does not trip on "flow", and so ordinary words
        // containing these letters are not false positives.
        { word: 'graph', re: /\bgraphs?\b/i },
        { word: 'DAG', re: /\bDAGs?\b/ },
        { word: 'node', re: /\bnodes?\b/i },
        { word: 'flow agent', re: /\bflow agents?\b/i },
    ];

    for (const file of [TEMPLATE, DASHBOARD_TEMPLATE]) {
        const name = path.basename(file);
        for (const { word, re } of forbidden) {
            it(`${name} never says "${word}"`, () => {
                const text = fs.readFileSync(file, 'utf-8');
                // Strip Angular bindings and attribute names — the rule is about what a person
                // READS, and a class or property name is neither shown nor spoken.
                const visible = text
                    .replace(/<!--[\s\S]*?-->/g, '')
                    .replace(/\[[^\]]*\]="[^"]*"/g, '')
                    .replace(/\([^)]*\)="[^"]*"/g, '')
                    .replace(/\b(?:class|ngClass|id|for|role|type|Icon)="[^"]*"/g, '');
                expect(visible).not.toMatch(re);
            });
        }
    }

    it('the option copy a user reads is clean too', () => {
        const prose = WORKFLOW_START_OPTIONS.map((o) => `${o.Title} ${o.Blurb} ${o.Meta}`).join(' ');
        expect(prose).not.toMatch(/\bgraphs?\b/i);
        expect(prose).not.toMatch(/\bnodes?\b/i);
        expect(prose).not.toMatch(/\bflow agents?\b/i);
    });

    it('does say "step", which is the word that replaced them', () => {
        // Guards against the rule being satisfied by deleting the concept rather than renaming it.
        const prose = WORKFLOW_START_OPTIONS.map((o) => `${o.Blurb} ${o.Meta}`).join(' ');
        expect(prose.toLowerCase()).toContain('step');
    });
});

describe('④ saving is capture, not scheduling', () => {
    it('the front door never asks for a trigger or a schedule', () => {
        // Asking at creation time turns a two-second capture into a configuration task, which is
        // exactly the friction that stops a good one-off plan becoming reusable. A saved workflow
        // defaults to On demand until someone gives it a schedule.
        const text = fs.readFileSync(TEMPLATE, 'utf-8');
        expect(text).not.toMatch(/\bcron\b/i);
        expect(text).not.toMatch(/\btrigger\b/i);
        expect(text).not.toMatch(/\bschedule\b/i);
    });

    it('the list tells you what an unscheduled workflow does instead of leaving it blank', () => {
        const text = fs.readFileSync(DASHBOARD_TEMPLATE, 'utf-8');
        expect(text).toContain('TriggerSummary');
    });
});

describe('promotable runs', () => {
    const settled: PromotableRun = {
        ID: 'r1', Name: 'Quarterly review', StepCount: 4, Age: '2 days ago',
        AgentName: 'Sage', Status: 'Complete', IsSettled: true,
    };
    const inFlight: PromotableRun = {
        ID: 'r2', Name: 'Onboarding checklist', StepCount: 3, Age: 'today',
        AgentName: 'Sage', Status: 'In Progress', IsSettled: false,
    };

    it('carries settledness as data, not as a style', () => {
        // It decides selectability, so it must be answerable without consulting the DOM — a row that
        // is merely dimmed is still clickable, and still reachable by keyboard.
        expect(settled.IsSettled).toBe(true);
        expect(inFlight.IsSettled).toBe(false);
    });

    it('the template removes an unsettled row from the tab order rather than only dimming it', () => {
        const text = fs.readFileSync(TEMPLATE, 'utf-8');
        expect(text).toContain('run.IsSettled ? 0 : -1');
        expect(text).toContain('aria-disabled');
    });
});
