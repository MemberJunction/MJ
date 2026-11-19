import { Component, InjectionToken, OnInit, ViewEncapsulation, effect, inject, provideZonelessChangeDetection, signal, type ApplicationRef, type Type } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { bootstrapApplication } from '@angular/platform-browser';
import { SanitizePublicLoginScreen, type PublicLoginScreen } from '@memberjunction/theme-engine';
import { PublicPageContext, type PublicPageError } from './public-page-context';
import {
  BuildLoginScreenURL, BuildSignInURL, FindPublicErrorPage, LoadPublicPageComponent, ParsePublicPagePath, ResolvePublicMJAPIURL, ResolvePublicPage,
  type PublicHostConfig, type PublicHostEnvironment,
} from './public-pages';

export const PUBLIC_HOST_CONFIG = new InjectionToken<PublicHostConfig>('MJ_PUBLIC_HOST_CONFIG');

const BRAND_FETCH_TIMEOUT_MS = 5000;

/**
 * Fetches the sign-in page design published in Login Studio, so public pages can use the same brand.
 * Never rejects: a server without the route, a network failure or a bad body resolve to null.
 */
export async function LoadPublicBrand(environment: PublicHostEnvironment, timeoutMs: number = BRAND_FETCH_TIMEOUT_MS): Promise<PublicLoginScreen | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(BuildLoginScreenURL(environment), { method: 'GET', signal: controller.signal, credentials: 'omit' });
    if (!response.ok) {
      return null;
    }
    const body: unknown = await response.json();
    return body && typeof body === 'object' ? SanitizePublicLoginScreen(body) : null;
  } catch (error) {
    console.warn(`[PublicHost] Could not load the brand: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Where the host is in showing the page. `missing` and `failed` show the host's own error view. */
export type PublicHostState = 'loading' | 'ready' | 'missing' | 'failed';

/** Tells search engines not to index the document. The host calls it whenever an error page shows. */
export function SetRobotsNoIndex(doc: Document): void {
  let tag = doc.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
  if (!tag) {
    tag = doc.createElement('meta');
    tag.name = 'robots';
    doc.head.appendChild(tag);
  }
  tag.content = 'noindex';
}

/**
 * Root component of the public host. Renders the page that answers the address. For a wrong
 * address, or a page that does not load, it renders the nearest error page of an installed app,
 * or its own error view when there is none.
 */
@Component({
  selector: 'mj-public-host',
  imports: [NgComponentOutlet],
  encapsulation: ViewEncapsulation.None,
  styleUrl: './public-host.component.css',
  template: `
    @switch (State()) {
      @case ('ready') {
        <ng-container *ngComponentOutlet="PageComponent()" />
      }
      @case ('loading') {
        <div class="mj-public-host-status" role="status" aria-live="polite">Loading…</div>
      }
      @default {
        <main class="mj-public-host-missing">
          <h1>{{ State() === 'missing' ? 'Page not found' : 'This page could not load' }}</h1>
          <p>{{ State() === 'missing' ? 'There is no public page at this address.' : 'Try again in a moment.' }}</p>
          <a [href]="SignInURL">Go to sign-in</a>
        </main>
      }
    }
  `,
})
export class PublicHostComponent implements OnInit {
  private readonly config = inject(PUBLIC_HOST_CONFIG);
  private readonly context = inject(PublicPageContext);

  public readonly State = signal<PublicHostState>('loading');
  public readonly PageComponent = signal<Type<unknown> | null>(null);
  public readonly SignInURL = BuildSignInURL();

  private readonly path = ParsePublicPagePath(window.location.pathname);

  private errorShown = false;

  constructor() {
    effect(() => {
      const error = this.context.Error();
      if (error && !this.errorShown) {
        this.errorShown = true;
        void this.showErrorPage(error);
      }
    });
  }

  ngOnInit(): void {
    void this.loadBrand();
    void this.loadPage();
  }

  private async loadBrand(): Promise<void> {
    this.context.SetBrand(await LoadPublicBrand(this.config.Environment));
  }

  private async loadPage(): Promise<void> {
    const page = ResolvePublicPage(this.config.PublicPages, this.path);
    if (!page) {
      this.context.SetError('not-found');
      return;
    }
    try {
      const component = await LoadPublicPageComponent(page);
      if (!this.errorShown) {
        this.PageComponent.set(component);
        this.State.set('ready');
      }
    } catch (error) {
      console.error(`[PublicHost] Page '${page.Slug}' from '${page.AppName}' failed to load`, error);
      this.context.SetError('load-failed');
    }
  }

  /** Shows the nearest error page of an installed app, or the host's own view when there is none or it does not load. */
  private async showErrorPage(error: PublicPageError): Promise<void> {
    SetRobotsNoIndex(document);
    const ownView: PublicHostState = error.Reason === 'not-found' ? 'missing' : 'failed';
    const errorPage = FindPublicErrorPage(this.config.PublicPages, this.path);
    if (!errorPage) {
      this.State.set(ownView);
      return;
    }
    try {
      this.PageComponent.set(await LoadPublicPageComponent(errorPage));
      this.State.set('ready');
    } catch (loadError) {
      console.error(`[PublicHost] Error page '${errorPage.Scope}' from '${errorPage.AppName}' failed to load`, loadError);
      this.State.set(ownView);
    }
  }
}

/** The class the public host puts on `<html>` while it owns the page. */
export const PUBLIC_HOST_ACTIVE_CLASS = 'mj-public-host-active';

/**
 * Starts the public host for the current URL. It runs without Explorer, the auth SDK, GraphQL or
 * metadata, and without zone-based change detection.
 */
export function StartPublicHost(config: PublicHostConfig): Promise<ApplicationRef> {
  document.documentElement.classList.add(PUBLIC_HOST_ACTIVE_CLASS);
  document.body.appendChild(document.createElement('mj-public-host'));

  const path = ParsePublicPagePath(window.location.pathname);
  const context = new PublicPageContext({
    Slug: path.Slug ?? '',
    SubPath: path.SubPath,
    Search: window.location.search,
    Pathname: window.location.pathname,
    MJAPIURL: ResolvePublicMJAPIURL(config.Environment),
    Navigate: (url: string) => window.location.assign(url),
  });

  return bootstrapApplication(PublicHostComponent, {
    providers: [
      provideZonelessChangeDetection(),
      { provide: PUBLIC_HOST_CONFIG, useValue: config },
      { provide: PublicPageContext, useValue: context },
    ],
  });
}
