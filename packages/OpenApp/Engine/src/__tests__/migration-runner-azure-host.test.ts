import { describe, it, expect } from 'vitest';
import { IsAzureSqlHost } from '../install/migration-runner.js';

describe('IsAzureSqlHost (CodeQL js/incomplete-url-substring-sanitization)', () => {
    it('matches Azure SQL server host names', () => {
        expect(IsAzureSqlHost('myserver.database.windows.net')).toBe(true);
        expect(IsAzureSqlHost(' MyServer.Database.Windows.Net ')).toBe(true);
    });

    it('does not match the domain elsewhere in the host', () => {
        expect(IsAzureSqlHost('myserver.database.windows.net.example.com')).toBe(false);
        expect(IsAzureSqlHost('localhost')).toBe(false);
    });
});
