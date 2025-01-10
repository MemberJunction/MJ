import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';  

import { AuthModule } from '@auth0/auth0-angular';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { LayoutModule } from '@progress/kendo-angular-layout';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { IconsModule } from '@progress/kendo-angular-icons';
import { NotificationModule } from '@progress/kendo-angular-notification';
import { environment } from 'src/environments/environment';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { HeaderComponent } from './header/header.component';
import { HomeComponent } from './home/home.component';
import { AuthButtonComponent } from './auth-button/auth-button.component';
import { NoAccessComponent } from './no-access/no-access.component';
import { SkipComponent } from './skip/skip.component';
import { EntityListComponent } from './entity-list/entity-list.component';

import { SkipChatModule } from '@memberjunction/ng-skip-chat';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';

@NgModule({
  declarations: [
    AppComponent,
    AuthButtonComponent,
    HeaderComponent,
    HomeComponent,
    NoAccessComponent,
    EntityListComponent,
    SkipComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
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
    SkipChatModule,
    ContainerDirectivesModule
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
