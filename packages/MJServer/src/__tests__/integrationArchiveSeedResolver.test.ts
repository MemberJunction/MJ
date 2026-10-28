/**
 * The archive seed GraphQL operations. type-graphql decorators cannot load under vitest, so the
 * resolver cannot be instantiated here; this pins, in the source, that the four operations exist,
 * that every one of them runs the action-authorization guards, that the job-scoped ones also
 * check the caller can read the job's company integration, and that the resolver shares the
 * process's one job instance (whose re-entry guard `Finish`/`Resume` rely on).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const resolverPath = join(__dirname, '..', 'resolvers', 'IntegrationArchiveSeedResolver.ts');

function stripComments(text: string): string {
    return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function readSource(path: string): string {
    return existsSync(path) ? stripComments(readFileSync(path, 'utf8')) : '';
}

const source = readSource(resolverPath);
const indexSource = readSource(join(__dirname, '..', 'index.ts'));

/** The source from `marker` up to the next class member that starts a new method (or the end). */
function memberBody(marker: string): string {
    const start = source.indexOf(marker);
    expect(start, `not found in resolver: ${marker}`).toBeGreaterThan(-1);
    const rest = source.slice(start + marker.length);
    const next = rest.search(/\n {2}(@(Mutation|Query)\(|(public|private) )/);
    return next === -1 ? rest : rest.slice(0, next);
}

const OPERATIONS: Array<[string, 'Mutation' | 'Query']> = [
    ['IntegrationArchiveSeedStart', 'Mutation'],
    ['IntegrationArchiveSeedSelectTables', 'Mutation'],
    ['IntegrationArchiveSeedFinish', 'Mutation'],
    ['IntegrationArchiveSeedState', 'Query'],
];

describe('IntegrationArchiveSeedResolver', () => {
    it('exists', () => {
        expect(existsSync(resolverPath)).toBe(true);
    });

    it.each(OPERATIONS)('declares %s as a %s', (name, kind) => {
        expect(source).toMatch(new RegExp(`@${kind}\\(\\(\\) => \\w+\\)\\s*async ${name}\\(`));
    });

    it.each(OPERATIONS)('%s runs the action authorization guards', name => {
        expect(memberBody(`async ${name}(`)).toContain('this.authorize(');
    });

    it('the shared guard checks the API key scope and the action run permission, in that order', () => {
        const guard = memberBody('private async authorize(');
        const scope = guard.indexOf('CheckAPIKeyScopeAuthorization(');
        const run = guard.indexOf('AssertCanRunAction(');
        expect(scope).toBeGreaterThan(-1);
        expect(run).toBeGreaterThan(scope);
        expect(guard.indexOf('ActionEngineServer.Instance.Config(')).toBeLessThan(scope);
    });

    it.each(OPERATIONS.slice(1))('%s requires the job company integration to be readable', name => {
        expect(memberBody(`async ${name}(`)).toContain('this.loadReadableJob(');
    });

    it('IntegrationArchiveSeedSelectTables answers without reading the job back (the apply restarts the API)', () => {
        const body = memberBody('async IntegrationArchiveSeedSelectTables(');
        expect(body.split('this.loadReadableJob(').length - 1).toBe(1);
        expect(body).not.toContain('this.stateOutput(');
    });

    it('the readability check is a RunView on company integrations as the caller', () => {
        const check = memberBody('private async userCanReadCompanyIntegration(');
        expect(check).toContain("EntityName: 'MJ: Company Integrations'");
        expect(check).toContain('EscapeSQLString(');
    });

    it('uses the shared job instance, never its own', () => {
        expect(source).toContain('ArchiveSeedJobInstance');
        expect(source).not.toContain('new ArchiveSeedJob(');
    });

    it('index.ts dispatches resumes on the shared instance', () => {
        expect(indexSource).toContain('ArchiveSeedJobInstance.Resume(');
        expect(indexSource).not.toContain('new ArchiveSeedJob(');
    });
});
