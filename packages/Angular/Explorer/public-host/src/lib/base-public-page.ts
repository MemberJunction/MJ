import { Directive, inject } from '@angular/core';
import { PublicPageContext } from './public-page-context';

/**
 * Base class for a public page from an Open App. The page is a standalone component that the
 * public host renders at `/p/<slug>` for visitors who are not signed in.
 */
@Directive()
export abstract class BasePublicPage {
  /** The public host's services: slug, query, MJAPI URL, brand and the sign-in link. */
  protected readonly Context = inject(PublicPageContext);
}
