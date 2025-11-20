import { Routes } from '@angular/router';
import { ChatComponent } from './apps/conversations/chat/chat.component';
import { CollectionsComponent } from './apps/conversations/collections/collections.component';
import { TasksComponent } from './apps/conversations/tasks/tasks.component';
import { SettingsComponent } from './apps/settings/settings.component';
import { ProfileComponent } from './apps/settings/profile/profile.component';
import { NotificationsComponent } from './apps/settings/notifications/notifications.component';
import { AppearanceComponent } from './apps/settings/appearance/appearance.component';
import { CrmDashboardComponent } from './apps/crm/dashboard/dashboard.component';
import { ContactsComponent } from './apps/crm/contacts/contacts.component';
import { ContactDetailComponent } from './apps/crm/contact-detail/contact-detail.component';
import { CompaniesComponent } from './apps/crm/companies/companies.component';
import { OpportunitiesComponent } from './apps/crm/opportunities/opportunities.component';

/**
 * PROTOTYPE: Static Routes
 *
 * TODO FOR PRODUCTION: Implement dynamic route loading
 *
 * Each app should provide its own routes via IApp.GetRoutes()
 * ShellService should:
 * 1. Detect route conflicts (duplicate top-level segments)
 * 2. Prevent loading apps with conflicting routes
 * 3. Allow user to choose which app to enable if conflict exists
 * 4. Dynamically add routes using router.resetConfig()
 *
 * Benefits:
 * - 3rd party apps can be safely loaded as plugins
 * - Route conflicts automatically detected and prevented
 * - User controls which apps are enabled
 * - Apps can be loaded/unloaded without rebuild
 *
 * See FUTURE-ENHANCEMENTS.md for detailed implementation plan
 */
export const routes: Routes = [
  {
    path: '',
    redirectTo: 'conversations/chat',
    pathMatch: 'full'
  },
  {
    path: 'conversations',
    children: [
      { path: '', redirectTo: 'chat', pathMatch: 'full' },
      { path: 'chat', component: ChatComponent },
      { path: 'chat/:threadId', component: ChatComponent },
      { path: 'collections', component: CollectionsComponent },
      { path: 'tasks', component: TasksComponent }
    ]
  },
  {
    path: 'crm',
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', component: CrmDashboardComponent },
      { path: 'contacts', component: ContactsComponent },
      { path: 'contact/:id', component: ContactDetailComponent },
      { path: 'companies', component: CompaniesComponent },
      { path: 'opportunities', component: OpportunitiesComponent }
    ]
  },
  {
    path: 'settings',
    component: SettingsComponent,
    children: [
      { path: '', redirectTo: 'profile', pathMatch: 'full' },
      { path: 'profile', component: ProfileComponent },
      { path: 'notifications', component: NotificationsComponent },
      { path: 'appearance', component: AppearanceComponent }
    ]
  }
];
