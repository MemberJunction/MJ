/**
 * Template injection through a tag inside a string literal.
 *
 * `WHERE r.ID = '{{ agentRunID }}'` puts the caller's value between quotes the template wrote, so a
 * value carrying its own quote closes the literal and appends a predicate. A tag inside a string
 * literal is refused at save and on every run, by the provider's render gate in front of this
 * processor. The processor itself refuses a value that no SQL filter formats unless it is a plain
 * number or a sort direction (see `queryUnfilteredValues.test.ts`), so the injection is refused here
 * too. These tests render the shipped `GetAgentRunTree` SQL (read from the repo, SQL comments
 * removed as the provider removes them) and a minimal synthetic copy of the same shape.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RunQuerySQLFilterManager } from '@memberjunction/core';
import type { MJQueryParameterEntity } from '@memberjunction/core-entities';
import { QueryParameterProcessor } from '../queryParameterProcessor.js';
import type { QueryProcessingResult, QueryTemplateInput } from '../queryParameterProcessor.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const AGENT_RUN_TREE_SOURCE = readFileSync(resolve(REPO_ROOT, 'metadata/queries/SQL/get-agent-run-tree.sql'), 'utf8');

/**
 * The SQL without its comments. The provider removes SQL comments before a render
 * (`TemplateUnit.Read`), so the tags the header comment mentions are never rendered.
 */
const AGENT_RUN_TREE_SQL = AGENT_RUN_TREE_SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');

/** The same shape as the shipped query's anchor predicate, and nothing else. */
const SYNTHETIC_SQL = "SELECT r.ID FROM [__mj].[vwAIAgentRuns] r WHERE r.ID = '{{ agentRunID }}'";

const INJECTION = "x' OR '1'='1";
const INJECTED_PREDICATE = "r.ID = 'x' OR '1'='1'";

type ParamFields = Pick<MJQueryParameterEntity, 'Name' | 'Type' | 'IsRequired' | 'DefaultValue' | 'ValidationFilters' | 'IsServerSet'>;

function param(fields: ParamFields): MJQueryParameterEntity {
    const partial: Partial<MJQueryParameterEntity> = { ...fields };
    return partial as MJQueryParameterEntity;
}

/** The parameters CodeGen auto-detects for GetAgentRunTree (it declares none in metadata). */
const PARAMETERS: MJQueryParameterEntity[] = [
    param({ Name: 'agentRunID', Type: 'string', IsRequired: true, DefaultValue: null, ValidationFilters: null, IsServerSet: false }),
    param({ Name: 'maxDepth', Type: 'number', IsRequired: false, DefaultValue: null, ValidationFilters: null, IsServerSet: false }),
];

function render(sql: string, agentRunID: string): QueryProcessingResult {
    const query: QueryTemplateInput = { SQL: sql, UsesTemplate: true, Parameters: PARAMETERS };
    return QueryParameterProcessor.ProcessQueryTemplate(query, { agentRunID, maxDepth: 100 });
}

/** True when the template was refused: a failure result, or a throw. */
function isRefused(sql: string, agentRunID: string): boolean {
    try {
        return !render(sql, agentRunID).success;
    } catch {
        return true;
    }
}

describe('Template injection: a tag inside a string literal', () => {
    beforeEach(() => {
        RunQuerySQLFilterManager.Instance.SetPlatform('sqlserver');
    });

    it('the shipped GetAgentRunTree SQL no longer quotes the tag: it formats the value with sqlString', () => {
        expect(AGENT_RUN_TREE_SQL).not.toContain("WHERE r.ID = '{{ agentRunID }}'");
        expect(AGENT_RUN_TREE_SQL).toContain('WHERE r.ID = {{ agentRunID | sqlString }}');
    });

    it('renders a benign agentRunID into the shipped template (setup works)', () => {
        const id = '6f1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
        const result = render(AGENT_RUN_TREE_SQL, id);
        expect(result.success).toBe(true);
        expect(result.processedSQL).toMatch(new RegExp(`r\\.ID = N?'${id}'`));
    });

    it('a quoted tag no longer lets the injected value close the literal: the unfiltered value is refused (synthetic copy)', () => {
        expect(isRefused(SYNTHETIC_SQL, INJECTION)).toBe(true);
        const result = render(SYNTHETIC_SQL, INJECTION);
        expect(result.processedSQL).not.toContain(INJECTED_PREDICATE);
        expect(result.error).toContain("Parameter 'agentRunID' is written into the SQL without a SQL filter");
    });

    it('the shipped GetAgentRunTree SQL keeps the injected value inside one escaped literal', () => {
        const result = render(AGENT_RUN_TREE_SQL, INJECTION);
        expect(result.success).toBe(true);
        expect(result.processedSQL).not.toContain(INJECTED_PREDICATE);
        expect(result.processedSQL).toMatch(/r\.ID = N?'x'' OR ''1''=''1'/);
    });

    // Refusing the TEMPLATE is not this processor's job: the gate (GenericDatabaseProvider
    // TemplateUnit.AssertRenderable) refuses a saved query with a value tag inside a string literal on
    // every run, and a save refuses it too; those tests live with the gate (renderPipeline.test.ts,
    // queryRun.fieldSecurity.test.ts). This processor refuses the VALUE.
});
