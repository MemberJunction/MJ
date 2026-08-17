import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { AuthProviderCatalog } from '@memberjunction/ng-auth-services';
import { environment } from './environments/environment';

async function initAndBootstrap() {
  // Fetch the server's public authentication-provider catalog BEFORE the root module is
  // imported. `AuthServicesModule.forRoot()` runs while the @NgModule decorator's `imports`
  // array is being constructed — i.e. at module-definition time — so the catalog has to be in
  // hand before that module is evaluated. Preload never rejects: on any failure it yields an
  // empty catalog and the app falls back to the compiled `AUTH_TYPE`, so a slow or older server
  // delays the login screen briefly but never blocks it.
  await AuthProviderCatalog.Preload(environment.GRAPHQL_URI);

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
