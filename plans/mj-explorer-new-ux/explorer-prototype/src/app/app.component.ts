import { Component, OnInit } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { HeaderComponent } from './shell/header/header.component';
import { TabContainerComponent } from './shell/tab-container/tab-container.component';
import { ShellService } from './core/services/shell.service';
import { ConversationsApp } from './apps/conversations/conversations.app';
import { SettingsApp } from './apps/settings/settings.app';
import { CrmApp } from './apps/crm/crm.app';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [HeaderComponent, TabContainerComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  constructor(
    private shellService: ShellService,
    private conversationsApp: ConversationsApp,
    private settingsApp: SettingsApp,
    private crmApp: CrmApp,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Register apps
    this.conversationsApp.Initialize(this.shellService);
    this.settingsApp.Initialize(this.shellService);
    this.crmApp.Initialize(this.shellService);
    this.shellService.RegisterApp(this.conversationsApp);
    this.shellService.RegisterApp(this.settingsApp);
    this.shellService.RegisterApp(this.crmApp);

    // Create initial tab only if no tabs exist (prevent duplicates on refresh)
    if (!this.shellService.HasTabs()) {
      this.shellService.OpenTab({
        AppId: 'conversations',
        Title: 'Chat',
        Route: '/conversations/chat'
      });
    }

    // Set initial active app
    this.shellService.SetActiveApp('conversations');
  }
}
