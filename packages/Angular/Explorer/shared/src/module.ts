import { NgModule } from '@angular/core';
import { URLPipe } from './lib/urlPipe';
import { NotificationModule } from '@progress/kendo-angular-notification';
import { SimpleTextFormatPipe } from './lib/simpleTextFormat';
import { MJNotificationsModule } from '@memberjunction/ng-notifications';
@NgModule({
  declarations: [ 
    URLPipe,
    SimpleTextFormatPipe
  ],
  imports: [
    NotificationModule,
    MJNotificationsModule
  ],
  exports: [
    URLPipe,
    SimpleTextFormatPipe
  ]
})
export class MemberJunctionSharedModule { }