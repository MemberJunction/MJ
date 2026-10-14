import { describe, it, expect } from 'vitest';
import { ResolveAPIRootURL } from '../generic/apiRootUrl';

describe('ResolveAPIRootURL', () => {
    it('strips a trailing /graphql so a prefixed host keeps its API root', () => {
        expect(ResolveAPIRootURL('https://host/api/graphql')).toBe('https://host/api');
        expect(ResolveAPIRootURL('https://host/api/graphql/')).toBe('https://host/api');
        expect(ResolveAPIRootURL('https://host/api/')).toBe('https://host/api');
    });

    it('leaves a root-mounted host unchanged', () => {
        expect(ResolveAPIRootURL('http://localhost:4000/')).toBe('http://localhost:4000');
        expect(ResolveAPIRootURL('https://api.example.com/graphql')).toBe('https://api.example.com');
    });

    it('prefers an explicit API root', () => {
        expect(ResolveAPIRootURL('https://host/gql', 'https://host/api/')).toBe('https://host/api');
        expect(ResolveAPIRootURL('https://host/api/graphql', '  ')).toBe('https://host/api');
        expect(ResolveAPIRootURL('https://host/api/graphql', null)).toBe('https://host/api');
    });

    it('handles a long run of slashes (linear trim, no polynomial regex)', () => {
        const slashes = '/'.repeat(100_000);
        expect(ResolveAPIRootURL(`https://host/api${slashes}graphql${slashes}`)).toBe('https://host/api');
        expect(ResolveAPIRootURL(`https://host/api/graphql${slashes}`)).toBe('https://host/api');
        expect(ResolveAPIRootURL('x', `https://host/api${slashes}`)).toBe('https://host/api');
    });
});
