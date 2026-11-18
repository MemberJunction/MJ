import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
    CanonGraphExpansionService,
    GetRegisteredGraphExpansionService,
    RegisterGraphExpansionService,
    type IGraphExpansionService,
} from '@memberjunction/core-entities';
import { RegisterSemanticGraphExpansionService } from '../services/RegisterSemanticGraphExpansion';

describe('RegisterSemanticGraphExpansionService', () => {
    beforeEach(() => RegisterGraphExpansionService(null));

    it('registers the engine-backed graph expansion service for the process', () => {
        expect(GetRegisteredGraphExpansionService()).toBeNull();
        expect(RegisterSemanticGraphExpansionService()).toBe(true);
        expect(GetRegisteredGraphExpansionService()).toBeInstanceOf(CanonGraphExpansionService);
    });

    it('keeps a service the host registered first', () => {
        const hostService: IGraphExpansionService = { ResolveSeeds: async () => [], Expand: async () => ({ Nodes: [], Edges: [] }) };
        RegisterGraphExpansionService(hostService);
        expect(RegisterSemanticGraphExpansionService()).toBe(false);
        expect(GetRegisteredGraphExpansionService()).toBe(hostService);
    });

    it('is called by Serve at startup', () => {
        const source = readFileSync(fileURLToPath(new URL('../index.ts', import.meta.url)), 'utf8');
        const serveBody = source.slice(source.indexOf('export const Serve = async'));
        expect(serveBody).toMatch(/\n\s*RegisterSemanticGraphExpansionService\(\);/);
    });
});
