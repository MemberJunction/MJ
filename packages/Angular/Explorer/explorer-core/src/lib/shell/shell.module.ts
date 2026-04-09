import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ShellComponent } from './shell.component';
import { AppSwitcherComponent } from './components/header/app-switcher.component';
import { AppNavComponent } from './components/header/app-nav.component';
import { TabContainerComponent } from './components/tabs/tab-container.component';
import { AppAccessDialogComponent } from './components/dialogs/app-access-dialog.component';
import { CommandPaletteComponent } from '../command-palette/command-palette.component';
import { CommandPaletteService } from '../command-palette/command-palette.service';
import { ExplorerSettingsModule } from '@memberjunction/ng-explorer-settings';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { MJDropdownComponent } from '@memberjunction/ng-ui-components';
import { SearchModule } from '@memberjunction/ng-search';

@NgModule({
  declarations: [
    ShellComponent,
    AppSwitcherComponent,
    AppNavComponent,
    TabContainerComponent,
    AppAccessDialogComponent,
    CommandPaletteComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    MJDropdownComponent,
    ExplorerSettingsModule,
    SharedGenericModule,
    SearchModule
  ],
  providers: [
    CommandPaletteService
  ],
  exports: [
    ShellComponent
  ]
})
export class ShellModule { }
