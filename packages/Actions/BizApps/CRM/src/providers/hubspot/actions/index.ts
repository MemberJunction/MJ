/**
 * HubSpot CRM Custom Actions
 *
 * Generic CRUD operations (create/update/get/search/delete for contacts, companies, deals, tasks)
 * are now handled by the IntegrationActionExecutor. Only custom actions with specialized logic remain here.
 */

// Custom Contact Actions
export * from './merge-contacts.action';

// Custom Company Actions
export * from './associate-contact-to-company.action';

// Custom Activity Actions
export * from './log-activity.action';
export * from './get-activities-by-contact.action';
