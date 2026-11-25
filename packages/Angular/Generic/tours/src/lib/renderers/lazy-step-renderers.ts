import { MJGlobal } from '@memberjunction/global';
import { BaseTourStepRenderer } from './base-step-renderer';

const loadedKeys = new Set<string>();
const inFlight = new Map<string, Promise<void>>();

/**
 * Lazy-loads heavy step renderer chunks (`EmbeddedComponent` / `InteractiveComponent`,
 * `Media`, `AskAgent`) on demand so Stage-2 basic web tours never download `@memberjunction/ng-react`
 * or `@memberjunction/core-entities` unless a tour step actually uses them (§4.1 & §18 Phase 3).
 */
export async function EnsureStepRendererLoaded(stepTypeKey: string): Promise<void> {
  if (MJGlobal.Instance.ClassFactory.GetRegistration(BaseTourStepRenderer, stepTypeKey) !== null) {
    return;
  }

  const normalized = stepTypeKey.trim();
  if (loadedKeys.has(normalized)) {
    return;
  }

  const existing = inFlight.get(normalized);
  if (existing) {
    return existing;
  }

  let loader: Promise<void> | null = null;

  if (normalized === 'EmbeddedComponent' || normalized === 'InteractiveComponent') {
    // AGENTS.md Rule #8 Category 3 (Genuine bundle-size deferral for two-stage web element):
    // keeps @memberjunction/ng-react and @memberjunction/core-entities out of the eager Stage-2 chunk.
    loader = import('./chunks/embedded-component-step-renderer.component').then((m) => {
      m.EnsureEmbeddedComponentRendererRegistered();
      loadedKeys.add('EmbeddedComponent');
      loadedKeys.add('InteractiveComponent');
    });
  } else if (normalized === 'Media') {
    // AGENTS.md Rule #8 Category 3 (Genuine bundle-size deferral for two-stage web element):
    // splits Media step renderer into a dedicated lazy chunk.
    loader = import('./chunks/media-step-renderer.component').then((m) => {
      m.EnsureMediaStepRendererRegistered();
      loadedKeys.add('Media');
    });
  } else if (normalized === 'AskAgent') {
    // AGENTS.md Rule #8 Category 3 (Genuine bundle-size deferral for two-stage web element):
    // splits AskAgent step renderer into a dedicated lazy chunk.
    loader = import('./chunks/ask-agent-step-renderer.component').then((m) => {
      m.EnsureAskAgentStepRendererRegistered();
      loadedKeys.add('AskAgent');
    });
  }

  if (!loader) {
    return;
  }

  inFlight.set(normalized, loader);
  try {
    await loader;
  } finally {
    inFlight.delete(normalized);
  }
}
