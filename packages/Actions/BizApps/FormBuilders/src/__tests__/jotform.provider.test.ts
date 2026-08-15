import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Per-action tests for the JotForm provider.
 *
 * Credentials resolve from the BIZAPPS_JOTFORM_API_TOKEN environment variable,
 * so no database access occurs. The HTTP boundary is the axios module mock —
 * JotForm requests go through an axios instance created with the API key in
 * its default query params.
 */

const http = vi.hoisted(() => {
  const instance = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    request: vi.fn(),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    defaults: { headers: { common: {} as Record<string, string> } },
  };
  const axiosDefault = {
    create: vi.fn(() => instance),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    request: vi.fn(),
    isAxiosError: vi.fn(() => false),
  };
  return { instance, axiosDefault };
});

vi.mock('axios', () => ({
  default: http.axiosDefault,
  AxiosError: class AxiosError extends Error {},
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
import { CreateJotFormAction } from '../providers/jotform/actions/create-form.action';
import { ExportJotFormCSVAction } from '../providers/jotform/actions/export-csv.action';
import { GetJotFormAction } from '../providers/jotform/actions/get-form.action';
import { GetSingleJotFormSubmissionAction } from '../providers/jotform/actions/get-single-submission.action';
import { GetJotFormStatisticsAction } from '../providers/jotform/actions/get-statistics.action';
import { GetJotFormSubmissionsAction } from '../providers/jotform/actions/get-submissions.action';
import { UpdateJotFormAction } from '../providers/jotform/actions/update-form.action';
import { WatchNewJotFormSubmissionsAction } from '../providers/jotform/actions/watch-new-submissions.action';

const contextUser = { ID: 'user-1', Name: 'Test User', Email: 'test@example.com' } as unknown as UserInfo;
const ENV_KEY = 'BIZAPPS_JOTFORM_API_TOKEN';

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
  http.instance.get.mockReset();
  http.instance.post.mockReset();
  http.instance.put.mockReset();
  http.axiosDefault.create.mockClear();
});

afterEach(() => {
  delete process.env[ENV_KEY];
});

// ─── GetJotFormAction ───────────────────────────────────────────────────────

describe('GetJotFormAction', () => {
  let action: GetJotFormAction;

  beforeEach(() => {
    action = new GetJotFormAction();
  });

  it('should fail with MISSING_CONTEXT_USER when no context user is provided', async () => {
    const result = await runWithoutUser(action, inputs({ FormID: 'f-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('MISSING_CONTEXT_USER');
    expect(result.Message).toBe('Context user is required for JotForm API calls');
  });

  it('should fail with MISSING_FORM_ID when FormID is missing', async () => {
    const result = await run(action, inputs({}));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('MISSING_FORM_ID');
    expect(result.Message).toBe('FormID parameter is required');
  });

  it('should GET /form/{id} and /form/{id}/questions with the API key in params', async () => {
    http.instance.get.mockImplementation((url: string) => {
      if (url === '/form/f-1') {
        return Promise.resolve({
          data: { responseCode: 200, content: { id: 'f-1', title: 'My JotForm', status: 'ENABLED', url: 'https://form.jotform.com/f-1' } },
          headers: {},
        });
      }
      if (url === '/form/f-1/questions') {
        return Promise.resolve({
          data: { responseCode: 200, content: { q1: { type: 'control_textbox', text: 'Name' } } },
          headers: {},
        });
      }
      return Promise.reject(new Error(`Unmocked GET ${url}`));
    });

    const result = await run(action, inputs({ FormID: 'f-1' }));

    expect(http.axiosDefault.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://api.jotform.com',
        params: { apiKey: 'env-token' },
      }),
    );
    expect(http.instance.get).toHaveBeenCalledWith('/form/f-1', { params: { apiKey: 'env-token' } });
    expect(http.instance.get).toHaveBeenCalledWith('/form/f-1/questions', { params: { apiKey: 'env-token' } });
    expect(result.Success).toBe(true);
    expect(result.ResultCode).toBe('SUCCESS');
    expect(result.Message).toBe('Successfully retrieved form "My JotForm" with 1 questions');
  });
});

// ─── CreateJotFormAction ────────────────────────────────────────────────────

describe('CreateJotFormAction', () => {
  let action: CreateJotFormAction;

  beforeEach(() => {
    action = new CreateJotFormAction();
  });

  it('should fail with MISSING_CONTEXT_USER when no context user is provided', async () => {
    const result = await runWithoutUser(action, inputs({ Title: 'T', Questions: [{}] }));
    expect(result.ResultCode).toBe('MISSING_CONTEXT_USER');
  });

  it('should fail with MISSING_TITLE when Title is missing', async () => {
    const result = await run(action, inputs({ Questions: [{ type: 'control_textbox' }] }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('MISSING_TITLE');
    expect(result.Message).toBe('Title parameter is required');
  });

  it('should fail with MISSING_QUESTIONS when Questions is missing or empty', async () => {
    const missing = await run(action, inputs({ Title: 'My Form' }));
    expect(missing.ResultCode).toBe('MISSING_QUESTIONS');
    expect(missing.Message).toBe('Questions parameter is required and must be a non-empty array');

    const empty = await run(action, inputs({ Title: 'My Form', Questions: [] }));
    expect(empty.ResultCode).toBe('MISSING_QUESTIONS');
  });
});

// ─── ExportJotFormCSVAction ─────────────────────────────────────────────────

describe('ExportJotFormCSVAction', () => {
  let action: ExportJotFormCSVAction;

  beforeEach(() => {
    action = new ExportJotFormCSVAction();
  });

  it('should fail with MISSING_FORM_ID when FormID is missing', async () => {
    const result = await run(action, inputs({}));
    expect(result.ResultCode).toBe('MISSING_FORM_ID');
  });

  it('should fail with INVALID_FILTER for malformed filter JSON', async () => {
    const result = await run(action, inputs({ FormID: 'f-1', Filter: '{not json' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('INVALID_FILTER');
    expect(result.Message).toBe('Filter parameter must be valid JSON object');
  });

  it('should GET /form/{id}/submissions and return NO_DATA for empty results', async () => {
    http.instance.get.mockResolvedValue({ data: { responseCode: 200, content: [] }, headers: {} });

    const result = await run(action, inputs({ FormID: 'f-1' }));

    expect(http.instance.get).toHaveBeenCalledWith('/form/f-1/submissions', expect.anything());
    expect(result.Success).toBe(true);
    expect(result.ResultCode).toBe('NO_DATA');
    expect(result.Message).toBe('No submissions found matching the criteria');
  });
});

// ─── GetSingleJotFormSubmissionAction ───────────────────────────────────────

describe('GetSingleJotFormSubmissionAction', () => {
  it('should fail with MISSING_SUBMISSION_ID when SubmissionID is missing', async () => {
    const result = await run(new GetSingleJotFormSubmissionAction(), inputs({}));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('MISSING_SUBMISSION_ID');
    expect(result.Message).toBe('SubmissionID parameter is required');
  });
});

// ─── GetJotFormStatisticsAction ─────────────────────────────────────────────

describe('GetJotFormStatisticsAction', () => {
  let action: GetJotFormStatisticsAction;

  beforeEach(() => {
    action = new GetJotFormStatisticsAction();
  });

  it('should fail with MISSING_FORM_ID when FormID is missing', async () => {
    const result = await run(action, inputs({}));
    expect(result.ResultCode).toBe('MISSING_FORM_ID');
  });

  it('should fail with INVALID_FILTER for malformed filter JSON', async () => {
    const result = await run(action, inputs({ FormID: 'f-1', Filter: 'not-json{' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('INVALID_FILTER');
  });
});

// ─── GetJotFormSubmissionsAction ────────────────────────────────────────────

describe('GetJotFormSubmissionsAction', () => {
  let action: GetJotFormSubmissionsAction;

  beforeEach(() => {
    action = new GetJotFormSubmissionsAction();
  });

  it('should fail with MISSING_CONTEXT_USER when no context user is provided', async () => {
    const result = await runWithoutUser(action, inputs({ FormID: 'f-1' }));
    expect(result.ResultCode).toBe('MISSING_CONTEXT_USER');
  });

  it('should fail with MISSING_FORM_ID when FormID is missing', async () => {
    const result = await run(action, inputs({}));
    expect(result.ResultCode).toBe('MISSING_FORM_ID');
  });

  it('should fail with INVALID_FILTER for malformed filter JSON', async () => {
    const result = await run(action, inputs({ FormID: 'f-1', Filter: '{{' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('INVALID_FILTER');
    expect(result.Message).toBe('Filter parameter must be a valid JSON object');
  });

  it('should GET /form/{id}/submissions on the happy path', async () => {
    http.instance.get.mockResolvedValue({ data: { responseCode: 200, content: [] }, headers: {} });

    const result = await run(action, inputs({ FormID: 'f-1' }));

    expect(http.instance.get).toHaveBeenCalledWith('/form/f-1/submissions', expect.anything());
    expect(result.Success).toBe(true);
    expect(result.ResultCode).toBe('SUCCESS');
    expect(result.Message).toContain('Successfully retrieved 0 submissions from JotForm');
  });
});

// ─── UpdateJotFormAction ────────────────────────────────────────────────────

describe('UpdateJotFormAction', () => {
  let action: UpdateJotFormAction;

  beforeEach(() => {
    action = new UpdateJotFormAction();
  });

  it('should fail with MISSING_FORM_ID when FormID is missing', async () => {
    const result = await run(action, inputs({ Title: 'New' }));
    expect(result.ResultCode).toBe('MISSING_FORM_ID');
  });

  it('should fail with NO_CHANGES_PROVIDED when nothing is being updated', async () => {
    const result = await run(action, inputs({ FormID: 'f-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('NO_CHANGES_PROVIDED');
    expect(result.Message).toBe('At least one of Title, Questions, or Properties must be provided');
  });
});

// ─── WatchNewJotFormSubmissionsAction ───────────────────────────────────────

describe('WatchNewJotFormSubmissionsAction', () => {
  it('should fail with MISSING_FORM_ID when FormID is missing', async () => {
    const result = await run(new WatchNewJotFormSubmissionsAction(), inputs({}));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('MISSING_FORM_ID');
    expect(result.Message).toBe('FormID parameter is required');
  });
});
