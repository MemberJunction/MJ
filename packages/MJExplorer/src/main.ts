import { StartExplorer } from '@memberjunction/ng-explorer-app/bootstrap';
import { environment } from './environments/environment';
import { PUBLIC_PAGES } from './app/generated/public-pages.generated';

StartExplorer({
  Environment: environment,
  PublicPages: PUBLIC_PAGES,
  // Dynamic import, framework-ordering category: StartExplorer() must preload the auth provider
  // before the root module is evaluated. A static import would evaluate it first.
  LoadAppModule: () => import('./app/app.module').then((m) => m.AppModule),
});
