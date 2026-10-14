/**
 * A scope's query template renders the search query from the conversation. The query is plain text for the search
 * providers, not HTML, so it must render without HTML escaping: `Affineur & Owner` must not be searched for as
 * `Affineur &amp; Owner`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { BaseEntity, EntityInfo, UserInfo } from '@memberjunction/core';
import {
    MJAIAgentEntity,
    MJAIAgentSearchScopeEntity,
    MJSearchScopeEntity,
    MJTemplateContentEntity,
    MJTemplateEntityExtended,
} from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { TemplateEngineServer } from '@memberjunction/templates';
import { AgentPreExecutionRAG } from '../agent-pre-execution-rag';

vi.mock('@memberjunction/search-engine', () => ({
    SearchEngine: { Instance: { Search: vi.fn() } },
    SearchFusion: class { CrossScopeFusion() { return []; } Deduplicate<T>(x: T): T { return x; } },
}));

/** A real entity object of the given class, whose metadata holds only the named fields, hydrated with `values`. */
function entity<T extends BaseEntity>(ctor: new (info: EntityInfo) => T, name: string, values: Record<string, string>): T {
    const entityId = `entity-${name}`;
    const info = new EntityInfo({
        ID: entityId, Name: name,
        Fields: Object.keys(values).map((field, index) => ({
            ID: `${entityId}-${field}`, EntityID: entityId, Entity: name, Sequence: index + 1, Name: field,
            Type: field.endsWith('ID') ? 'uniqueidentifier' : 'nvarchar', IsPrimaryKey: field === 'ID',
        })),
    });
    const record = new ctor(info);
    record.Hydrate(values);
    return record;
}

describe('AgentPreExecutionRAG renders a scope query template without HTML escaping', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('finds the template the scope references by ID and renders it with autoescape: false', async () => {
        const template = entity(MJTemplateEntityExtended, 'MJ: Templates', { ID: 'query-template', Name: 'Query' });
        const content = entity(MJTemplateContentEntity, 'MJ: Template Contents', { ID: 'query-content', TemplateID: 'query-template', TemplateText: '{{ lastUserMessage }}' });
        template.Content = [content];
        const engine = TemplateEngineServer.Instance;
        vi.spyOn(engine, 'Config').mockResolvedValue(undefined);
        // the engine's cache knows the template by its ID only; a lookup by name finds nothing
        vi.spyOn(engine, 'FindTemplateByID').mockImplementation((id: string) => (UUIDsEqual(id, template.ID) ? template : undefined));
        const findByName = vi.spyOn(engine, 'FindTemplate').mockImplementation(() => { throw new Error('the query template is looked up by ID, not by name'); });
        const render = vi.spyOn(engine, 'RenderTemplate').mockResolvedValue({ Success: true, Output: 'Affineur & Owner', Message: undefined });
        const row = entity(MJAIAgentSearchScopeEntity, 'MJ: AI Agent Search Scopes', { ID: 'row-1', QueryTemplateID: 'query-template' });
        const scope = entity(MJSearchScopeEntity, 'MJ: Search Scopes', { ID: 'scope-1', Name: 'Cheese', Description: 'Cheese makers' });
        const agent = entity(MJAIAgentEntity, 'MJ: AI Agents', { ID: 'agent-1', Name: 'Sage', Description: 'Answers' });

        // resolveQuery is private; element access reaches it without widening the class's type
        const query = await new AgentPreExecutionRAG()['resolveQuery'](row, scope, { agent, lastUserMessage: 'Affineur & Owner', contextUser: new UserInfo() });

        expect(render).toHaveBeenCalledTimes(1);
        expect(render.mock.calls[0][0]).toBe(template);
        expect(render.mock.calls[0][1]).toBe(template.Content[0]);
        expect(render.mock.calls[0][5]).toEqual({ autoescape: false });
        expect(findByName).not.toHaveBeenCalled();
        expect(query).toBe('Affineur & Owner');
    });
});
