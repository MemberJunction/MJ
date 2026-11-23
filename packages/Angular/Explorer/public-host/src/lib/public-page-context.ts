import { Directive, inject, signal, type Signal } from '@angular/core';
import type { PublicLoginScreen } from '@memberjunction/theme-engine';
import { BuildSignInURL } from './public-pages';

/** What the public host knows when it creates a page's context. */
export interface PublicPageContextConfig {
  Slug: string;
  SubPath: string;
  Search: string;
  /** The full path of the address, such as `/p/docs/guides`. */
  Pathname: string;
  MJAPIURL: string;
  /** Opens a URL in the current tab. */
  Navigate: (url: string) => void;
}

/** Why the host shows an error page: no page answers the address, or the page's code did not load. */
export type PublicPageErrorReason = 'not-found' | 'load-failed';

/** What an error page knows about the failed address. */
export interface PublicPageError {
  Reason: PublicPageErrorReason;
  /**
   * The path the visitor asked for. Whoever made the link wrote it: show it as text only, never
   * as a link or as markup.
   */
  RequestedPath: string;
}

/**
 * The public host's services for a public page. A page gets it with `inject(PublicPageContext)`.
 * It holds no session, no metadata and no GraphQL client: a public page reads its data from its
 * Open App's `pre-auth` server endpoints.
 */
export class PublicPageContext {
  public readonly Slug: string;
  /** The path after `/p/<slug>/`, for pages with more than one view. */
  public readonly SubPath: string;
  public readonly QueryParams: URLSearchParams;
  /** MJAPI's base URL, without a trailing slash. */
  public readonly MJAPIURL: string;

  private readonly navigate: (url: string) => void;
  private readonly pathname: string;
  private readonly brand = signal<PublicLoginScreen | null>(null);
  private readonly error = signal<PublicPageError | null>(null);

  constructor(config: PublicPageContextConfig) {
    this.Slug = config.Slug;
    this.SubPath = config.SubPath;
    this.QueryParams = new URLSearchParams(config.Search);
    this.MJAPIURL = config.MJAPIURL;
    this.pathname = config.Pathname;
    this.navigate = config.Navigate;
  }

  /** The sign-in page design published in Login Studio, or null until it loads or when there is none. */
  public get Brand(): Signal<PublicLoginScreen | null> {
    return this.brand.asReadonly();
  }

  /** Sets the brand. The public host calls this when the design loads. */
  public SetBrand(brand: PublicLoginScreen | null): void {
    this.brand.set(brand);
  }

  /** Set while the host shows an error page in place of a page. An error page reads the reason and the address here. */
  public get Error(): Signal<PublicPageError | null> {
    return this.error.asReadonly();
  }

  /**
   * Shows the error page in place of this page. A page with sub-paths calls it when the
   * sub-path is not one of its views.
   */
  public ShowNotFound(): void {
    this.SetError('not-found');
  }

  /** Records why the page cannot show. The first reason stays. The public host shows the error page. */
  public SetError(reason: PublicPageErrorReason): void {
    if (!this.error()) {
      this.error.set({ Reason: reason, RequestedPath: this.pathname });
    }
  }

  /** An absolute URL for a route on MJAPI, such as the Open App's `pre-auth` endpoints. */
  public BuildMJAPIURL(path: string): string {
    return `${this.MJAPIURL}/${path.replace(/^\/+/, '')}`;
  }

  /** Opens Explorer's sign-in screen. A new visitor signs up there when the identity provider allows it. */
  public StartSignIn(): void {
    this.navigate(BuildSignInURL());
  }
}

/**
 * Base class for a public page from an Open App. The page is a standalone component that the
 * public host renders at `/p/<slug>` for visitors who are not signed in.
 */
@Directive()
export abstract class BasePublicPage {
  /** The public host's services: slug, query, MJAPI URL, brand and the sign-in link. */
  protected readonly Context = inject(PublicPageContext);
}
