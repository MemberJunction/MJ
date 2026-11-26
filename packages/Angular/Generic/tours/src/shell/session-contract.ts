/**
 * Type-only contract between Stage-1 vanilla shell (`mj-tours.js`) and Stage-2
 * Angular session bundle (`mj-tours-session.js`). Zero runtime imports!
 */
import type { TourShellHandle, TourShellMountOptions } from './shell-types';

export const TOUR_SHELL_SESSION_CONTRACT_VERSION = 1;

export interface TourSessionBootstrapOptions extends TourShellMountOptions {
  Container: HTMLElement;
  InitialAnchors?: Array<{ Key: string; Element: HTMLElement }>;
}

export interface TourSessionModule {
  readonly SESSION_CONTRACT_VERSION: number;
  MountToursSession(options: TourSessionBootstrapOptions): Promise<TourShellHandle>;
  RegisterAnchorInSession(key: string, element: HTMLElement): () => void;
}
