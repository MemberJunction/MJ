/**
 * Stage-2 Angular session bundle entry (`dist/element/mj-tours-session.js`).
 * Lazy-loaded via `import()` from Stage-1 (`mj-tours.js`) only when a tour actually starts.
 *
 * Includes `zone.js`, `createApplication()`, `TourGlobalStylesComponent` (`@layer mj-tours-defaults`),
 * the 6 core Light DOM step renderers, and the 3 standard presenters. Heavy renderers (`EmbeddedComponent`,
 * `Media`, `AskAgent`) sit in separate lazy chunks under `dist/element/chunks/`.
 */
import 'zone.js';
import { AnchorRegistry } from './lib/anchors/anchor-registry';
import { MountTours as MountAngularTours } from './lib/host/mount-tours';
import { EnsureStandardTourPresentersRegistered } from './lib/presenters/register-standard-presenters';
import { EnsureStandardTourRenderersRegistered } from './lib/renderers/register-standard-renderers';
import type { TourSessionBootstrapOptions, TourSessionModule } from './shell/session-contract';
import type { TourShellHandle } from './shell/shell-types';

export const SESSION_CONTRACT_VERSION = 1;

EnsureStandardTourRenderersRegistered();
EnsureStandardTourPresentersRegistered();

export function RegisterAnchorInSession(key: string, element: HTMLElement): () => void {
  return AnchorRegistry.Instance.RegisterAnchor(key, element);
}

export async function MountToursSession(options: TourSessionBootstrapOptions): Promise<TourShellHandle> {
  for (const item of options.InitialAnchors ?? []) {
    AnchorRegistry.Instance.RegisterAnchor(item.Key, item.Element);
  }

  const mounted = await MountAngularTours({
    SurfaceKey: options.SurfaceKey,
    ApiUrl: options.ApiUrl,
    Locale: options.Locale,
    Definitions: options.Definitions,
    Store: options.Store,
    OnNavigate: options.OnNavigate,
    OnRecordEvents: options.OnRecordEvents,
    Container: options.Container,
  });

  return {
    Start: (tourOrKey, startOpts) =>
      mounted.Start(typeof tourOrKey === 'string' ? tourOrKey : tourOrKey.TourKey, startOpts),
    Pause: () => mounted.Pause(),
    Resume: () => mounted.Resume(),
    Stop: (reason) => mounted.Stop(reason),
    Signal: (signalKey, payload) => mounted.Signal(signalKey, payload),
    On: (eventName, handler) => mounted.On(eventName, handler),
    Dispose: () => mounted.Dispose(),
  };
}

// Typecheck verification that exports match TourSessionModule
const _moduleContractCheck: TourSessionModule = {
  SESSION_CONTRACT_VERSION,
  MountToursSession,
  RegisterAnchorInSession,
};
void _moduleContractCheck;
