import type { InstallConfig, PartialInstallConfig } from '../../models/InstallConfig.js';
import type { VersionInfo } from '../../models/VersionInfo.js';
import type { ProcessResult } from '../../adapters/ProcessRunner.js';
import { InstallPlan } from '../../models/InstallPlan.js';

/**
 * Full valid InstallConfig for testing.
 */
export function sampleConfig(): InstallConfig {
  return {
    DatabaseHost: 'localhost',
    DatabasePort: 1433,
    DatabaseName: 'MemberJunction',
    DatabaseTrustCert: true,
    CodeGenUser: 'MJ_CodeGen',
    CodeGenPassword: 'test_password_1',
    APIUser: 'MJ_Connect',
    APIPassword: 'test_password_2',
    APIPort: 4000,
    ExplorerPort: 4200,
    AuthProvider: 'none',
  };
}

/**
 * Minimal PartialInstallConfig with database fields.
 */
export function samplePartialConfig(): PartialInstallConfig {
  return {
    DatabaseHost: 'localhost',
    DatabasePort: 1433,
    DatabaseName: 'MemberJunction',
  };
}

/**
 * Sample VersionInfo for tag v5.2.0.
 */
export function sampleVersionInfo(): VersionInfo {
  return {
    Tag: 'v5.2.0',
    Name: 'v5.2.0',
    ReleaseDate: new Date('2025-02-15'),
    Prerelease: false,
    DownloadUrl: 'https://github.com/MemberJunction/MJ/archive/refs/tags/v5.2.0.zip',
    Notes: 'Release notes for v5.2.0',
  };
}

/**
 * Sample InstallPlan with all phases enabled.
 */
export function samplePlan(dir: string = '/test/install'): InstallPlan {
  return new InstallPlan('v5.2.0', dir, sampleConfig());
}

/**
 * Sample ProcessResult with customizable overrides.
 */
export function sampleProcessResult(overrides?: Partial<ProcessResult>): ProcessResult {
  return {
    ExitCode: 0,
    Stdout: '',
    Stderr: '',
    TimedOut: false,
    ...overrides,
  };
}
