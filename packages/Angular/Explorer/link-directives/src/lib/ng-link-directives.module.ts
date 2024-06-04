import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EmailLink } from './ng-email-link';
import { FieldLink } from './ng-field-link';
import { WebLink } from './ng-web-link';

@NgModule({
  declarations: [
    EmailLink,
    FieldLink,
    WebLink
  ],
  imports: [
    CommonModule
  ],
  exports: [
    EmailLink,
    FieldLink,
    WebLink
  ]
})
export class LinkDirectivesModule { }