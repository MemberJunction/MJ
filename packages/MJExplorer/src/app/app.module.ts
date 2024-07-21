//***********************************************************
// Angular
//***********************************************************
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { FormsModule } from '@angular/forms';
import { ReactiveFormsModule } from '@angular/forms';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

//***********************************************************
// MJ
//***********************************************************
import { ExplorerCoreModule } from '@memberjunction/ng-explorer-core';
import { CoreGeneratedFormsModule, LoadCoreGeneratedForms, LoadCoreCustomForms } from '@memberjunction/ng-core-entity-forms';
LoadCoreGeneratedForms(); // prevent tree shaking - dynamic loaded components don't have a static code path to them so Webpack will tree shake them out
LoadCoreCustomForms(); // prevent tree shaking - dynamic loaded components don't have a static code path to them so Webpack will tree shake them out

import { AuthServicesModule, RedirectComponent } from '@memberjunction/ng-auth-services';
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
import { DialogsModule } from '@progress/kendo-angular-dialog';
import { DateInputsModule } from '@progress/kendo-angular-dateinputs';
import { NotificationModule } from '@progress/kendo-angular-notification';

//***********************************************************
//MSAL
//***********************************************************
import { MsalGuardConfiguration } from '@azure/msal-angular';
import { InteractionType } from '@azure/msal-browser';

//***********************************************************
// Project stuff
//***********************************************************
import { AppComponent } from './app.component';
import { GeneratedFormsModule, LoadGeneratedForms } from './generated/generated-forms.module';
import { environment } from 'src/environments/environment';
import { ExplorerSettingsModule } from '@memberjunction/ng-explorer-settings';
import { NavigationItemDemoComponent } from './demo/navigation-item.component';

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
  declarations: [AppComponent, NavigationItemDemoComponent],
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
    DialogsModule,
    UserViewGridModule,
    ExplorerSettingsModule,
    LinkDirectivesModule,
    ContainerDirectivesModule,
    ExplorerCoreModule,
    CoreGeneratedFormsModule,
    GeneratedFormsModule,
    NotificationModule,
    ReactiveFormsModule,
    AuthServicesModule.forRoot(environment),
  ],
  providers: [SharedService, provideHttpClient(withInterceptorsFromDi())],
  bootstrap: [AppComponent, RedirectComponent],
})
export class AppModule {}
