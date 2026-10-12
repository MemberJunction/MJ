/**
 * Transaction groups from the Explorer UI, end to end.
 *
 * In the Lists app, "Duplicate" saves every member of the copied list in one transaction group, and
 * deleting a list removes its members in one group. The server applies a whole group to each cached
 * result set at once; this spec checks the flow still behaves correctly from the browser:
 *   - each action sends one ExecuteTransactionGroup request carrying every member,
 *   - the UI shows the copy, then shows it gone,
 *   - every MJAPI given returns the members from its cache (an unfiltered read, which the server
 *     keeps up to date in place), then stops returning them after the delete,
 *   - a full reload still shows the copy.
 *
 * EXTRA PREREQUISITES (beyond those in playwright.config.ts):
 *   - PW_API_URL    the MJAPI the Explorer talks to (default http://localhost:4001/).
 *   - PW_API_URL_B  optional: a second MJAPI sharing the same database and Redis. When set, the
 *                   spec also checks that it returns the same members.
 * The spec creates and removes its own list as the signed-in user, with the token the page sends.
 */
import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';

const API_URL = process.env.PW_API_URL ?? 'http://localhost:4001/';
const API_URL_B = process.env.PW_API_URL_B;
const MEMBER_COUNT = 5;
const TAG = 'e2e-tg-list';
const LISTS_PATH = '/app/lists/Lists';

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

/** Sends a GraphQL request to `url` as the signed-in user and returns its data. */
async function graphQL<T>(url: string, authorization: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await response.json()) as GraphQLResponse<T>;
  if (body.errors?.length || !body.data) {
    throw new Error(`GraphQL request to ${url} failed: ${body.errors?.map(e => e.message).join('; ') ?? response.status}`);
  }
  return body.data;
}

interface DynamicViewData {
  RunDynamicView: { Success: boolean; ErrorMessage?: string; Results: Array<{ Data: string }> };
}

/** Rows of `entityName` matching `filter` (empty for all), read through the MJAPI at `url`. */
async function rows<T>(url: string, authorization: string, entityName: string, filter: string, fields: string[]): Promise<T[]> {
  const data = await graphQL<DynamicViewData>(
    url, authorization,
    `query($input: RunDynamicViewInput!) { RunDynamicView(input: $input) { Success ErrorMessage Results { Data } } }`,
    { input: { EntityName: entityName, ExtraFilter: filter, OrderBy: '', Fields: fields } },
  );
  if (!data.RunDynamicView.Success) {
    throw new Error(`RunDynamicView(${entityName}) failed: ${data.RunDynamicView.ErrorMessage}`);
  }
  return data.RunDynamicView.Results.map(r => JSON.parse(r.Data) as T);
}

interface TransactionGroupData {
  ExecuteTransactionGroup: { Success: boolean; ErrorMessages: string[]; ResultsJSON: string[] };
}

/** Runs one transaction group through the MJAPI at API_URL and returns the saved rows. */
async function submitGroup(
  authorization: string, entityName: string, operation: 'Create' | 'Delete', records: Array<Record<string, unknown>>,
): Promise<Array<Record<string, unknown>>> {
  const data = await graphQL<TransactionGroupData>(
    API_URL, authorization,
    `mutation($group: TransactionInputType!) { ExecuteTransactionGroup(group: $group) { Success ErrorMessages ResultsJSON } }`,
    { group: { Items: records.map(r => ({ EntityName: entityName, OperationType: operation, EntityObjectJSON: JSON.stringify(r) })) } },
  );
  if (!data.ExecuteTransactionGroup.Success) {
    throw new Error(`${operation} group for ${entityName} failed: ${data.ExecuteTransactionGroup.ErrorMessages.join('; ')}`);
  }
  return data.ExecuteTransactionGroup.ResultsJSON.map(r => JSON.parse(r) as Record<string, unknown>);
}

/** Creates a list owned by the signed-in user holding MEMBER_COUNT AI Model records. */
async function seedList(authorization: string, name: string): Promise<string> {
  const [entity] = await rows<{ ID: string }>(API_URL, authorization, 'MJ: Entities', `Name = 'MJ: AI Models'`, ['ID']);
  const models = (await rows<{ ID: string }>(API_URL, authorization, 'MJ: AI Models', '', ['ID'])).slice(0, MEMBER_COUNT);
  expect(models, `precondition: at least ${MEMBER_COUNT} AI Models exist`).toHaveLength(MEMBER_COUNT);
  const { CurrentUser } = await graphQL<{ CurrentUser: { ID: string } }>(API_URL, authorization, 'query { CurrentUser { ID } }', {});
  const [list] = await submitGroup(authorization, 'MJ: Lists', 'Create', [
    { Name: name, Description: 'e2e test list; safe to delete', EntityID: entity.ID, UserID: CurrentUser.ID },
  ]);
  const listId = String(list.ID);
  // Members in a second group: the server validates each row before it applies group variables.
  await submitGroup(authorization, 'MJ: List Details', 'Create', models.map((m, i) => ({ ListID: listId, RecordID: m.ID, Sequence: i })));
  return listId;
}

/** Deletes every list this spec ever created (any run), members first, as the signed-in user. */
async function removeSpecLists(authorization: string): Promise<void> {
  const lists = await rows<{ ID: string }>(API_URL, authorization, 'MJ: Lists', `Name LIKE '${TAG}%'`, ['ID']);
  for (const list of lists) {
    const members = await rows<{ ID: string }>(API_URL, authorization, 'MJ: List Details', `ListID = '${list.ID}'`, ['ID']);
    if (members.length > 0) {
      await submitGroup(authorization, 'MJ: List Details', 'Delete', members.map(m => ({ ID: m.ID })));
    }
    await submitGroup(authorization, 'MJ: Lists', 'Delete', [{ ID: list.ID }]);
  }
}

/** Member IDs of `listId` that the MJAPI at `url` returns from an unfiltered read of all members. */
async function membersServed(url: string, authorization: string, listId: string): Promise<number> {
  const all = await rows<{ ID: string; ListID: string }>(url, authorization, 'MJ: List Details', '', ['ID', 'ListID']);
  return all.filter(m => m.ListID.toUpperCase() === listId.toUpperCase()).length;
}

/** Matches exactly `text`, with regular-expression characters taken literally. */
function exactly(text: string): RegExp {
  return new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
}

/** Opens the ⋮ menu of the list card named `name` and clicks `action`. */
async function listMenu(page: Page, name: string, action: 'Duplicate' | 'Delete'): Promise<void> {
  await page.locator('.list-card', { has: page.locator('.card-title', { hasText: exactly(name) }) }).locator('button.menu-btn').click();
  await page.locator('.context-menu').getByRole('button', { name: action }).click();
}

test.describe('Transaction groups from the Explorer UI', () => {
  test('duplicating a list saves its members in one group, and deleting it removes them in one group', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', e => pageErrors.push(e.message));
    let authorization = '';
    const groupItemCounts: number[] = [];
    page.on('request', request => {
      if (!request.url().startsWith(API_URL)) return;
      authorization = request.headers()['authorization'] ?? authorization;
      const body = request.postData() ?? '';
      if (body.includes('ExecuteTransactionGroup')) {
        groupItemCounts.push(((JSON.parse(body) as { variables?: { group?: { Items?: unknown[] } } }).variables?.group?.Items ?? []).length);
      }
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => authorization, { message: 'the page sends an Authorization header to the MJAPI' }).not.toBe('');
    const apis = [API_URL, ...(API_URL_B ? [API_URL_B] : [])];
    const name = `${TAG} ${Date.now()}`;
    const copyName = `${name} (Copy)`;

    try {
      await removeSpecLists(authorization);
      await seedList(authorization, name);
      for (const url of apis) {
        await membersServed(url, authorization, '00000000-0000-0000-0000-000000000000'); // caches the unfiltered read
      }

      await page.goto(LISTS_PATH, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('.card-title', { hasText: exactly(name) })).toBeVisible();
      groupItemCounts.length = 0;
      await listMenu(page, name, 'Duplicate');
      await expect(page.locator('.card-title', { hasText: exactly(copyName) })).toBeVisible();
      await expect.poll(() => groupItemCounts.length).toBe(1);
      expect(groupItemCounts, 'one ExecuteTransactionGroup request carries every member of the copy').toEqual([MEMBER_COUNT]);

      const [copy] = await rows<{ ID: string }>(API_URL, authorization, 'MJ: Lists', `Name = '${copyName}'`, ['ID']);
      for (const url of apis) {
        await expect.poll(() => membersServed(url, authorization, copy.ID),
          { message: `${url} returns every member of the copy from its cache` }).toBe(MEMBER_COUNT);
      }

      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.locator('.card-title', { hasText: exactly(copyName) }), 'after a reload the copy is still listed').toBeVisible();

      groupItemCounts.length = 0;
      await listMenu(page, copyName, 'Delete');
      await page.locator('.confirm-dialog').getByRole('button', { name: /delete/i }).click();
      await expect(page.locator('.card-title', { hasText: exactly(copyName) })).toHaveCount(0);
      expect(groupItemCounts, 'one ExecuteTransactionGroup request removes every member of the copy').toEqual([MEMBER_COUNT]);
      for (const url of apis) {
        await expect.poll(() => membersServed(url, authorization, copy.ID),
          { message: `${url} stops returning the copy's members` }).toBe(0);
      }

      expect(pageErrors, 'no uncaught errors in the page').toEqual([]);
    } finally {
      await removeSpecLists(authorization).catch(e => {
        test.info().annotations.push({ type: 'cleanup failed', description: e instanceof Error ? e.message : String(e) });
      });
    }
  });
});
