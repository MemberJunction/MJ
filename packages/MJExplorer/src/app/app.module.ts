//***********************************************************
// Angular 
//***********************************************************
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { FormsModule } from '@angular/forms';
import { ReactiveFormsModule } from "@angular/forms";
import { HttpClientModule } from '@angular/common/http'

//***********************************************************
// MJ 
//***********************************************************
import { ExplorerCoreModule } from '@memberjunction/ng-explorer-core';
import { CoreGeneratedFormsModule, LoadCoreGeneratedForms, LoadCoreCustomForms } from '@memberjunction/ng-core-entity-forms';
LoadCoreGeneratedForms(); // prevent tree shaking - dynamic loaded components don't have a static code path to them so Webpack will tree shake them out
LoadCoreCustomForms(); // prevent tree shaking - dynamic loaded components don't have a static code path to them so Webpack will tree shake them out

import { MJAuthBase, MJAuth0Provider, MJMSALProvider } from '@memberjunction/ng-auth-services';
import { UserViewGridModule } from '@memberjunction/ng-user-view-grid';
import { LinkDirectivesModule } from '@memberjunction/ng-link-directives';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { SharedService } from '@memberjunction/ng-shared';
import { LoadResourceWrappers } from '@memberjunction/ng-explorer-core'; 

//***********************************************************
// Kendo
//***********************************************************
import { GridModule } from '@progress/kendo-angular-grid';
import { LayoutModule } from '@progress/kendo-angular-layout';
import { IconsModule } from '@progress/kendo-angular-icons';
import { NavigationModule } from '@progress/kendo-angular-navigation';
import { InputsModule } from '@progress/kendo-angular-inputs';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { LabelModule } from '@progress/kendo-angular-label';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { DialogsModule } from "@progress/kendo-angular-dialog";
import { DateInputsModule } from '@progress/kendo-angular-dateinputs';
import { NotificationModule } from "@progress/kendo-angular-notification";

//***********************************************************
// Auth0
//***********************************************************
import { AuthModule, AuthService } from '@auth0/auth0-angular';

//***********************************************************
//MSAL
//***********************************************************
import { MsalBroadcastService, MsalGuard, MsalGuardConfiguration, MsalModule, MsalRedirectComponent, MsalService } from '@azure/msal-angular';
import { InteractionType, PublicClientApplication } from '@azure/msal-browser';

 

//***********************************************************
// Routing
//***********************************************************
import { AppRoutingModule, CustomReuseStrategy } from './app-routing.module';

//***********************************************************
// Project stuff
//***********************************************************
import { AppComponent } from './app.component';
import { GeneratedFormsModule, LoadGeneratedForms } from './generated/generated-forms.module';
import { environment } from 'src/environments/environment';
import { RouteReuseStrategy } from '@angular/router';
import { ExplorerSettingsModule } from '@memberjunction/ng-explorer-settings';
LoadGeneratedForms(); // prevent tree shaking and component loss through this call
LoadResourceWrappers(); // prevent tree shaking and component loss through this call




/**
 * Set your default interaction type for MSALGuard here. If you have any
 * additional scopes you want the user to consent upon login, add them here as well.
 */
export function MSALGuardConfigFactory(): MsalGuardConfiguration {
  return {
    interactionType: InteractionType.Redirect,
  };
}


@NgModule({
  declarations: [
    AppComponent,
  ],
  imports: [
    BrowserModule,
    FormsModule,
    BrowserAnimationsModule,
    LayoutModule,
    IconsModule,
    InputsModule,
    DateInputsModule,
    NavigationModule,
    ButtonsModule,
    GridModule,
    DropDownsModule,
    LabelModule,
    AppRoutingModule,
    DialogsModule,
    UserViewGridModule,
    ExplorerSettingsModule,
    LinkDirectivesModule,
    ContainerDirectivesModule,
    ExplorerCoreModule,
    CoreGeneratedFormsModule,
    GeneratedFormsModule,
    NotificationModule,
    HttpClientModule,
    ReactiveFormsModule,
    (
      environment.AUTH_TYPE === 'auth0' ?
      AuthModule.forRoot({
          domain: environment.AUTH0_DOMAIN,
           clientId: environment.AUTH0_CLIENTID,
           authorizationParams: {
             redirect_uri: window.location.origin
           },
           cacheLocation: 'localstorage',
         })
      :
      MsalModule.forRoot(new PublicClientApplication({
        auth: {
          clientId: environment.CLIENT_ID, // This is your client ID
          authority: environment.CLIENT_AUTHORITY, // This is your tenant info
          redirectUri: window.location.origin
        },
        cache: {
          cacheLocation: 'localStorage',
          storeAuthStateInCookie: false, // set to true for Internet Explorer 11
        }
      }), {
        interactionType: InteractionType.Redirect, // MSAL Guard Configuration
        authRequest: {
          scopes: ['User.Read']
        }
      }, {
        interactionType: InteractionType.Redirect, // MSAL Interceptor Configuration
        protectedResourceMap: new Map([
          ['https://graph.microsoft.com/v1.0/me', ['user.read']]
        ])
      })
    )
  ],
  providers: [SharedService,
    { provide: RouteReuseStrategy, useClass: CustomReuseStrategy },
    ...(environment.AUTH_TYPE === 'msal' ? [MsalService] : []),
    ...(environment.AUTH_TYPE === 'msal' ? [MsalGuard] : []),
    ...(environment.AUTH_TYPE === 'msal' ? [MsalBroadcastService] : []),
    { provide: MJAuthBase, useClass: environment.AUTH_TYPE === 'auth0' ? MJAuth0Provider : MJMSALProvider },],
  bootstrap: [AppComponent, MsalRedirectComponent]
})
export class AppModule { }