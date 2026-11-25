/**
 * Type-only declarations for the Stage-1 vanilla shell (`shell-entry.ts` & `src/shell/*`).
 * Must NEVER import runtime code from `@angular/*`, `rxjs`, `zone.js`, or `@memberjunction/*`.
 */
import type {
  TourDefinition,
  TourNavigationIntent,
  TourRunEvent,
  TourSessionEventArgs,
  TourSessionGuideMode,
} from '@memberjunction/tours-runtime';

export interface TourShellMountOptions {
  SurfaceKey?: string;
  ApiUrl?: string;
  Locale?: string;
  Definitions?: TourDefinition[];
  Store?: 'memory' | 'surface';
  SessionUrl?: string;
  CspNonce?: string;
  AutoStartTourKey?: string;
  OnNavigate?: (intent: TourNavigationIntent) => boolean | void | Promise<boolean | void>;
  OnRecordEvents?: (events: TourRunEvent[]) => void | Promise<void>;
  Container?: HTMLElement;
}

export interface TourShellHandle {
  Start(
    tourOrKey: string | TourDefinition,
    options?: { GuideMode?: TourSessionGuideMode; StartAtStepKey?: string },
  ): Promise<boolean>;
  Pause(): Promise<void>;
  Resume(): Promise<void>;
  Stop(reason?: string): Promise<void>;
  Signal(signalKey: string, payload?: Record<string, unknown>): void;
  On(eventName: string, handler: (args: TourSessionEventArgs) => void): () => void;
  Dispose(): void;
}

export interface TourShellFirstVisitRule {
  TourKey: string;
  UrlPattern?: string;
  UrlMatchMode?: 'glob' | 'regex' | 'exact';
}

/** Zero-dependency URL pattern matcher used by Stage-1 `FirstVisit` trigger evaluation. */
export function MatchesShellUrlPattern(
  pattern: string,
  url: string,
  mode: 'glob' | 'regex' | 'exact' = 'glob',
): boolean {
  if (!pattern) {
    return true;
  }
  if (mode === 'exact') {
    return url === pattern;
  }
  if (mode === 'regex') {
    try {
      return new RegExp(pattern).test(url);
    } catch {
      return false;
    }
  }
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '___DOUBLE_STAR___')
    .replace(/\*/g, '[^/]*')
    .replace(/___DOUBLE_STAR___/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`).test(url);
}
