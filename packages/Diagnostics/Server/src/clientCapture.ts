import { GetDiagnosticContext } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import type { ActiveDiagnosticSession } from './sessionManager.js';

/** Response header that asks the browser to upload its capture buffers to the named session. */
export const DIAGNOSTIC_TRIGGER_HEADER = 'X-MJ-Diagnostic-Trigger';

/** A response that can carry a header. */
export interface HeaderWritableResponse {
  setHeader(name: string, value: string): unknown;
}

/** True when a session targets people (users or a browser session), so their browser should capture too. */
export function SessionWantsClientCapture(session: ActiveDiagnosticSession | undefined): session is ActiveDiagnosticSession {
  return session?.scopeType === 'Users' || session?.scopeType === 'BrowserSession';
}

/** Sets `X-MJ-Diagnostic-Trigger: <sessionId>` on the response when the matched session wants client capture. */
export function SetClientCaptureTriggerHeader(res: HeaderWritableResponse, session: ActiveDiagnosticSession | undefined): void {
  if (SessionWantsClientCapture(session)) {
    res.setHeader(DIAGNOSTIC_TRIGGER_HEADER, session.id);
  }
}

/** The browser session ID of the current request, from the diagnostic context. */
export function CurrentBrowserSessionId(): string | undefined {
  return GetDiagnosticContext()?.BrowserSessionID || undefined;
}

/**
 * True when a session captures this caller: a `Users` session that names the user (and, when it
 * names a browser session, this one), or a `BrowserSession` session for this browser session.
 */
export function SessionTargetsCaller(session: ActiveDiagnosticSession, userId: string, browserSessionId: string | undefined): boolean {
  const scopedBrowser = session.scope.browserSessionId;
  if (session.scopeType === 'BrowserSession') {
    return Boolean(scopedBrowser) && scopedBrowser === browserSessionId;
  }
  if (session.scopeType !== 'Users') return false;
  const namesUser = (session.scope.userIds ?? []).some((id) => UUIDsEqual(id, userId));
  return namesUser && (!scopedBrowser || scopedBrowser === browserSessionId);
}
