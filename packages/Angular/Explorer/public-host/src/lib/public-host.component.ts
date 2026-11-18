import { Component, InjectionToken, OnInit, ViewEncapsulation, inject, provideZonelessChangeDetection, signal, type ApplicationRef, type Type } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { bootstrapApplication } from '@angular/platform-browser';
import { SanitizePublicLoginScreen, type PublicLoginScreen } from '@memberjunction/theme-engine';
import { PublicPageContext } from './public-page-context';
import {
  BuildLoginScreenURL, BuildSignInURL, FindPublicPage, LoadPublicPageComponent, ParsePublicPagePath, ResolvePublicMJAPIURL,
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

/** Where the host is in showing the page. */
export type PublicHostState = 'loading' | 'ready' | 'missing' | 'failed';

/**
 * Root component of the public host. Loads the page registered for the URL's slug and renders it,
 * or shows a "page not found" view.
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

  ngOnInit(): void {
    void this.loadBrand();
    void this.loadPage();
  }

  private async loadBrand(): Promise<void> {
    this.context.SetBrand(await LoadPublicBrand(this.config.Environment));
  }

  private async loadPage(): Promise<void> {
    const page = FindPublicPage(this.config.PublicPages, this.context.Slug);
    if (!page) {
      this.State.set('missing');
      return;
    }
    try {
      this.PageComponent.set(await LoadPublicPageComponent(page));
      this.State.set('ready');
    } catch (error) {
      console.error(`[PublicHost] Page '${page.Slug}' from '${page.AppName}' failed to load`, error);
      this.State.set('failed');
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
