import { NgModule } from '@angular/core';
import { URLPipe } from './lib/urlPipe';
import { NotificationModule } from '@progress/kendo-angular-notification';
import { SimpleTextFormatPipe } from './lib/simpleTextFormat';

@NgModule({
  declarations: [ 
    URLPipe,
    SimpleTextFormatPipe
  ],
  imports: [
    NotificationModule,
  ],
  exports: [
    URLPipe,
    SimpleTextFormatPipe
  ]
})
export class MemberJunctionSharedModule { }