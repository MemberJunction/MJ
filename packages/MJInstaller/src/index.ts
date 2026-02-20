/**
 * @memberjunction/installer — Public API
 *
 * Headless, event-driven installer engine for MemberJunction.
 * Used by the CLI (`mj install`, `mj doctor`), VSCode extension, and Docker/CI.
 */

// Engine
export { InstallerEngine } from './InstallerEngine.js';

// Events
export {
  InstallerEventEmitter,
  type InstallerEventType,
  type InstallerEvent,
  type InstallerEventHandler,
  type InstallerEventMap,
  type PhaseStartEvent,
  type PhaseEndEvent,
  type StepProgressEvent,
  type LogEvent,
  type WarnEvent,
  type ErrorEvent,
  type PromptEvent,
  type DiagnosticEvent,
} from './events/InstallerEvents.js';

// Errors
export { InstallerError, type PhaseId } from './errors/InstallerError.js';

// Models
export type { VersionInfo } from './models/VersionInfo.js';
export {
  type InstallConfig,
  type PartialInstallConfig,
  InstallConfigDefaults,
} from './models/InstallConfig.js';
export {
  InstallPlan,
  type CreatePlanInput,
  type RunOptions,
  type DoctorOptions,
  type InstallResult,
  type PhaseInfo,
} from './models/InstallPlan.js';
export {
  InstallState,
  type InstallStateData,
  type PhaseState,
  type PhaseStatus,
} from './models/InstallState.js';
export {
  Diagnostics,
  type DiagnosticCheck,
  type DiagnosticStatus,
  type EnvironmentInfo,
  type LastInstallInfo,
} from './models/Diagnostics.js';

// Adapters (exported for testing and extension use)
export { GitHubReleaseProvider } from './adapters/GitHubReleaseProvider.js';
export { FileSystemAdapter } from './adapters/FileSystemAdapter.js';
export { ProcessRunner, type ProcessResult, type ProcessOptions } from './adapters/ProcessRunner.js';
export { SqlServerAdapter, type SqlConnectivityResult } from './adapters/SqlServerAdapter.js';

// Phases (exported for testing and direct use)
export { PreflightPhase, type PreflightContext, type PreflightResult } from './phases/PreflightPhase.js';
export { ScaffoldPhase, type ScaffoldContext, type ScaffoldResult } from './phases/ScaffoldPhase.js';
export { ConfigurePhase, type ConfigureContext, type ConfigureResult } from './phases/ConfigurePhase.js';
export { DatabaseProvisionPhase, type DatabaseProvisionContext, type DatabaseProvisionResult } from './phases/DatabaseProvisionPhase.js';
export { MigratePhase, type MigrateContext, type MigrateResult } from './phases/MigratePhase.js';
export { PlatformCompatPhase, type PlatformCompatContext, type PlatformCompatResult } from './phases/PlatformCompatPhase.js';
export { DependencyPhase, type DependencyContext, type DependencyResult } from './phases/DependencyPhase.js';
export { CodeGenPhase, type CodeGenContext, type CodeGenResult, type KnownIssuePatch, type KnownIssueDiagnostic } from './phases/CodeGenPhase.js';
export { SmokeTestPhase, type SmokeTestContext, type SmokeTestResult } from './phases/SmokeTestPhase.js';
