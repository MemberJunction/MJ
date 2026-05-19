import { NgModule } from '@angular/core';
import { URLPipe } from './lib/urlPipe';
import { SimpleTextFormatPipe } from './lib/simpleTextFormat';
import { MJNotificationsModule } from '@memberjunction/ng-notifications';
@NgModule({
  declarations: [
    URLPipe,
    SimpleTextFormatPipe
  ],
  imports: [
    MJNotificationsModule
  ],
  exports: [
    URLPipe,
    SimpleTextFormatPipe
  ]
})
export class MemberJunctionSharedModule { }