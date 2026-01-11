/**
 * List Management Actions
 *
 * These actions provide comprehensive list management capabilities for AI agents,
 * workflows, and other automation scenarios.
 *
 * Available Actions:
 * - Add Records to List: Add one or more records to a list
 * - Remove Records from List: Remove records from a list
 * - Create List: Create a new list with optional initial records
 * - Get List Records: Retrieve records from a list with filtering
 * - Get Record List Membership: Find which lists contain a specific record
 * - Update List Item Status: Bulk update status on list items
 */

export * from './add-records-to-list.action';
export * from './remove-records-from-list.action';
export * from './create-list.action';
export * from './get-list-records.action';
export * from './get-record-list-membership.action';
export * from './update-list-item-status.action';

import { LoadAddRecordsToListAction } from './add-records-to-list.action';
import { LoadRemoveRecordsFromListAction } from './remove-records-from-list.action';
import { LoadCreateListAction } from './create-list.action';
import { LoadGetListRecordsAction } from './get-list-records.action';
import { LoadGetRecordListMembershipAction } from './get-record-list-membership.action';
import { LoadUpdateListItemStatusAction } from './update-list-item-status.action';

/**
 * Load all list-related actions to prevent tree-shaking
 */
export function LoadListActions(): void {
  LoadAddRecordsToListAction();
  LoadRemoveRecordsFromListAction();
  LoadCreateListAction();
  LoadGetListRecordsAction();
  LoadGetRecordListMembershipAction();
  LoadUpdateListItemStatusAction();
}
