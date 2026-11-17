import { InjectionToken } from '@angular/core';
import type { PublicHostEnvironment, PublicPageEntry } from './public-page-entry';

/** What the public host gets from the host app. */
export interface PublicHostConfig {
  Environment: PublicHostEnvironment;
  PublicPages: PublicPageEntry[];
}

export const PUBLIC_HOST_CONFIG = new InjectionToken<PublicHostConfig>('MJ_PUBLIC_HOST_CONFIG');
