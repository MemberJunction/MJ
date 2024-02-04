import { NgModule } from '@angular/core';
import { IconsModule } from '@progress/kendo-angular-icons';
import { URLPipe } from './lib/urlPipe';
 
@NgModule({
  declarations: [ 
    URLPipe
  ],
  imports: [
    IconsModule
  ],
  exports: [
    URLPipe
  ]
})
export class MemberJunctionSharedModule { }