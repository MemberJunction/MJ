import { provideZonelessChangeDetection, type ApplicationRef } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import type { MJBootstrapEnvironment, PublicPageEntry } from './public-page-entry';
import { PUBLIC_HOST_CONFIG } from './public-host-config';
import { PublicHostComponent } from './public-host.component';
import { PublicPageContext } from './public-page-context';
import { ReadPublicPageSlug } from './public-path';
import { ResolvePublicMJAPIURL } from './public-host-urls';

/** The class the public host puts on `<html>` while it owns the page. */
export const PUBLIC_HOST_ACTIVE_CLASS = 'mj-public-host-active';

export interface StartPublicHostOptions {
  Environment: MJBootstrapEnvironment;
  PublicPages: PublicPageEntry[];
}

/**
 * Starts the public host for the current URL. It runs without Explorer, the auth SDK, GraphQL or
 * metadata, and without zone-based change detection.
 */
export function StartPublicHost(options: StartPublicHostOptions): Promise<ApplicationRef> {
  document.documentElement.classList.add(PUBLIC_HOST_ACTIVE_CLASS);
  document.body.appendChild(document.createElement('mj-public-host'));

  const context = new PublicPageContext({
    Slug: ReadPublicPageSlug(window.location.pathname) ?? '',
    Path: window.location.pathname,
    Search: window.location.search,
    MJAPIURL: ResolvePublicMJAPIURL(options.Environment),
    Navigate: (url: string) => window.location.assign(url),
  });

  return bootstrapApplication(PublicHostComponent, {
    providers: [
      provideZonelessChangeDetection(),
      { provide: PUBLIC_HOST_CONFIG, useValue: { Environment: options.Environment, PublicPages: options.PublicPages } },
      { provide: PublicPageContext, useValue: context },
    ],
  });
}
