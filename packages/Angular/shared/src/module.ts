import { NgModule } from '@angular/core';
import { URLPipe } from './lib/urlPipe';
import { NotificationModule } from '@progress/kendo-angular-notification';

@NgModule({
  declarations: [ 
    URLPipe 
  ],
  imports: [
    NotificationModule,
  ],
  exports: [
    URLPipe
  ]
})
export class MemberJunctionSharedModule { }