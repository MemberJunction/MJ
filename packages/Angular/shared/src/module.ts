import { NgModule } from '@angular/core';
import { IconsModule } from '@progress/kendo-angular-icons';
import { URLPipe } from './lib/urlPipe';
import { NotificationModule } from '@progress/kendo-angular-notification';

@NgModule({
  declarations: [ 
    URLPipe 
  ],
  imports: [
    IconsModule,
    NotificationModule,
  ],
  exports: [
    URLPipe
  ]
})
export class MemberJunctionSharedModule { }