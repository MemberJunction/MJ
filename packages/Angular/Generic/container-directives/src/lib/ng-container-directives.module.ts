import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FillContainer } from './ng-fill-container-directive';
import { Container } from './ng-container-directive';

@NgModule({
  declarations: [
    FillContainer,
    Container
  ],
  imports: [
    CommonModule
  ],
  exports: [
    FillContainer,
    Container
  ]
})
export class ContainerDirectivesModule { }