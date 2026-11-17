import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { TryStartPublicPage } from '@memberjunction/ng-public-host/bootstrap';
import { environment } from './environments/environment';
import { PUBLIC_PAGES } from './app/generated/public-pages.generated';

async function initAndBootstrap() {
  // A path under /p/ shows an Open App's public page in a small separate host. Explorer does not start.
  if (await TryStartPublicPage({ Environment: environment, PublicPages: PUBLIC_PAGES })) {
    return;
  }

  // Dynamic import, bundle-size category: the preload helpers import all of @memberjunction/core
  // (about 550 KB compressed), which a public page must not download.
  const { AuthProviderCatalog, LoginScreenLoader } = await import('@memberjunction/ng-auth-services/preload');

  // Fetch the server's public authentication-provider catalog BEFORE the root module is
  // imported. `AuthServicesModule.forRoot()` runs while the @NgModule decorator's `imports`
  // array is being constructed — i.e. at module-definition time — so the catalog has to be in
  // hand before that module is evaluated. Preload never rejects: on any failure it yields an
  // empty catalog and the app falls back to the compiled `AUTH_TYPE`, so a slow or older server
  // delays the login screen briefly but never blocks it.
  //
  // The sign-in page published in Login Studio is fetched alongside it, so the login screen's first
  // paint is already designed. It never rejects either; the explorer app awaits the same request.
  await Promise.all([
    AuthProviderCatalog.Preload(environment.GRAPHQL_URI),
    LoginScreenLoader.Load(environment.GRAPHQL_URI),
  ]);

  // Dynamic import is REQUIRED here, not a convenience. A static import is hoisted, so AppModule
  // — and with it AuthServicesModule.forRoot — would evaluate before the await above ever ran,
  // making the preload pointless. This is the framework-ordering exception, the same reason
  // Angular's runtime-configuration guidance defers the root module import.
  const { AppModule } = await import('./app/app.module');

  platformBrowserDynamic().bootstrapModule(AppModule)
    .then(ref => {
      //LogStatus('Bootstrap success: ' + ref);
    })
    .catch(err => console.error(err));
}

initAndBootstrap();
