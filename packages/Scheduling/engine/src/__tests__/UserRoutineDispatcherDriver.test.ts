import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EntityInfo, UserInfo } from '@memberjunction/core';
import {
    MJTemplateContentEntity,
    MJTemplateEntityExtended,
    MJUserRoutineEntity,
    MJUserRoutineRunEntity,
} from '@memberjunction/core-entities';
import { ConversationUtility, MentionContent } from '@memberjunction/ai-core-plus';
import { TemplateEngineServer } from '@memberjunction/templates';
import {
    FormatRoutinePlainResultSummary,
    ResolveRecordLinkLabel,
    UserRoutineDispatcherDriver,
} from '../drivers/UserRoutineDispatcherDriver';

class TestRoutineDispatcherDriver extends UserRoutineDispatcherDriver {
    public TemplateToResolve: MJTemplateEntityExtended | undefined;

    protected override resolveNotificationTemplate(): MJTemplateEntityExtended | undefined {
        return this.TemplateToResolve;
    }

    public RenderNotification(
        routine: MJUserRoutineEntity,
        run: MJUserRoutineRunEntity,
        contextUser: UserInfo
    ): Promise<string> {
        return this.renderNotificationMessage(routine, run, contextUser);
    }
}

function makeFieldDefinitions(names: string[]) {
    return names.map((name, idx) => ({
        Name: name,
        Type: name === 'StartedAt' || name === 'CompletedAt' ? 'datetimeoffset' : name === 'Priority' ? 'int' : 'nvarchar',
        IsPrimaryKey: idx === 0,
        Status: 'Active',
    }));
}

function createRoutineEntity(name: string): MJUserRoutineEntity {
    const info = new EntityInfo({
        Name: 'MJ: User Routines',
        Status: 'Active',
        Fields: makeFieldDefinitions(['ID', 'Name', 'Status', 'NotificationTemplateID']),
    });
    const entity = new MJUserRoutineEntity(info);
    entity.ID = 'routine-1';
    entity.Name = name;
    entity.Status = 'Active';
    return entity;
}

function createRunEntity(
    status: MJUserRoutineRunEntity['Status'],
    resultSummary: string | null,
    errorMessage: string | null = null
): MJUserRoutineRunEntity {
    const info = new EntityInfo({
        Name: 'MJ: User Routine Runs',
        Status: 'Active',
        Fields: makeFieldDefinitions(['ID', 'Status', 'ResultSummary', 'ErrorMessage', 'StartedAt', 'CompletedAt']),
    });
    const entity = new MJUserRoutineRunEntity(info);
    entity.ID = 'run-1';
    entity.Status = status;
    entity.ResultSummary = resultSummary;
    entity.ErrorMessage = errorMessage;
    entity.StartedAt = new Date('2026-11-21T10:00:00Z');
    entity.CompletedAt = new Date('2026-11-21T10:01:00Z');
    return entity;
}

function createTemplateContentEntity(
    id: string,
    type: string,
    templateText: string,
    priority: number = 100
): MJTemplateContentEntity {
    const info = new EntityInfo({
        Name: 'MJ: Template Contents',
        Status: 'Active',
        Fields: makeFieldDefinitions(['ID', 'TemplateID', 'Type', 'TemplateText', 'Priority', 'IsActive']),
    });
    const content = new MJTemplateContentEntity(info);
    content.ID = id;
    content.TemplateID = 'template-1';
    content.TemplateText = templateText;
    content.Priority = priority;
    // Type is a read-only joined field on MJTemplateContentEntity; set via FieldByName.
    const typeField = content.GetFieldByName('Type');
    if (typeField) {
        typeField.Value = type;
    }
    return content;
}

function createTemplateEntity(contents: MJTemplateContentEntity[]): MJTemplateEntityExtended {
    const info = new EntityInfo({
        Name: 'MJ: Templates',
        Status: 'Active',
        Fields: makeFieldDefinitions(['ID', 'Name']),
    });
    const template = new MJTemplateEntityExtended(info);
    template.ID = 'template-1';
    template.Name = 'User Routine Notification - Default';
    template.Content = contents;
    return template;
}

const TEST_USER = new UserInfo(null, {
    ID: 'user-1',
    Name: 'Elena Vance',
    Email: 'elena@northwind.example',
    IsActive: true,
});

describe('UserRoutineDispatcherDriver notification rendering', () => {
    beforeEach(() => {
        TemplateEngineServer.Instance.SetupNunjucks();
        TemplateEngineServer.Instance.ClearTemplateCache();
        vi.spyOn(TemplateEngineServer.Instance, 'Config').mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('preserves apostrophes, double quotes, and ampersands unescaped in Text templates', async () => {
        const driver = new TestRoutineDispatcherDriver();
        const textContent = createTemplateContentEntity(
            'content-text-1',
            'Text',
            '**{{ routine.Name }}** ({{ status }}): {{ resultSummary }}'
        );
        driver.TemplateToResolve = createTemplateEntity([textContent]);

        const routine = createRoutineEntity(`Elena's "Northwind" & Co Brief`);
        const run = createRunEntity('Success', `Reviewed Elena's notes on "Northwind" & Partners.`);

        const renderSpy = vi.spyOn(TemplateEngineServer.Instance, 'RenderTemplate');
        const output = await driver.RenderNotification(routine, run, TEST_USER);

        expect(output).toBe(
            `**Elena's "Northwind" & Co Brief** (Success): Reviewed Elena's notes on "Northwind" & Partners.`
        );
        expect(output).not.toContain('&#39;');
        expect(output).not.toContain('&quot;');
        expect(output).not.toContain('&amp;');
        expect(renderSpy.mock.calls[0][5]).toEqual({ ContextUser: TEST_USER, autoescape: false });
    });

    it('preserves apostrophes, double quotes, and ampersands unescaped in Markdown templates', async () => {
        const driver = new TestRoutineDispatcherDriver();
        const mdContent = createTemplateContentEntity(
            'content-md-1',
            'Markdown',
            '**{{ routine.Name }}** — {{ resultSummary }}'
        );
        driver.TemplateToResolve = createTemplateEntity([mdContent]);

        const routine = createRoutineEntity(`Elena's Digest`);
        const run = createRunEntity('Success', `Status for "Northwind" & Southwind`);

        const renderSpy = vi.spyOn(TemplateEngineServer.Instance, 'RenderTemplate');
        const output = await driver.RenderNotification(routine, run, TEST_USER);

        expect(output).toBe(`**Elena's Digest** — Status for "Northwind" & Southwind`);
        expect(renderSpy.mock.calls[0][5]).toEqual({ ContextUser: TEST_USER, autoescape: false });
    });

    it('escapes apostrophes, double quotes, and ampersands when rendering HTML templates', async () => {
        const driver = new TestRoutineDispatcherDriver();
        const htmlContent = createTemplateContentEntity(
            'content-html-1',
            'HTML',
            `<p>{{ routine.Name }}: {{ resultSummary }}</p>`
        );
        driver.TemplateToResolve = createTemplateEntity([htmlContent]);

        const routine = createRoutineEntity(`Elena's Routine`);
        const run = createRunEntity('Success', `Update on "Northwind" & Co`);

        const renderSpy = vi.spyOn(TemplateEngineServer.Instance, 'RenderTemplate');
        const output = await driver.RenderNotification(routine, run, TEST_USER);

        expect(output).toContain('Elena&#39;s Routine');
        expect(output).toContain('&quot;Northwind&quot; &amp; Co');
        expect(renderSpy.mock.calls[0][5]).toEqual({ ContextUser: TEST_USER, autoescape: true });
    });

    it('converts @{"_mode":"mention",...} tokens via ConversationUtility.ToPlainText for Text bodies and deduplicates adjacent record titles', async () => {
        const driver = new TestRoutineDispatcherDriver();
        const textContent = createTemplateContentEntity(
            'content-text-mentions',
            'Text',
            '{{ resultSummary }}'
        );
        driver.TemplateToResolve = createTemplateEntity([textContent]);

        const toPlainTextSpy = vi.spyOn(ConversationUtility, 'ToPlainText');
        const routine = createRoutineEntity('Account Watch');
        const summary = [
            `Reviewed Northwind @{"_mode":"mention","type":"record","entityName":"Accounts","name":"Northwind","ID":"acc-1"}`,
            `with @{"_mode":"mention","type":"user","id":"user-2","name":"Elena Vance"}`,
            `and flagged @{"_mode":"mention","type":"record","entityName":"Accounts","name":"Contoso","ID":"acc-2"}.`,
        ].join(' ');
        const run = createRunEntity('Success', summary);

        const output = await driver.RenderNotification(routine, run, TEST_USER);

        expect(toPlainTextSpy).toHaveBeenCalledTimes(1);
        expect(output).toBe('Reviewed Northwind with @Elena Vance and flagged Contoso.');
        expect(output).not.toContain('Northwind Northwind');
        expect(output).not.toContain('@{"_mode"');
    });

    it('does not run plain-text conversion on HTML templates', async () => {
        const driver = new TestRoutineDispatcherDriver();
        const htmlContent = createTemplateContentEntity(
            'content-html-raw',
            'HTML',
            '<div>{{ resultSummary }}</div>'
        );
        driver.TemplateToResolve = createTemplateEntity([htmlContent]);

        const toPlainTextSpy = vi.spyOn(ConversationUtility, 'ToPlainText');
        const routine = createRoutineEntity('Account Watch');
        const summary = `Reviewed Northwind @{"_mode":"mention","type":"record","entityName":"Accounts","name":"Northwind","ID":"acc-1"}`;
        const run = createRunEntity('Success', summary);

        const output = await driver.RenderNotification(routine, run, TEST_USER);

        expect(toPlainTextSpy).not.toHaveBeenCalled();
        expect(output).toContain('&quot;_mode&quot;');
    });

    it('cleans mention tokens and deduplicates record titles in plain-text fallback when no template resolves', async () => {
        const driver = new TestRoutineDispatcherDriver();
        driver.TemplateToResolve = undefined;

        const routine = createRoutineEntity(`Elena's Watch`);
        const summary = `Checked Northwind @{"_mode":"mention","type":"record","entityName":"Accounts","name":"Northwind","ID":"acc-1"}`;
        const run = createRunEntity('Success', summary);

        const output = await driver.RenderNotification(routine, run, TEST_USER);

        expect(output).toContain(`Routine "Elena's Watch" completed successfully`);
        expect(output).toContain('Checked Northwind');
        expect(output).not.toContain('Northwind Northwind');
        expect(output).not.toContain('@{"_mode"');
    });
});

describe('FormatRoutinePlainResultSummary', () => {
    it('returns empty string for empty input', () => {
        expect(FormatRoutinePlainResultSummary('')).toBe('');
    });

    it('deduplicates record mention immediately following the same record title', () => {
        const input = `Northwind @{"_mode":"mention","type":"record","entityName":"Accounts","name":"Northwind","ID":"1"}`;
        expect(FormatRoutinePlainResultSummary(input)).toBe('Northwind');
    });

    it('deduplicates record mention after bold markdown title and preserves trailing punctuation', () => {
        const input = `Updated **Northwind** @{"_mode":"mention","type":"record","entityName":"Accounts","name":"Northwind","ID":"1"}.`;
        expect(FormatRoutinePlainResultSummary(input)).toBe('Updated **Northwind**.');
    });

    it('does not falsely deduplicate partial suffix matches like SuperNorthwind', () => {
        const input = `SuperNorthwind @{"_mode":"mention","type":"record","entityName":"Accounts","name":"Northwind","ID":"1"}`;
        expect(FormatRoutinePlainResultSummary(input)).toBe('SuperNorthwind Northwind');
    });

    it('supports icon-only record mentions using entityName fallback', () => {
        const input = `Checked Accounts @{"_mode":"mention","type":"record","entityName":"Accounts","ID":"1"} for renewal`;
        expect(FormatRoutinePlainResultSummary(input)).toBe('Checked Accounts for renewal');
    });

    it('supports custom recordLinkLabel callback', () => {
        const customLabel = (content: MentionContent): string =>
            content.entityName ? `${ResolveRecordLinkLabel(content)} (${content.entityName})` : ResolveRecordLinkLabel(content);
        const input = `Northwind (Accounts) @{"_mode":"mention","type":"record","entityName":"Accounts","name":"Northwind","ID":"1"}`;
        expect(FormatRoutinePlainResultSummary(input, customLabel)).toBe('Northwind (Accounts)');
    });

    it('converts agent, user, and entity mentions via ConversationUtility.ToPlainText', () => {
        const input = `Asked @{"_mode":"mention","type":"agent","id":"a1","name":"Planner"} and @{"_mode":"mention","type":"user","id":"u1","name":"Elena"} about @{"_mode":"mention","type":"entity","id":"e1","name":"Accounts"}`;
        expect(FormatRoutinePlainResultSummary(input)).toBe('Asked @Planner and @Elena about #Accounts');
    });
});
