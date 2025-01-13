import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';  

import { AuthModule } from '@auth0/auth0-angular';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { LayoutModule } from '@progress/kendo-angular-layout';
import { TreeViewModule } from '@progress/kendo-angular-treeview';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { IconsModule } from '@progress/kendo-angular-icons';
import { NotificationModule } from '@progress/kendo-angular-notification';
import { DialogModule } from '@progress/kendo-angular-dialog';
import { environment } from 'src/environments/environment';

import { SkipRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { HeaderComponent } from './header/header.component';
import { AuthButtonComponent } from './auth-button/auth-button.component';
import { NoAccessComponent } from './no-access/no-access.component';
import { SkipComponent } from './skip/skip.component';

import { SkipChatModule } from '@memberjunction/ng-skip-chat';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { SingleReportComponent } from './single-report/single-report.component';
import { ReportListComponent } from './report-list/report-list.component';
import { SettingsComponent } from './settings/settings.component';
import { IndicatorsModule } from '@progress/kendo-angular-indicators';

@NgModule({
  declarations: [
    AppComponent,
    AuthButtonComponent,
    HeaderComponent,
    NoAccessComponent,
    SkipComponent,
    SingleReportComponent,
    ReportListComponent,
    SettingsComponent
  ],
  imports: [
    BrowserModule,
    SkipRoutingModule,
    FormsModule,
    ReactiveFormsModule,
    AuthModule.forRoot({
      domain: environment.CLIENT_AUTHORITY,
      clientId: environment.CLIENT_ID,
      authorizationParams: {
        redirect_uri: window.location.origin
      },
      cacheLocation: 'localstorage', 
    }),
    BrowserAnimationsModule,
    LayoutModule,
    ButtonsModule,
    IconsModule,
    NotificationModule,
    DialogModule,
    SkipChatModule,
    ContainerDirectivesModule,
    TreeViewModule,
    IndicatorsModule
  ],
  providers: [
    CurrencyPipe, 
    DecimalPipe
  ],
  bootstrap: [AppComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class AppModule { 
}
