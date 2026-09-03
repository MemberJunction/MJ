import { describe, it, expect } from 'vitest';
import { CliProcessId, MatchesProcess, NormalizeProcessId, ProcessIdMatches, ResolveMostSpecific } from '../process-id';

describe('NormalizeProcessId', () => {
    it('lowercases, trims and collapses empty segments', () => {
        expect(NormalizeProcessId(' CLI : Sync :push ')).toBe('cli:sync:push');
        expect(NormalizeProcessId('cli::push')).toBe('cli:push');
        expect(NormalizeProcessId('')).toBe('');
    });
});

describe('CliProcessId', () => {
    it('prefixes with cli and accepts both oclif id spellings', () => {
        expect(CliProcessId('sync:push')).toBe('cli:sync:push');
        expect(CliProcessId('sync push')).toBe('cli:sync:push');
        expect(CliProcessId('app install')).toBe('cli:app:install');
    });

    it('is a bare cli for an unknown command id', () => {
        expect(CliProcessId(undefined)).toBe('cli');
        expect(CliProcessId('')).toBe('cli');
    });
});

describe('ProcessIdMatches', () => {
    it('matches exact ids and ancestor prefixes, segment-aware', () => {
        expect(ProcessIdMatches('cli:sync:push', 'cli:sync:push')).toBe(true);
        expect(ProcessIdMatches('cli:sync:push', 'cli:sync')).toBe(true);
        expect(ProcessIdMatches('cli:sync:push', 'cli')).toBe(true);
        expect(ProcessIdMatches('cli:sync:push', '*')).toBe(true);
    });

    it('does NOT match a sibling command or a string prefix that is not a segment', () => {
        expect(ProcessIdMatches('cli:sync:push', 'cli:migrate')).toBe(false);
        expect(ProcessIdMatches('cli:syncother', 'cli:sync')).toBe(false);
        expect(ProcessIdMatches('cli', 'cli:sync')).toBe(false);
        expect(ProcessIdMatches('mjapi', 'cli')).toBe(false);
    });

    it('is case-insensitive', () => {
        expect(ProcessIdMatches('CLI:Sync:Push', 'cli:sync')).toBe(true);
    });
});

describe('MatchesProcess', () => {
    it('loads everywhere when no filter is set', () => {
        expect(MatchesProcess('mjapi', undefined)).toBe(true);
        expect(MatchesProcess('cli:migrate', { Processes: [] })).toBe(true);
    });

    it('restricts to the listed processes (prefix semantics)', () => {
        const filter = { Processes: ['cli:sync'] };
        expect(MatchesProcess('cli:sync:push', filter)).toBe(true);
        expect(MatchesProcess('cli:sync:pull', filter)).toBe(true);
        expect(MatchesProcess('cli:migrate', filter)).toBe(false);
        expect(MatchesProcess('mjapi', filter)).toBe(false);
    });

    it('applies ExcludeProcesses after Processes', () => {
        expect(MatchesProcess('cli:migrate', { ExcludeProcesses: ['cli:migrate'] })).toBe(false);
        expect(MatchesProcess('cli:sync:push', { ExcludeProcesses: ['cli:migrate'] })).toBe(true);
        expect(MatchesProcess('cli:sync:push', { Processes: ['cli'], ExcludeProcesses: ['cli:sync'] })).toBe(false);
    });

    it('ignores blank pattern strings rather than treating them as match-all', () => {
        expect(MatchesProcess('mjapi', { Processes: [' ', ''] })).toBe(true);
        expect(MatchesProcess('mjapi', { ExcludeProcesses: [''] })).toBe(true);
    });
});

describe('ResolveMostSpecific', () => {
    it('picks the deepest matching key', () => {
        const map = { '*': 'a', cli: 'b', 'cli:sync': 'c', 'cli:sync:push': 'd' };
        expect(ResolveMostSpecific('cli:sync:push', map)).toBe('d');
        expect(ResolveMostSpecific('cli:sync:pull', map)).toBe('c');
        expect(ResolveMostSpecific('cli:migrate', map)).toBe('b');
        expect(ResolveMostSpecific('mjapi', map)).toBe('a');
    });

    it('returns undefined when nothing matches', () => {
        expect(ResolveMostSpecific('mjapi', { cli: 'b' })).toBeUndefined();
        expect(ResolveMostSpecific('mjapi', undefined)).toBeUndefined();
    });
});
