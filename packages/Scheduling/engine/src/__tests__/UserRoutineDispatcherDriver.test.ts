import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EntityInfo, UserInfo } from '@memberjunction/core';
import {
    MJTemplateContentEntity,
    MJTemplateEntityExtended,
    MJUserRoutineEntity,
    MJUserRoutineRunEntity,
} from '@memberjunction/core-entities';
import { ConversationUtility } from '@memberjunction/ai-core-plus';
import { TemplateEngineServer } from '@memberjunction/templates';
import { UserRoutineDispatcherDriver } from '../drivers/UserRoutineDispatcherDriver';

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

    it('cleans mention tokens and preserves HTML autoescaping on HTML-only templates', async () => {
        const driver = new TestRoutineDispatcherDriver();
        const htmlContent = createTemplateContentEntity(
            'content-html-mentions',
            'HTML',
            '<div>{{ resultSummary }}</div>'
        );
        driver.TemplateToResolve = createTemplateEntity([htmlContent]);

        const cleanMentionsSpy = vi.spyOn(ConversationUtility, 'CleanMentions');
        const routine = createRoutineEntity('Account Watch');
        const summary = [
            `Reviewed Northwind @{"_mode":"mention","type":"record","entityName":"Accounts","name":"Northwind","ID":"acc-1"}`,
            `& Co with @{"_mode":"mention","type":"user","id":"user-2","name":"Elena <Lead>"}`,
            `and flagged @{"_mode":"mention","type":"record","entityName":"Accounts","name":"Contoso","ID":"acc-2"}.`,
        ].join(' ');
        const run = createRunEntity('Success', summary);

        const output = await driver.RenderNotification(routine, run, TEST_USER);

        expect(cleanMentionsSpy).toHaveBeenCalledTimes(1);
        expect(output).toBe('<div>Reviewed Northwind &amp; Co with @Elena &lt;Lead&gt; and flagged Contoso.</div>');
        expect(output).not.toContain('_mode');
        expect(output).not.toContain('Northwind Northwind');
    });

    it('cleans HTML-escaped mention tokens even when custom HTML templates reference run.ResultSummary directly', async () => {
        const driver = new TestRoutineDispatcherDriver();
        const htmlContent = createTemplateContentEntity(
            'content-html-run-direct',
            'HTML',
            '<p><strong>{{ routine.Name }}</strong>: {{ run.ResultSummary }}</p>'
        );
        driver.TemplateToResolve = createTemplateEntity([htmlContent]);

        const routine = createRoutineEntity('Account Watch');
        const summary =
            `Reviewed Northwind @{"_mode":"mention","type":"record","entityName":"Accounts","name":"Northwind","ID":"acc-1"} ` +
            `with @{"_mode":"mention","type":"user","id":"user-2","name":"Elena Vance"}.`;
        const run = createRunEntity('Success', summary);

        const output = await driver.RenderNotification(routine, run, TEST_USER);

        expect(output).toBe('<p><strong>Account Watch</strong>: Reviewed Northwind with @Elena Vance.</p>');
        expect(output).not.toContain('_mode');
        expect(output).not.toContain('Northwind Northwind');
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
