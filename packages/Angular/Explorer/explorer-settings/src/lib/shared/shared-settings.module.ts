import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SettingsCardComponent } from './settings-card.component';

@NgModule({
  declarations: [
    SettingsCardComponent
  ],
  imports: [
    CommonModule
  ],
  exports: [
    SettingsCardComponent
  ]
})
export class SharedSettingsModule { }