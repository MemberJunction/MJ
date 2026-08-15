import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Per-action tests for the CRM HubSpot provider.
 *
 * The SDK boundary is the base class's `makeHubSpotRequest` helper, spied per
 * test (the LMS per-action pattern). Base-class helpers are covered in
 * crm.test.ts.
 */

vi.mock('@memberjunction/actions', () => ({
  BaseAction: class BaseAction {},
  OAuth2Manager: class OAuth2Manager {},
}));

vi.mock('@memberjunction/global', () => ({
  RegisterClass: () => (target: unknown) => target,
  UUIDsEqual: (a: string, b: string) => a === b,
}));

vi.mock('@memberjunction/core', () => ({
  UserInfo: class UserInfo {},
  Metadata: vi.fn(),
  LogStatus: vi.fn(),
  LogError: vi.fn(),
  RunView: vi.fn().mockImplementation(() => ({
    RunView: vi.fn().mockResolvedValue({ Success: true, Results: [] }),
  })),
}));

vi.mock('@memberjunction/core-entities', () => ({
  MJCompanyIntegrationEntity: class MJCompanyIntegrationEntity {},
  MJIntegrationEntity: class MJIntegrationEntity {},
}));

vi.mock('@memberjunction/actions-base', () => ({
  ActionParam: class ActionParam {},
}));

import { UserInfo } from '@memberjunction/core';
import type { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { AssociateContactToCompanyAction } from '../providers/hubspot/actions/associate-contact-to-company.action';
import { GetActivitiesByContactAction } from '../providers/hubspot/actions/get-activities-by-contact.action';
import { LogActivityAction } from '../providers/hubspot/actions/log-activity.action';
import { MergeContactsAction } from '../providers/hubspot/actions/merge-contacts.action';

const contextUser = { ID: 'user-1', Name: 'Test User', Email: 'test@example.com' } as unknown as UserInfo;

type RunnableAction = { InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> };

function inputs(values: Record<string, unknown>, outputs: string[] = []): ActionParam[] {
  const params = Object.entries(values).map(
    ([Name, Value]) => ({ Name, Value, Type: 'Input' } as ActionParam),
  );
  for (const name of outputs) {
    params.push({ Name: name, Value: null, Type: 'Output' } as ActionParam);
  }
  return params;
}

async function run(action: object, params: ActionParam[]): Promise<ActionResultSimple> {
  const runParams = { Params: params, ContextUser: contextUser } as unknown as RunActionParams;
  return (action as RunnableAction).InternalRunAction(runParams);
}

function outParam(result: ActionResultSimple, name: string): unknown {
  return result.Params?.find((p) => p.Name === name)?.Value;
}

// ─── AssociateContactToCompanyAction ────────────────────────────────────────

describe('HubSpot AssociateContactToCompanyAction', () => {
  let action: AssociateContactToCompanyAction;

  beforeEach(() => {
    action = new AssociateContactToCompanyAction();
  });

  it('should fail with VALIDATION_ERROR when ContactIds is missing or empty', async () => {
    const missing = await run(action, inputs({ CompanyID: 'comp-1', CompanyId: 'hs-co-1' }));
    expect(missing.Success).toBe(false);
    expect(missing.ResultCode).toBe('VALIDATION_ERROR');
    expect(missing.Message).toBe('ContactIds is required and must be an array with at least one ID');

    const empty = await run(action, inputs({ CompanyID: 'comp-1', CompanyId: 'hs-co-1', ContactIds: [] }));
    expect(empty.ResultCode).toBe('VALIDATION_ERROR');
  });

  it('should fail with VALIDATION_ERROR when CompanyId is missing', async () => {
    const result = await run(action, inputs({ CompanyID: 'comp-1', ContactIds: ['c-1'] }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('VALIDATION_ERROR');
    expect(result.Message).toBe('CompanyId is required');
  });

  it('should first GET the target company at the SDK boundary', async () => {
    const spy = vi.spyOn(action as never, 'makeHubSpotRequest').mockRejectedValue(new Error('404 not found'));

    const result = await run(action, inputs({ CompanyID: 'comp-1', ContactIds: ['c-1'], CompanyId: 'hs-co-404' }));

    expect(String(spy.mock.calls[0][0])).toContain('objects/companies/hs-co-404');
    expect(result.Success).toBe(false);
    // The catch-all maps 404-style errors to NOT_FOUND for the company lookup
    expect(['NOT_FOUND', 'ERROR']).toContain(result.ResultCode ?? '');
  });
});

// ─── GetActivitiesByContactAction ───────────────────────────────────────────

describe('HubSpot GetActivitiesByContactAction', () => {
  let action: GetActivitiesByContactAction;

  beforeEach(() => {
    action = new GetActivitiesByContactAction();
  });

  it('should fail with VALIDATION_ERROR when ContactId is missing', async () => {
    const result = await run(action, inputs({ CompanyID: 'comp-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('VALIDATION_ERROR');
    expect(result.Message).toBe('ContactId is required');
  });

  it('should return CONTACT_NOT_FOUND when the contact lookup fails', async () => {
    const spy = vi.spyOn(action as never, 'makeHubSpotRequest').mockRejectedValue(new Error('404'));

    const result = await run(action, inputs({ CompanyID: 'comp-1', ContactId: 'c-404' }));

    expect(String(spy.mock.calls[0][0])).toBe('objects/contacts/c-404');
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('CONTACT_NOT_FOUND');
    expect(result.Message).toBe('Contact with ID c-404 not found');
  });
});

// ─── LogActivityAction ──────────────────────────────────────────────────────

describe('HubSpot LogActivityAction', () => {
  let action: LogActivityAction;

  beforeEach(() => {
    action = new LogActivityAction();
  });

  it('should fail with VALIDATION_ERROR when ActivityType is missing', async () => {
    const result = await run(action, inputs({ CompanyID: 'comp-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('VALIDATION_ERROR');
    expect(result.Message).toBe('ActivityType is required');
  });

  it('should fail with VALIDATION_ERROR for unsupported activity types', async () => {
    const result = await run(action, inputs({ CompanyID: 'comp-1', ActivityType: 'CARRIER_PIGEON' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('VALIDATION_ERROR');
    expect(result.Message).toBe('Invalid ActivityType. Must be one of: EMAIL, CALL, MEETING, NOTE');
  });

  it('should POST the engagement with mapped type/metadata at the SDK boundary', async () => {
    const spy = vi.spyOn(action as never, 'makeHubSpotRequest').mockResolvedValue({
      engagement: {
        id: 'eng-1',
        type: 'NOTE',
        timestamp: 1718444400000,
        ownerId: undefined,
        createdAt: 1718444400000,
        updatedAt: 1718444400000,
      },
      associations: { contactIds: ['c-1'] },
    } as never);

    const result = await run(
      action,
      inputs({ CompanyID: 'comp-1', ActivityType: 'note', Body: 'Called the customer', ContactIds: ['c-1'] }, [
        'ActivityDetails',
        'Summary',
      ]),
    );

    const [endpoint, method, body] = spy.mock.calls[0] as unknown as [
      string,
      string,
      { engagement: { type: string }; metadata: Record<string, unknown>; associations: Record<string, unknown> },
    ];
    expect(endpoint).toBe('engagements');
    expect(method).toBe('POST');
    expect(body.engagement.type).toBe('NOTE');
    expect(body.metadata).toEqual(expect.objectContaining({ body: 'Called the customer' }));
    expect(result.Success).toBe(true);
    expect(result.ResultCode).toBe('SUCCESS');
    expect(result.Message).toBe('Successfully logged note activity');
    const summary = outParam(result, 'Summary') as { activityId: string; associatedContacts: number };
    expect(summary.activityId).toBe('eng-1');
    expect(summary.associatedContacts).toBe(1);
  });
});

// ─── MergeContactsAction ────────────────────────────────────────────────────

describe('HubSpot MergeContactsAction', () => {
  let action: MergeContactsAction;

  beforeEach(() => {
    action = new MergeContactsAction();
  });

  it('should fail with VALIDATION_ERROR when neither PrimaryContactId nor PrimaryEmail is provided', async () => {
    const result = await run(action, inputs({ CompanyID: 'comp-1', SecondaryContactIds: ['c-2'] }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('VALIDATION_ERROR');
    expect(result.Message).toBe('Either PrimaryContactId or PrimaryEmail is required');
  });

  it('should fail with VALIDATION_ERROR when no secondary contacts are provided', async () => {
    const result = await run(action, inputs({ CompanyID: 'comp-1', PrimaryContactId: 'c-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('VALIDATION_ERROR');
    expect(result.Message).toBe('Either SecondaryContactIds or SecondaryEmails is required');
  });
});
