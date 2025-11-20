import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ShellComponent } from './shell.component';
import { AppSwitcherComponent } from './components/header/app-switcher.component';
import { AppNavComponent } from './components/header/app-nav.component';
import { TabContainerComponent } from './components/tabs/tab-container.component';

@NgModule({
  declarations: [
    ShellComponent,
    AppSwitcherComponent,
    AppNavComponent,
    TabContainerComponent
  ],
  imports: [
    CommonModule
  ],
  exports: [
    ShellComponent
  ]
})
export class ShellModule { }
