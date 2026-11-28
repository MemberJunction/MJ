import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ShellComponent } from './shell.component';
import { AppSwitcherComponent } from './components/header/app-switcher.component';
import { AppNavComponent } from './components/header/app-nav.component';
import { NotificationPopoverComponent } from './components/header/notification-popover.component';
import { TabContainerComponent } from './components/tabs/tab-container.component';
import { AppAccessDialogComponent } from './components/dialogs/app-access-dialog.component';
import { ShellNoAccessComponent } from './components/no-access/shell-no-access.component';
import { CommandPaletteComponent } from '../command-palette/command-palette.component';
import { OmnibarPaletteComponent } from '../omnibar/omnibar-palette.component';
import { CommandPaletteService } from '../command-palette/command-palette.service';
// Records-style record-open surface (Shell.RecordOpen.Style = 'records')
import { RecordsHubPillComponent } from './components/record-open/records-hub-pill.component';
import { RecordBarComponent } from './components/record-open/record-bar.component';
import { RecordSwitcherSheetComponent } from './components/record-open/record-switcher-sheet.component';
import { UserSettingsModule } from '@memberjunction/ng-explorer-settings/user-settings.module';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { MJDropdownComponent, MJClickableDirective, MJButtonDirective, MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import { SearchModule } from '@memberjunction/ng-search';
import { MJDiagnosticsModule } from '@memberjunction/ng-diagnostics';
// Marks the main content area as a panel a call can share on its own ("This panel").
import { SharePanelDirective } from '@memberjunction/ng-realtime-media';
import {
  UserImpersonationBannerComponent,
  UserImpersonationDialogComponent,
} from '../user-impersonation';

@NgModule({
  declarations: [
    ShellComponent,
    AppSwitcherComponent,
    AppNavComponent,
    TabContainerComponent,
    AppAccessDialogComponent,
    ShellNoAccessComponent,
    CommandPaletteComponent,
    OmnibarPaletteComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    MJDropdownComponent,
    MJClickableDirective,
    MJButtonDirective,
    MJEmptyStateComponent,
    UserSettingsModule,
    SharedGenericModule,
    SearchModule,
    MJDiagnosticsModule,
    RecordsHubPillComponent,
    RecordBarComponent,
    RecordSwitcherSheetComponent,
    SharePanelDirective,
    UserImpersonationBannerComponent,
    UserImpersonationDialogComponent,
    NotificationPopoverComponent
  ],
  providers: [
    CommandPaletteService
  ],
  exports: [
    ShellComponent,
    ShellNoAccessComponent
  ]
})
export class ShellModule { }
