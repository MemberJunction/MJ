//***********************************************************
// Angular
//***********************************************************
import { NgModule, APP_INITIALIZER } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { FormsModule } from '@angular/forms';
import { ReactiveFormsModule } from '@angular/forms';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

//***********************************************************
// MJ - Consolidated Module Bundles
//***********************************************************
import {
  MJExplorerModulesBundle,
  SharedService
} from '@memberjunction/ng-explorer-modules';
import { AuthServicesModule, RedirectComponent, MJAuthBase } from '@memberjunction/ng-auth-services';
import { MJExplorerAppModule } from '@memberjunction/ng-explorer-app';

// Lazy loading infrastructure
import { LazyModuleRegistry, LAZY_FEATURE_CONFIG } from '@memberjunction/ng-explorer-core';

// Import lite class registrations manifest (excludes lazy-loaded dashboard and settings packages)
import {CLASS_REGISTRATIONS} from '@memberjunction/ng-bootstrap-lite';

// MJ Academy — the shelter app's one resource component (see app/shelter/). Registered with the
// ClassFactory via @RegisterClass, and reached from Application.DefaultNavItems by DriverClass.
import { EntityViewerModule } from '@memberjunction/ng-entity-viewer';
import { ShelterAnimalsGridComponent, ShelterHousingGridComponent, ShelterBreedsGridComponent, ShelterCareLogsGridComponent } from './shelter/shelter-entity-grid.resource';
import { ShelterDashboardComponent } from './shelter/shelter-dashboard.resource';
import {
  ShelterAnimalsCategoryComponent,
  ShelterHousingCategoryComponent,
  ShelterAdoptionCategoryComponent,
} from './shelter/shelter-categories.resource';
// The rail and page chrome are standalone components, so they are imported directly rather than
// through a module. mj-query-viewer renders a stored Query's results (Occupancy).
import {
  MJLeftNavComponent,
  MJLeftNavContentComponent,
  MJPageLayoutComponent,
  MJPageHeaderComponent,
  MJPageBodyComponent,
} from '@memberjunction/ng-ui-components';
import { QueryViewerModule } from '@memberjunction/ng-query-viewer';

// Import supplemental manifest for user-defined classes — generated at prebuild with
// `mj codegen manifest --exclude-packages @memberjunction --open-app-client-bootstrap`.
// The --open-app-client-bootstrap flag appends side-effect imports for each installed
// Open App's client package (from mj.config dynamicPackages.client) to the end of this
// same file, so installed apps' @RegisterClass decorators run when the bundle loads (B2).
import {CLASS_REGISTRATIONS as LOCAL_CLASSES} from './generated/class-registrations-manifest';

// static code path builder
const combinedClasses = [...CLASS_REGISTRATIONS, ...LOCAL_CLASSES];

//***********************************************************
//MSAL
//***********************************************************
import { MsalGuardConfiguration } from '@azure/msal-angular';
import { InteractionType } from '@azure/msal-browser';

//***********************************************************
// Project stuff
//***********************************************************
import { AppComponent } from './app.component';
import { GeneratedFormsModule } from './generated/generated-forms.module';
import { environment } from '../environments/environment';

/**
 * Set your default interaction type for MSALGuard here. If you have any
 * additional scopes you want the user to consent upon login, add them here as well.
 */
export function MSALGuardConfigFactory(): MsalGuardConfiguration {
  return {
    interactionType: InteractionType.Redirect,
  };
}

/**
 * Initialize auth provider before Angular routing starts
 * This ensures MSAL can process OAuth redirect responses before Angular's router
 * consumes the URL hash
 */
export function initializeAuth(authService: MJAuthBase): () => Promise<void> {
  return () => authService.initialize();
}

@NgModule({
  declarations: [
    AppComponent,
    ShelterDashboardComponent,    // MJ Academy — the app's landing page (isDefault nav item)
    ShelterAnimalsCategoryComponent,   // MJ Academy — top-bar categories, each owning a side rail
    ShelterHousingCategoryComponent,
    ShelterAdoptionCategoryComponent,
    ShelterAnimalsGridComponent,  // MJ Academy — one class per nav item, or the shell
    ShelterHousingGridComponent,  //   highlights every item sharing a DriverClass
    ShelterBreedsGridComponent,
    ShelterCareLogsGridComponent,
  ],
  imports: [
    // MJ Academy — provides <mj-entity-viewer> for ShelterEntityGridComponent
    EntityViewerModule,

    // Angular Core Modules
    BrowserModule,
    // MJ Academy — the shell pieces the category rails are built from
    MJLeftNavComponent,
    MJLeftNavContentComponent,
    MJPageLayoutComponent,
    MJPageHeaderComponent,
    MJPageBodyComponent,
    QueryViewerModule,
    BrowserAnimationsModule,
    FormsModule,
    ReactiveFormsModule,

    // MJ Consolidated Bundle (includes all MJ Explorer modules)
    MJExplorerModulesBundle,

    // Auth (needs forRoot configuration)
    // Resolves against the provider catalog preloaded in main.ts (see AuthProviderCatalog.Preload).
    // No catalog => falls back to environment.AUTH_TYPE, exactly as before.
    AuthServicesModule.forRoot(environment),

    // Explorer App Shell (includes login UI, validation, and mj-shell wrapper)
    MJExplorerAppModule.forRoot(environment),

    // App-specific modules
    GeneratedFormsModule
  ],
  providers: [
    SharedService,
    provideHttpClient(withInterceptorsFromDi()),
    {
      provide: APP_INITIALIZER,
      useFactory: initializeAuth,
      deps: [MJAuthBase],
      multi: true
    },
    {
      provide: APP_INITIALIZER,
      useFactory: (lazyRegistry: LazyModuleRegistry) => () => {
        lazyRegistry.RegisterBulk(LAZY_FEATURE_CONFIG);
        lazyRegistry.WireToClassFactory();
      },
      deps: [LazyModuleRegistry],
      multi: true
    }
  ],
  bootstrap: [AppComponent, RedirectComponent],
})
export class AppModule {}
