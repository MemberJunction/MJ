import { describe, it, expect, vi } from 'vitest';
import type { Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RunView, type BaseEntity, type RunViewParams, type RunViewResult } from '@memberjunction/core';
import { query, queryAll } from '@memberjunction/ng-test-utils';
import type { BaseFormPanel } from '@memberjunction/ng-base-forms';
import { CompanyOverviewPanel } from './Companies/company-overview.panel';
import { EmployeeOverviewPanel } from './Employees/employee-overview.panel';
import { ConversationOverviewPanel } from './Conversations/conversation-overview.panel';
import { AIAgentCategoryOverviewPanel } from './AIAgentCategories/ai-agent-category-overview.panel';
import { UserOverviewPanel } from './Users/user-overview.panel';

/**
 * DOM coverage for the compiled overview panels that run one `RunView` when they mount on
 * a form. `RunView.prototype.RunView` is stubbed per test, so these specs cover what each
 * panel owns: the entity it queries, its rows and count badge when the query succeeds, its
 * empty text when there are no rows, and a "could not load" line with no count badge when the
 * query fails or throws.
 */

interface OverviewCase {
    Name: string;
    Component: Type<BaseFormPanel<BaseEntity>>;
    RecordStub: Record<string, unknown>;
    EntityName: string;
    Rows: Array<Record<string, unknown>>;
    /** Text one loaded row renders. */
    RowText: string;
    /** Text shown when the query succeeds with no rows. */
    EmptyText: string;
    /** Count badge text for `Rows`. */
    BadgeText: string;
    /** The noun in the "could not load" line. */
    Noun: string;
    /** How many places show the "could not load" line. */
    ErrorLines: number;
}

const CASES: OverviewCase[] = [
    {
        Name: 'CompanyOverviewPanel',
        Component: CompanyOverviewPanel,
        RecordStub: { ID: 'company-1', Name: 'Acme', Website: null },
        EntityName: 'MJ: Employees',
        Rows: [{ ID: 'emp-1', FirstName: 'Ada', LastName: 'Lovelace', Title: 'Engineer' }],
        RowText: 'Ada Lovelace',
        EmptyText: 'No employees assigned directly to this company.',
        BadgeText: '1 Members',
        Noun: 'employees',
        ErrorLines: 1,
    },
    {
        Name: 'EmployeeOverviewPanel',
        Component: EmployeeOverviewPanel,
        RecordStub: { ID: 'emp-9', Title: 'Lead', Email: 'lead@example.com' },
        EntityName: 'MJ: Employees',
        Rows: [{ ID: 'emp-1', FirstName: 'Ada', LastName: 'Lovelace', Title: 'Engineer' }],
        RowText: 'Ada Lovelace',
        EmptyText: 'No direct reports assigned.',
        BadgeText: '1 Team Members',
        Noun: 'direct reports',
        ErrorLines: 1,
    },
    {
        Name: 'ConversationOverviewPanel',
        Component: ConversationOverviewPanel,
        RecordStub: { ID: 'convo-1' },
        EntityName: 'MJ: Conversation Details',
        Rows: [
            { ID: 'msg-1', Role: 'User', Message: 'Hello agent' },
            { ID: 'msg-2', Role: 'AI', Message: 'Hello human' },
        ],
        RowText: 'Hello agent',
        EmptyText: 'No messages in this conversation yet.',
        BadgeText: '2 Turns',
        Noun: 'messages',
        ErrorLines: 2,
    },
    {
        Name: 'AIAgentCategoryOverviewPanel',
        Component: AIAgentCategoryOverviewPanel,
        RecordStub: { ID: 'category-1' },
        EntityName: 'MJ: AI Agents',
        Rows: [{ ID: 'agent-1', Name: 'Research Agent', Status: 'Active' }],
        RowText: 'Research Agent',
        EmptyText: 'No agents assigned to this category yet.',
        BadgeText: '1 Registered',
        Noun: 'agents',
        ErrorLines: 1,
    },
    {
        Name: 'UserOverviewPanel',
        Component: UserOverviewPanel,
        RecordStub: { ID: 'user-1', IsActive: true, Type: 'User' },
        EntityName: 'MJ: User Roles',
        Rows: [{ ID: 'role-1', Role: 'Developer' }],
        RowText: 'Developer',
        EmptyText: 'No explicit roles assigned. Default permissions apply.',
        BadgeText: '1 Roles',
        Noun: 'roles',
        ErrorLines: 1,
    },
];

const viewResult = (rows: Array<Record<string, unknown>>, overrides: Partial<RunViewResult> = {}): RunViewResult => ({
    Success: true,
    Results: rows,
    RowCount: rows.length,
    TotalRowCount: rows.length,
    ExecutionTime: 1,
    ErrorMessage: '',
    ...overrides,
});

/** Stubs every `RunView.RunView` call with one outcome and records the params it was given. */
function stubRunView(outcome: RunViewResult | Error): RunViewParams[] {
    const calls: RunViewParams[] = [];
    vi.spyOn(RunView.prototype, 'RunView').mockImplementation(async (params: RunViewParams) => {
        calls.push(params);
        if (outcome instanceof Error) throw outcome;
        return outcome;
    });
    return calls;
}

/** Mounts the panel, lets its load settle, and renders the result. */
async function render(c: OverviewCase): Promise<ComponentFixture<BaseFormPanel<BaseEntity>>> {
    TestBed.configureTestingModule({ imports: [c.Component] });
    const fixture = TestBed.createComponent(c.Component);
    fixture.componentRef.setInput('Record', c.RecordStub);
    fixture.detectChanges(false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges(false);
    return fixture;
}

const pageText = (f: ComponentFixture<unknown>) => (f.nativeElement as HTMLElement).textContent ?? '';
const badgeTexts = (f: ComponentFixture<unknown>) => queryAll(f, '.mj-card-badge').map((b) => b.textContent?.trim() ?? '');
const errorLines = (f: ComponentFixture<unknown>) => queryAll(f, '.mj-load-error').map((e) => e.textContent?.trim() ?? '');

describe.each(CASES)('$Name (DOM)', (c) => {
    it(`queries ${c.EntityName} for the record on the form`, async () => {
        const calls = stubRunView(viewResult(c.Rows));
        await render(c);
        expect(calls).toHaveLength(1);
        expect(calls[0].EntityName).toBe(c.EntityName);
        expect(calls[0].ExtraFilter).toContain(String(c.RecordStub['ID']));
    });

    it('renders the rows and the count badge when the query succeeds', async () => {
        stubRunView(viewResult(c.Rows));
        const fixture = await render(c);
        expect(pageText(fixture)).toContain(c.RowText);
        expect(badgeTexts(fixture)).toContain(c.BadgeText);
        expect(errorLines(fixture)).toEqual([]);
    });

    it('renders the empty text when the query succeeds with no rows', async () => {
        stubRunView(viewResult([]));
        const fixture = await render(c);
        expect(pageText(fixture)).toContain(c.EmptyText);
        expect(errorLines(fixture)).toEqual([]);
    });

    it('renders the error line and no count badge when the query returns Success: false', async () => {
        stubRunView(viewResult([], { Success: false, ErrorMessage: 'Permission denied' }));
        const fixture = await render(c);
        expect(errorLines(fixture)).toEqual(Array(c.ErrorLines).fill(`Could not load ${c.Noun}: Permission denied`));
        expect(pageText(fixture)).not.toContain(c.EmptyText);
        expect(badgeTexts(fixture).filter((t) => /^\d/.test(t))).toEqual([]);
    });

    it('renders a plain error line when the failed result has no message', async () => {
        stubRunView(viewResult([], { Success: false, ErrorMessage: '' }));
        const fixture = await render(c);
        expect(errorLines(fixture)).toEqual(Array(c.ErrorLines).fill(`Could not load ${c.Noun}.`));
    });

    it('renders the error line and no count badge when the query throws', async () => {
        stubRunView(new Error('Entity Example not found in metadata'));
        const fixture = await render(c);
        expect(errorLines(fixture)).toEqual(Array(c.ErrorLines).fill(`Could not load ${c.Noun}: Entity Example not found in metadata`));
        expect(pageText(fixture)).not.toContain(c.EmptyText);
        expect(badgeTexts(fixture).filter((t) => /^\d/.test(t))).toEqual([]);
    });
});

describe('ConversationOverviewPanel role display (DOM)', () => {
    const conversation = CASES.find((c) => c.Name === 'ConversationOverviewPanel')!;

    it('colors User turns differently from AI turns', async () => {
        stubRunView(viewResult(conversation.Rows));
        const fixture = await render(conversation);
        const pills = queryAll(fixture, '.mj-pill');
        const userPill = pills.find((p) => p.textContent?.trim() === 'User');
        const aiPill = pills.find((p) => p.textContent?.trim() === 'AI');
        expect(userPill?.classList.contains('mj-pill-blue')).toBe(true);
        expect(userPill?.classList.contains('mj-pill-green')).toBe(false);
        expect(aiPill?.classList.contains('mj-pill-green')).toBe(true);
        expect(aiPill?.classList.contains('mj-pill-blue')).toBe(false);
    });

    it('counts User prompts and agent responses', async () => {
        stubRunView(viewResult(conversation.Rows));
        const fixture = await render(conversation);
        const values = queryAll(fixture, '.mj-metric-val').map((v) => v.textContent?.trim());
        expect(values).toEqual(['2', '1', '1']);
        expect(query(fixture, '.mj-load-error')).toBeNull();
    });

    it('counts an Error turn as neither a User prompt nor an agent response, and gives it no pill color', async () => {
        stubRunView(viewResult([...conversation.Rows, { ID: 'msg-3', Role: 'Error', Message: 'Model timed out' }]));
        const fixture = await render(conversation);
        const values = queryAll(fixture, '.mj-metric-val').map((v) => v.textContent?.trim());
        expect(values).toEqual(['3', '1', '1']);
        const errorPill = queryAll(fixture, '.mj-pill').find((p) => p.textContent?.trim() === 'Error');
        expect(errorPill).toBeDefined();
        expect(errorPill?.classList.contains('mj-pill-green')).toBe(false);
        expect(errorPill?.classList.contains('mj-pill-blue')).toBe(false);
    });
});
