import { signal, type Signal } from '@angular/core';
import type { PublicLoginScreen } from '@memberjunction/theme-engine';
import { ReadPublicPageSubPath } from './public-path';
import { BuildSignInURL, BuildSignUpURL } from './public-host-urls';

/** What the public host knows when it creates a page's context. */
export interface PublicPageContextConfig {
  Slug: string;
  Path: string;
  Search: string;
  MJAPIURL: string;
  /** Opens a URL in the current tab. */
  Navigate: (url: string) => void;
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
  private readonly brand = signal<PublicLoginScreen | null>(null);

  constructor(config: PublicPageContextConfig) {
    this.Slug = config.Slug;
    this.SubPath = ReadPublicPageSubPath(config.Path);
    this.QueryParams = new URLSearchParams(config.Search);
    this.MJAPIURL = config.MJAPIURL;
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

  /** An absolute URL for a route on MJAPI, such as the Open App's `pre-auth` endpoints. */
  public BuildMJAPIURL(path: string): string {
    return `${this.MJAPIURL}/${path.replace(/^\/+/, '')}`;
  }

  /** Opens Explorer and starts the identity provider's sign-up form. */
  public StartSignUp(): void {
    this.navigate(BuildSignUpURL());
  }

  /** Opens Explorer's sign-in screen. */
  public StartSignIn(): void {
    this.navigate(BuildSignInURL());
  }
}
