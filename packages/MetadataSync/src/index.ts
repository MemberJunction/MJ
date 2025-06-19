// Core library exports
export { FileBackupManager } from './lib/file-backup-manager';
export { SyncEngine } from './lib/sync-engine';
export type { RecordData } from './lib/sync-engine';
export { ConfigManager, configManager } from './lib/config-manager';
export { getSyncEngine, resetSyncEngine } from './lib/singleton-manager';

// Service exports
export { InitService } from './services/InitService';
export type { InitOptions, InitCallbacks } from './services/InitService';

export { PullService } from './services/PullService';
export type { PullOptions, PullCallbacks, PullResult } from './services/PullService';

export { PushService } from './services/PushService';
export type { PushOptions, PushCallbacks, PushResult } from './services/PushService';

export { StatusService } from './services/StatusService';
export type { StatusOptions, StatusCallbacks, StatusResult } from './services/StatusService';

export { FileResetService } from './services/FileResetService';
export type { FileResetOptions, FileResetCallbacks, FileResetResult } from './services/FileResetService';

export { WatchService } from './services/WatchService';
export type { WatchOptions, WatchCallbacks, WatchResult } from './services/WatchService';

export { ValidationService } from './services/ValidationService';
export { FormattingService } from './services/FormattingService';

// Configuration types
export {
  loadMJConfig,
  loadSyncConfig,
  loadEntityConfig,
  loadFolderConfig,
  type EntityConfig,
  type FolderConfig,
  type RelatedEntityConfig
} from './config';

// Provider utilities
export {
  initializeProvider,
  getSystemUser,
  findEntityDirectories,
  getDataProvider
} from './lib/provider-utils';

// Validation types
export type {
  ValidationResult,
  ValidationError,
  ValidationWarning,
  EntityDependency,
  FileValidationResult,
  ValidationOptions,
  ReferenceType,
  ParsedReference
} from './types/validation';