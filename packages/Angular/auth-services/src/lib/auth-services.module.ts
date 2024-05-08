import { NgModule, ModuleWithProviders } from '@angular/core';

// Local Components
import { MJAuthBase } from './mjexplorer-auth-base.service';
import { MJAuth0Provider } from './mjexplorer-auth0-provider.service';
import { MJMSALProvider } from './mjexplorer-msal-provider.service';

//***********************************************************
// Auth0
//***********************************************************
import {
  Auth0ClientFactory,
  Auth0ClientService,
  AuthClientConfig,
  AuthConfigService,
  AuthGuard,
  AuthModule,
  AuthService,
} from '@auth0/auth0-angular';

//***********************************************************
//MSAL
//***********************************************************
import {
  MSAL_GUARD_CONFIG,
  MSAL_INSTANCE,
  MSAL_INTERCEPTOR_CONFIG,
  MsalBroadcastService,
  MsalGuard,
  MsalRedirectComponent,
  MsalService,
} from '@azure/msal-angular';
import { InteractionType, PublicClientApplication } from '@azure/msal-browser';

type AuthEnvironment = {
  AUTH_TYPE: string;
  CLIENT_ID: string;
  CLIENT_AUTHORITY: string;
  AUTH0_CLIENTID: string;
  AUTH0_DOMAIN: string;
};

export const RedirectComponent = MsalRedirectComponent;

@NgModule()
export class AuthServicesModule {
  static forRoot(environment: AuthEnvironment): ModuleWithProviders<AuthServicesModule> {
    return {
      ngModule: AuthServicesModule,
      providers: [
        environment.AUTH_TYPE === 'auth0'
          ? [
              AuthService,
              AuthGuard,
              {
                provide: AuthConfigService,
                useValue: {
                  domain: environment.AUTH0_DOMAIN,
                  clientId: environment.AUTH0_CLIENTID,
                  authorizationParams: {
                    redirect_uri: window.location.origin,
                  },
                  cacheLocation: 'localstorage',
                },
              },
              {
                provide: Auth0ClientService,
                useFactory: Auth0ClientFactory.createClient,
                deps: [AuthClientConfig],
              },
            ]
          : [
              {
                provide: MSAL_INSTANCE,
                useValue: new PublicClientApplication({
                  auth: {
                    clientId: environment.CLIENT_ID,
                    authority: environment.CLIENT_AUTHORITY,
                    redirectUri: window.location.origin,
                  },
                  cache: {
                    cacheLocation: 'localStorage',
                    storeAuthStateInCookie: false, // Could move this to environment config - set to true for Internet Explorer 11
                  },
                }),
              },
              {
                provide: MSAL_GUARD_CONFIG,
                useValue: {
                  interactionType: InteractionType.Redirect, // MSAL Guard Configuration
                  authRequest: {
                    scopes: ['User.Read'],
                  },
                },
              },
              {
                provide: MSAL_INTERCEPTOR_CONFIG,
                useValue: {
                  interactionType: InteractionType.Redirect, // MSAL Interceptor Configuration
                  protectedResourceMap: new Map([['https://graph.microsoft.com/v1.0/me', ['user.read']]]),
                },
              },
              MsalService,
              MsalGuard,
              MsalBroadcastService,
            ],
        { provide: MJAuthBase, useClass: environment.AUTH_TYPE === 'auth0' ? MJAuth0Provider : MJMSALProvider },
      ],
    };
  }
}
