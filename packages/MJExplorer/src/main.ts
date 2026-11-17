import { BootstrapMJ } from '@memberjunction/ng-public-host/bootstrap';
import { environment } from './environments/environment';
import { PUBLIC_PAGES } from './app/generated/public-pages.generated';

// A path under /p/ starts the public host with the Open App's page. Every other path preloads the
// auth provider catalog and sign-in design, then starts Explorer.
BootstrapMJ({
  Environment: environment,
  PublicPages: PUBLIC_PAGES,
  // Dynamic import, lazy-route category: Explorer's root module is evaluated only after the auth
  // catalog preload, and a public page never downloads it.
  LoadExplorerModule: () => import('./app/app.module').then(m => m.AppModule),
});
