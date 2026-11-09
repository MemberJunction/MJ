/**
 * The collaborators a widget builds its controller from, and their production wiring. Separate from the Angular
 * component so the lazily loaded call chunk can use them without importing the component.
 */
import { CreateBrowserWidgetAuth } from '../auth/widget-auth.browser';
import { WidgetKeyClient } from '../auth/widget-key-client';
import { CreateBrowserPageClose } from '../lifecycle/widget-page-close.browser';
import { WidgetResumeStore } from '../resume/widget-resume-store';
import type { WidgetControllerDeps } from './widget-controller';

/** The collaborators the widget builds its controller from. A host (or a test) replaces any of them. */
export type RealtimeWidgetPorts = Omit<WidgetControllerDeps, 'runtime'>;

/** Production wiring: the browser `fetch`, the real GraphQL provider, `sessionStorage`. */
export function DefaultRealtimeWidgetPorts(): RealtimeWidgetPorts {
  return {
    createAuth: (apiUrl, refresh) => CreateBrowserWidgetAuth(apiUrl, refresh),
    createGuestSessions: (apiUrl, widgetKey) => new WidgetKeyClient(apiUrl, widgetKey),
    createResumeStore: (scope) => new WidgetResumeStore(scope),
    pageClose: CreateBrowserPageClose()
  };
}

