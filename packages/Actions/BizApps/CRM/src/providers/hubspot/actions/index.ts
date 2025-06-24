/**
 * HubSpot CRM Actions
 * 
 * This module exports all HubSpot CRM-related actions for contact and company management
 */

// Contact Actions
export * from './create-contact.action';
export * from './update-contact.action';
export * from './get-contact.action';
export * from './search-contacts.action';
export * from './delete-contact.action';
export * from './merge-contacts.action';

// Company Actions
export * from './create-company.action';
export * from './update-company.action';
export * from './get-company.action';
export * from './search-companies.action';
export * from './associate-contact-to-company.action';

// Deal Actions
export * from './create-deal.action';
export * from './update-deal.action';
export * from './get-deal.action';
export * from './search-deals.action';
export * from './get-deals-by-contact.action';
export * from './get-deals-by-company.action';

// Activity Management Actions
export * from './log-activity.action';
export * from './create-task.action';
export * from './update-task.action';
export * from './get-activities-by-contact.action';
export * from './get-upcoming-tasks.action';