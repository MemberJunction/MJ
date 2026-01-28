import { NgModule } from '@angular/core';
import { HighlightSearchPipe } from './pipes';

/**
 * Shared Pipes Module - exports common pipes for use across dashboard components
 */
@NgModule({
  declarations: [
    HighlightSearchPipe
  ],
  exports: [
    HighlightSearchPipe
  ]
})
export class SharedPipesModule { }
