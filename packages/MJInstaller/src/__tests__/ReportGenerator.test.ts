import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReportGenerator, type ReportData, type ConfigFileSnapshot, type ServiceLogCapture } from '../logging/ReportGenerator.js';
import { Diagnostics, type EnvironmentInfo, type DiagnosticCheck } from '../models/Diagnostics.js';
import type { InstallStateData } from '../models/InstallState.js';
import type { InstallResult } from '../models/InstallPlan.js';
import type { PartialInstallConfig } from '../models/InstallConfig.js';
import type { LogEntry } from '../logging/EventLogger.js';

// Mock the FileSystemAdapter with controllable per-call behavior
const mockWriteText = vi.fn().mockResolvedValue(undefined);
const mockFileExists = vi.fn().mockResolvedValue(false);
const mockDirectoryExists = vi.fn().mockResolvedValue(false);
const mockReadText = vi.fn().mockResolvedValue('');

vi.mock('../adapters/FileSystemAdapter.js', () => ({
  FileSystemAdapter: class MockFileSystemAdapter {
    WriteText = mockWriteText;
    FileExists = mockFileExists;
    DirectoryExists = mockDirectoryExists;
    ReadText = mockReadText;
  },
}));

describe('ReportGenerator', () => {
  let generator: ReportGenerator;
  const mockEnvironment: EnvironmentInfo = {
    OS: 'win32 10.0.19045 (x64)',
    NodeVersion: 'v22.11.0',
    NpmVersion: '10.9.0',
    Architecture: 'x64',
  };

  beforeEach(() => {
    generator = new ReportGenerator();
  });

  describe('Render', () => {
    it('should render header with timestamp and trigger', () => {
      const result = generator.Render({ Trigger: 'doctor-report' });
      expect(result).toContain('# MJ Diagnostic Report');
      expect(result).toContain('**Trigger:** doctor-report');
    });

    it('should render environment section', () => {
      const result = generator.Render({ Environment: mockEnvironment });
      expect(result).toContain('## Environment');
      expect(result).toContain('v22.11.0');
      expect(result).toContain('10.9.0');
      expect(result).toContain('win32');
      expect(result).toContain('x64');
    });

    it('should render install result section', () => {
      const installResult: InstallResult = {
        Success: false,
        DurationMs: 125000,
        Warnings: ['Build partial', 'Audit warnings'],
        PhasesCompleted: ['preflight', 'scaffold', 'configure'],
        PhasesFailed: ['dependencies'],
      };
      const result = generator.Render({ InstallResult: installResult });
      expect(result).toContain('## Install Result');
      expect(result).toContain('**FAILED**');
      expect(result).toContain('2m 5s');
      expect(result).toContain('preflight, scaffold, configure');
      expect(result).toContain('dependencies');
      expect(result).toContain('### Warnings');
      expect(result).toContain('Build partial');
    });

    it('should render install state section', () => {
      const state: InstallStateData = {
        Tag: 'v5.9.0',
        StartedAt: '2026-03-11T10:00:00.000Z',
        Phases: {
          preflight: { Status: 'completed', CompletedAt: '2026-03-11T10:00:05.000Z' },
          scaffold: { Status: 'completed', CompletedAt: '2026-03-11T10:01:00.000Z' },
          configure: { Status: 'failed', FailedAt: '2026-03-11T10:01:30.000Z', Error: 'Config validation failed' },
        },
      };
      const result = generator.Render({ InstallState: state });
      expect(result).toContain('## Install State');
      expect(result).toContain('v5.9.0');
      expect(result).toContain('completed');
      expect(result).toContain('failed');
      expect(result).toContain('Config validation failed');
      // Pending phases should also appear
      expect(result).toContain('pending');
    });

    it('should render diagnostics section', () => {
      const diagnostics = new Diagnostics(mockEnvironment);
      diagnostics.AddCheck({ Name: 'Node.js', Status: 'pass', Message: 'v22.11.0' });
      diagnostics.AddCheck({ Name: 'Disk space', Status: 'fail', Message: 'Only 1 GB free', SuggestedFix: 'Free up space' });
      const result = generator.Render({ Diagnostics: diagnostics });
      expect(result).toContain('## Diagnostic Checks');
      expect(result).toContain('**Failures:** 1');
      expect(result).toContain('**Passed:** 1');
      expect(result).toContain('Node.js');
      expect(result).toContain('Free up space');
    });

    it('should render event log section', () => {
      const entries: LogEntry[] = [
        { Timestamp: '2026-03-11T10:00:01.123Z', Level: 'info', Message: 'Phase started: preflight', Source: 'phase:start', Phase: 'preflight' },
        { Timestamp: '2026-03-11T10:00:05.456Z', Level: 'error', Message: '[NPM_INSTALL_FAILED] install failed', Source: 'error', Phase: 'dependencies' },
      ];
      const result = generator.Render({ EventLog: entries });
      expect(result).toContain('## Event Log');
      expect(result).toContain('2 entries captured');
      expect(result).toContain('Phase started: preflight');
      expect(result).toContain('NPM_INSTALL_FAILED');
    });

    it('should render all sections in a complete report', () => {
      const diagnostics = new Diagnostics(mockEnvironment);
      diagnostics.AddCheck({ Name: 'Node.js', Status: 'pass', Message: 'OK' });

      const data: ReportData = {
        TargetDir: '/path/to/install',
        Trigger: 'install-failure',
        Environment: mockEnvironment,
        InstallResult: { Success: false, DurationMs: 60000, Warnings: [], PhasesCompleted: ['preflight'], PhasesFailed: ['scaffold'] },
        InstallState: { Tag: 'v5.9.0', StartedAt: '2026-03-11T10:00:00Z', Phases: {} },
        Config: { DatabaseHost: 'localhost', DatabasePort: 1433, CodeGenPassword: 'secret123' },
        Diagnostics: diagnostics,
        EventLog: [{ Timestamp: '2026-03-11T10:00:00Z', Level: 'info', Message: 'test', Source: 'log' }],
      };

      const result = generator.Render(data);
      expect(result).toContain('# MJ Diagnostic Report');
      expect(result).toContain('## Environment');
      expect(result).toContain('## Install Result');
      expect(result).toContain('## Install State');
      expect(result).toContain('## Configuration');
      expect(result).toContain('## Diagnostic Checks');
      expect(result).toContain('## Key Files');
      expect(result).toContain('## Event Log');
    });
  });

  describe('SanitizeConfig', () => {
    it('should redact password fields', () => {
      const config: PartialInstallConfig = {
        DatabaseHost: 'localhost',
        CodeGenPassword: 'supersecret',
        APIPassword: 'anothersecret',
      };
      const sanitized = generator.SanitizeConfig(config);
      expect(sanitized['DatabaseHost']).toBe('localhost');
      expect(sanitized['CodeGenPassword']).toBe('[REDACTED]');
      expect(sanitized['APIPassword']).toBe('[REDACTED]');
    });

    it('should redact API keys', () => {
      const config: PartialInstallConfig = {
        OpenAIKey: 'sk-test123',
        AnthropicKey: 'ak-test456',
        MistralKey: 'mk-test789',
      };
      const sanitized = generator.SanitizeConfig(config);
      expect(sanitized['OpenAIKey']).toBe('[REDACTED]');
      expect(sanitized['AnthropicKey']).toBe('[REDACTED]');
      expect(sanitized['MistralKey']).toBe('[REDACTED]');
    });

    it('should redact encryption key', () => {
      const config: PartialInstallConfig = {
        BaseEncryptionKey: 'base64encodedkey==',
      };
      const sanitized = generator.SanitizeConfig(config);
      expect(sanitized['BaseEncryptionKey']).toBe('[REDACTED]');
    });

    it('should show (not set) for empty sensitive fields', () => {
      const config: PartialInstallConfig = {
        CodeGenPassword: '',
        APIPassword: undefined,
      };
      const sanitized = generator.SanitizeConfig(config);
      expect(sanitized['CodeGenPassword']).toBe('(not set)');
      expect(sanitized['APIPassword']).toBe('(not set)');
    });

    it('should redact sensitive auth provider values', () => {
      const config: PartialInstallConfig = {
        AuthProvider: 'auth0',
        AuthProviderValues: {
          Domain: 'test.auth0.com',
          ClientID: 'abc123',
          ClientSecret: 'secret-value',
        },
      };
      const sanitized = generator.SanitizeConfig(config);
      const authValues = sanitized['AuthProviderValues'] as Record<string, unknown>;
      expect(authValues['Domain']).toBe('test.auth0.com');
      expect(authValues['ClientID']).toBe('abc123');
      expect(authValues['ClientSecret']).toBe('[REDACTED]');
    });

    it('should preserve non-sensitive fields', () => {
      const config: PartialInstallConfig = {
        DatabaseHost: 'myserver.com',
        DatabasePort: 1433,
        DatabaseName: 'MemberJunction',
        APIPort: 4000,
        ExplorerPort: 4200,
        AuthProvider: 'entra',
      };
      const sanitized = generator.SanitizeConfig(config);
      expect(sanitized['DatabaseHost']).toBe('myserver.com');
      expect(sanitized['DatabasePort']).toBe(1433);
      expect(sanitized['DatabaseName']).toBe('MemberJunction');
      expect(sanitized['APIPort']).toBe(4000);
      expect(sanitized['ExplorerPort']).toBe(4200);
      expect(sanitized['AuthProvider']).toBe('entra');
    });
  });

  describe('Markdown escaping', () => {
    it('should escape pipe characters in table cells', () => {
      const diagnostics = new Diagnostics(mockEnvironment);
      diagnostics.AddCheck({
        Name: 'Test | Check',
        Status: 'pass',
        Message: 'Value with | pipe',
      });
      const result = generator.Render({ Diagnostics: diagnostics });
      expect(result).toContain('Test \\| Check');
      expect(result).toContain('Value with \\| pipe');
    });
  });

  describe('Render ConfigFiles section', () => {
    it('should render config file snapshots with sanitized content', () => {
      const configFiles: ConfigFileSnapshot[] = [
        { RelativePath: '.env', Exists: true, Content: 'DB_HOST=localhost\nDB_PASSWORD=[REDACTED]' },
        { RelativePath: 'apps/MJAPI/.env', Exists: false, Content: null },
      ];
      const result = generator.Render({ ConfigFiles: configFiles });
      expect(result).toContain('## Configuration Files (Sanitized)');
      expect(result).toContain('### .env');
      expect(result).toContain('DB_HOST=localhost');
      expect(result).toContain('DB_PASSWORD=[REDACTED]');
      expect(result).toContain('### apps/MJAPI/.env');
      expect(result).toContain('**Not found**');
    });

    it('should not render config files section when empty', () => {
      const result = generator.Render({ ConfigFiles: [] });
      expect(result).not.toContain('## Configuration Files');
    });
  });

  describe('Render ServiceLogs section', () => {
    it('should render service startup logs', () => {
      const serviceLogs: ServiceLogCapture[] = [
        {
          Service: 'MJAPI',
          Started: true,
          Output: ['Starting server...', 'Server ready at http://localhost:4000'],
          DurationMs: 8000,
          FailureReason: undefined,
        },
        {
          Service: 'Explorer',
          Started: false,
          Output: ['Compiling...', 'Error: Cannot find module @angular/core'],
          DurationMs: 30000,
          FailureReason: 'Error: Cannot find module @angular/core',
        },
      ];
      const result = generator.Render({ ServiceLogs: serviceLogs });
      expect(result).toContain('## Service Startup Logs');
      expect(result).toContain('### MJAPI (STARTED, 8s)');
      expect(result).toContain('Server ready at http://localhost:4000');
      expect(result).toContain('### Explorer (FAILED, 30s)');
      expect(result).toContain('Cannot find module @angular/core');
      expect(result).toContain('**Failure reason:**');
    });

    it('should not render service logs section when empty', () => {
      const result = generator.Render({ ServiceLogs: [] });
      expect(result).not.toContain('## Service Startup Logs');
    });
  });

  describe('SnapshotConfigFiles', () => {
    beforeEach(() => {
      mockFileExists.mockReset().mockResolvedValue(false);
      mockReadText.mockReset().mockResolvedValue('');
    });

    it('should return not-found entries when no config files exist', async () => {
      const snapshots = await generator.SnapshotConfigFiles('/fake/dir');
      expect(snapshots.length).toBeGreaterThan(0);
      for (const snap of snapshots) {
        expect(snap.Exists).toBe(false);
        expect(snap.Content).toBeNull();
      }
    });

    it('should read and sanitize .env files', async () => {
      // Make .env exist at root
      mockFileExists.mockImplementation(async (filePath: string) => {
        return filePath.endsWith('.env') && !filePath.includes('MJAPI');
      });
      mockReadText.mockResolvedValue(
        'DB_HOST=localhost\nCODEGEN_DB_PASSWORD=secret123\nGRAPHQL_PORT=4000'
      );

      const snapshots = await generator.SnapshotConfigFiles('/fake/dir');
      const envSnap = snapshots.find((s) => s.RelativePath === '.env');
      expect(envSnap).toBeDefined();
      expect(envSnap!.Exists).toBe(true);
      expect(envSnap!.Content).toContain('DB_HOST=localhost');
      expect(envSnap!.Content).toContain('CODEGEN_DB_PASSWORD=[REDACTED]');
      expect(envSnap!.Content).toContain('GRAPHQL_PORT=4000');
      expect(envSnap!.Content).not.toContain('secret123');
    });

    it('should sanitize TypeScript environment files', async () => {
      mockFileExists.mockImplementation(async (filePath: string) => {
        return filePath.includes('environment.ts') && !filePath.includes('development');
      });
      mockReadText.mockResolvedValue(
        `export const environment = {\n  AUTH_TYPE: 'msal',\n  CLIENT_SECRET: 'my-secret-value',\n  CLIENT_ID: 'abc-123'\n};`
      );

      const snapshots = await generator.SnapshotConfigFiles('/fake/dir');
      const envTs = snapshots.find((s) => s.RelativePath.includes('environment.ts'));
      expect(envTs).toBeDefined();
      expect(envTs!.Content).toContain("CLIENT_SECRET: '[REDACTED]'");
      expect(envTs!.Content).not.toContain('my-secret-value');
      expect(envTs!.Content).toContain("CLIENT_ID: 'abc-123'");
    });
  });

  describe('CheckKeyFiles', () => {
    beforeEach(() => {
      mockFileExists.mockReset().mockResolvedValue(false);
      mockDirectoryExists.mockReset().mockResolvedValue(false);
    });

    it('should check file and directory existence', async () => {
      mockFileExists.mockImplementation(async (filePath: string) => {
        return filePath.endsWith('package.json') || filePath.endsWith('.env');
      });
      mockDirectoryExists.mockImplementation(async (filePath: string) => {
        return filePath.endsWith('node_modules');
      });

      const results = await generator.CheckKeyFiles('/fake/dir');
      const pkgJson = results.find((r) => r.Path === 'package.json');
      const nodeMods = results.find((r) => r.Path === 'node_modules');
      const lockFile = results.find((r) => r.Path === 'package-lock.json');

      expect(pkgJson?.Exists).toBe(true);
      expect(nodeMods?.Exists).toBe(true);
      expect(lockFile?.Exists).toBe(false);
    });
  });
});
