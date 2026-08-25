import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpClient } from '@memberjunction/network-utils';

/**
 * Per-action tests for the Google Forms provider.
 *
 * Credentials resolve from the BIZAPPS_GOOGLE_FORMS_API_TOKEN environment
 * variable, so no database access occurs. The HTTP boundary is the @memberjunction/network-utils
 * module mock — requests use an HttpClient created with a bearer token.
 */

const http = vi.hoisted(() => {
  const instance = {
    Get: vi.fn(),
    Post: vi.fn(),
    Put: vi.fn(),
    Patch: vi.fn(),
    Delete: vi.fn(),
    Head: vi.fn(),
    Request: vi.fn(),
  };
  const standalone = {
    HttpGet: vi.fn(),
    HttpPost: vi.fn(),
    HttpPut: vi.fn(),
    HttpPatch: vi.fn(),
    HttpDelete: vi.fn(),
    HttpHead: vi.fn(),
    HttpRequest: vi.fn(),
  };
  return { instance, standalone };
});

vi.mock('@memberjunction/network-utils', () => ({
  // `new HttpClient(...)` hands back the shared spy instance so assertions can inspect calls.
  HttpClient: vi.fn(function () { return http.instance; }),
  HttpError: class HttpError extends Error {
    Status = 0;
    Data: unknown = undefined;
    Headers: Record<string, string> = {};
  },
  IsHttpError: vi.fn((e: unknown) => typeof e === 'object' && e !== null && 'Status' in e),
  ...http.standalone,
}));

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
import { ExportGoogleFormsCSVAction } from '../providers/google-forms/actions/export-csv.action';
import { GetGoogleFormAction } from '../providers/google-forms/actions/get-form.action';
import { GetSingleGoogleFormsResponseAction } from '../providers/google-forms/actions/get-single-response.action';
import { GetGoogleFormsStatisticsAction } from '../providers/google-forms/actions/get-statistics.action';

const contextUser = { ID: 'user-1', Name: 'Test User', Email: 'test@example.com' } as unknown as UserInfo;
const ENV_KEY = 'BIZAPPS_GOOGLE_FORMS_API_TOKEN';

type RunnableAction = { InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> };

function inputs(values: Record<string, unknown>): ActionParam[] {
  return Object.entries(values).map(([Name, Value]) => ({ Name, Value, Type: 'Input' } as ActionParam));
}

async function run(action: object, params: ActionParam[]): Promise<ActionResultSimple> {
  const runParams = { Params: params, ContextUser: contextUser } as unknown as RunActionParams;
  return (action as RunnableAction).InternalRunAction(runParams);
}

async function runWithoutUser(action: object, params: ActionParam[]): Promise<ActionResultSimple> {
  const runParams = { Params: params, ContextUser: undefined } as unknown as RunActionParams;
  return (action as RunnableAction).InternalRunAction(runParams);
}

beforeEach(() => {
  process.env[ENV_KEY] = 'env-token';
  http.instance.Get.mockReset();
  vi.mocked(HttpClient).mockClear();
});

afterEach(() => {
  delete process.env[ENV_KEY];
});

// ─── GetGoogleFormAction ────────────────────────────────────────────────────

describe('GetGoogleFormAction', () => {
  let action: GetGoogleFormAction;

  beforeEach(() => {
    action = new GetGoogleFormAction();
  });

  it('should fail with MISSING_CONTEXT_USER when no context user is provided', async () => {
    const result = await runWithoutUser(action, inputs({ FormID: 'f-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('MISSING_CONTEXT_USER');
    expect(result.Message).toBe('Context user is required for Google Forms API calls');
  });

  it('should fail with MISSING_FORM_ID when FormID is missing', async () => {
    const result = await run(action, inputs({}));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('MISSING_FORM_ID');
    expect(result.Message).toBe('FormID parameter is required');
  });

  it('should GET /forms/{id} with the bearer token', async () => {
    http.instance.Get.mockResolvedValue({
      Data: {
        formId: 'f-1',
        info: { title: 'My Google Form', documentTitle: 'My Google Form' },
        items: [{ itemId: 'i-1', questionItem: { question: { questionId: 'q-1' } } }],
        revisionId: 'rev-1',
        responderUri: 'https://docs.google.com/forms/d/e/f-1/viewform',
      },
      Headers: {},
    });

    const result = await run(action, inputs({ FormID: 'f-1' }));

    expect(HttpClient).toHaveBeenCalledWith(
      expect.objectContaining({
        BaseURL: 'https://forms.googleapis.com/v1',
        Headers: expect.objectContaining({ Authorization: 'Bearer env-token' }),
      }),
    );
    expect(http.instance.Get).toHaveBeenCalledWith('/forms/f-1');
    expect(result.Success).toBe(true);
    expect(result.ResultCode).toBe('SUCCESS');
    expect(result.Message).toBe('Successfully retrieved Google Form "My Google Form" with 1 questions');
  });
});

// ─── ExportGoogleFormsCSVAction ─────────────────────────────────────────────

describe('ExportGoogleFormsCSVAction', () => {
  let action: ExportGoogleFormsCSVAction;

  beforeEach(() => {
    action = new ExportGoogleFormsCSVAction();
  });

  it('should fail with MISSING_CONTEXT_USER when no context user is provided', async () => {
    const result = await runWithoutUser(action, inputs({ FormID: 'f-1' }));
    expect(result.ResultCode).toBe('MISSING_CONTEXT_USER');
  });

  it('should fail with MISSING_FORM_ID when FormID is missing', async () => {
    const result = await run(action, inputs({}));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('MISSING_FORM_ID');
    expect(result.Message).toBe('FormID parameter is required');
  });

  it('should return NO_DATA (Success true) for a form with no responses', async () => {
    http.instance.Get.mockResolvedValue({ Data: { responses: [] }, Headers: {}, Status: 200 });

    const result = await run(action, inputs({ FormID: 'f-1' }));

    expect(result.Success).toBe(true);
    expect(result.ResultCode).toBe('NO_DATA');
    expect(result.Message).toBe('No responses found for this form');
  });
});

// ─── GetSingleGoogleFormsResponseAction ─────────────────────────────────────

describe('GetSingleGoogleFormsResponseAction', () => {
  let action: GetSingleGoogleFormsResponseAction;

  beforeEach(() => {
    action = new GetSingleGoogleFormsResponseAction();
  });

  it('should fail with MISSING_FORM_ID when FormID is missing', async () => {
    const result = await run(action, inputs({ ResponseID: 'r-1' }));
    expect(result.ResultCode).toBe('MISSING_FORM_ID');
  });

  it('should fail with MISSING_RESPONSE_ID when ResponseID is missing', async () => {
    const result = await run(action, inputs({ FormID: 'f-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('MISSING_RESPONSE_ID');
    expect(result.Message).toBe('ResponseID parameter is required');
  });

  it('should GET /forms/{id}/responses/{responseId} on the happy path', async () => {
    http.instance.Get.mockResolvedValue({
      Data: {
        responseId: 'r-1',
        createTime: '2024-06-15T10:00:00Z',
        lastSubmittedTime: '2024-06-15T10:05:00Z',
        answers: {},
      },
      Headers: {},
    });

    const result = await run(action, inputs({ FormID: 'f-1', ResponseID: 'r-1' }));

    expect(http.instance.Get).toHaveBeenCalledWith('/forms/f-1/responses/r-1');
    expect(result.Success).toBe(true);
    expect(result.ResultCode).toBe('SUCCESS');
  });
});

// ─── GetGoogleFormsStatisticsAction ─────────────────────────────────────────

describe('GetGoogleFormsStatisticsAction', () => {
  it('should fail with MISSING_FORM_ID when FormID is missing', async () => {
    const result = await run(new GetGoogleFormsStatisticsAction(), inputs({}));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('MISSING_FORM_ID');
    expect(result.Message).toBe('FormID parameter is required');
  });
});
