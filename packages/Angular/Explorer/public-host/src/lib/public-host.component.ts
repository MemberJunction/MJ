import { Component, OnInit, ViewEncapsulation, inject, signal, type Type } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { PUBLIC_HOST_CONFIG } from './public-host-config';
import { PublicPageContext } from './public-page-context';
import { FindPublicPage } from './public-path';
import { LoadPublicBrand } from './public-brand-loader';
import { BuildSignInURL } from './public-host-urls';

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
      this.PageComponent.set(await page.Load());
      this.State.set('ready');
    } catch (error) {
      console.error(`[PublicHost] Page '${page.Slug}' from '${page.AppName}' failed to load`, error);
      this.State.set('failed');
    }
  }
}
