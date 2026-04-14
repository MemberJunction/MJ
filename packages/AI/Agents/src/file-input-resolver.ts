import { FileCapabilities } from '@memberjunction/ai';

export interface FileInputStrategy {
  UseNativeFileInput: boolean;
  UseFileAPI: boolean;
  Reason: string;
}

/**
 * Determines whether to use native file input or artifact tools for a given file,
 * based on LLM driver capabilities and an optional prompt-level override.
 *
 * Resolution order:
 * 1. Prompt-level forceNativeFileInput override (if non-null, returns immediately)
 * 2. Driver capabilities null-check (null = no file support)
 * 3. MIME type, size, and count constraints checked against driver capabilities
 * 4. Falls back to artifact tools when any constraint is violated
 */
export function ResolveFileInputStrategy(
  mimeType: string,
  fileSizeBytes: number,
  capabilities: FileCapabilities | null,
  forceNativeFileInput: boolean | null,
  currentFileCount: number,
): FileInputStrategy {
  if (forceNativeFileInput !== null) {
    return {
      UseNativeFileInput: forceNativeFileInput,
      UseFileAPI: forceNativeFileInput && capabilities !== null ? capabilities.HasFileAPI : false,
      Reason: forceNativeFileInput
        ? 'Prompt override: native file input forced on'
        : 'Prompt override: native file input forced off',
    };
  }

  if (capabilities === null) {
    return {
      UseNativeFileInput: false,
      UseFileAPI: false,
      Reason: 'Driver does not support file input',
    };
  }

  const Lower = mimeType.toLowerCase();
  const Matches = capabilities.SupportedMimeTypes.some((pattern) => {
    const p = pattern.toLowerCase();
    if (p.endsWith('/*')) {
      return Lower.startsWith(p.slice(0, -1));
    }
    return Lower === p;
  });

  if (!Matches) {
    return {
      UseNativeFileInput: false,
      UseFileAPI: false,
      Reason: `MIME type '${mimeType}' not in supported types: ${capabilities.SupportedMimeTypes.join(', ')}`,
    };
  }

  if (fileSizeBytes > capabilities.MaxFileSize) {
    return {
      UseNativeFileInput: false,
      UseFileAPI: false,
      Reason: `File size ${fileSizeBytes} exceeds max file size ${capabilities.MaxFileSize}`,
    };
  }

  if (currentFileCount >= capabilities.MaxFilesPerRequest) {
    return {
      UseNativeFileInput: false,
      UseFileAPI: false,
      Reason: `File count ${currentFileCount} already at or above max ${capabilities.MaxFilesPerRequest}`,
    };
  }

  return {
    UseNativeFileInput: true,
    UseFileAPI: capabilities.HasFileAPI,
    Reason: 'All file input constraints satisfied',
  };
}
