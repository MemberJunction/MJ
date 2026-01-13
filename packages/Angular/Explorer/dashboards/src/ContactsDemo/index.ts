// Contacts Demo Dashboard Components
export { ContactsOverviewResourceComponent, LoadContactsOverviewResource } from './components/contacts-overview-resource.component';
export { ContactsActivitiesResourceComponent, LoadContactsActivitiesResource } from './components/contacts-activities-resource.component';
export { ContactsInsightsResourceComponent, LoadContactsInsightsResource } from './components/contacts-insights-resource.component';
export { ContactsTagsResourceComponent, LoadContactsTagsResource } from './components/contacts-tags-resource.component';
export { ActivityEditPanelComponent, LoadActivityEditPanel } from './components/activity-edit-panel.component';

// Tree-shaking prevention - call all loaders
export function LoadContactsDemoResources() {
  LoadContactsOverviewResource();
  LoadContactsActivitiesResource();
  LoadContactsInsightsResource();
  LoadContactsTagsResource();
  LoadActivityEditPanel();
}

// Re-import to ensure the loaders are executed
import { LoadContactsOverviewResource } from './components/contacts-overview-resource.component';
import { LoadContactsActivitiesResource } from './components/contacts-activities-resource.component';
import { LoadContactsInsightsResource } from './components/contacts-insights-resource.component';
import { LoadContactsTagsResource } from './components/contacts-tags-resource.component';
import { LoadActivityEditPanel } from './components/activity-edit-panel.component';
