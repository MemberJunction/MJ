import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Per-action tests for the Typeform provider.
 *
 * Credentials resolve from the BIZAPPS_TYPEFORM_API_TOKEN environment variable
 * (set per test), so no database access occurs. The HTTP boundary is the
 * axios module mock (axios.create instance + direct axios.get); the
 * `GetTypeformFormsAction` uses global fetch, stubbed via vi.stubGlobal.
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
import { CreateTypeformAction } from '../providers/typeform/actions/create-form.action';
import { ExportTypeformCSVAction } from '../providers/typeform/actions/export-csv.action';
import { GetTypeformFileContentAction } from '../providers/typeform/actions/get-file-content.action';
import { GetTypeformAction } from '../providers/typeform/actions/get-form.action';
import { GetTypeformFormsAction } from '../providers/typeform/actions/get-forms.action';
import { GetTypeformResponsesAction } from '../providers/typeform/actions/get-responses.action';
import { GetSingleTypeformResponseAction } from '../providers/typeform/actions/get-single-response.action';
import { GetTypeformStatisticsAction } from '../providers/typeform/actions/get-statistics.action';
import { UpdateTypeformAction } from '../providers/typeform/actions/update-form.action';
import { WatchNewTypeformResponsesAction } from '../providers/typeform/actions/watch-new-responses.action';

const contextUser = { ID: 'user-1', Name: 'Test User', Email: 'test@example.com' } as unknown as UserInfo;
const ENV_KEY = 'BIZAPPS_TYPEFORM_API_TOKEN';

type RunnableAction = { InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> };

function inputs(values: Record<string, unknown>): ActionParam[] {
  return Object.entries(values).map(([Name, Value]) => ({ Name, Value, Type: 'Input' } as ActionParam));
}

async function run(action: object, params: ActionParam[]): Promise<ActionResultSimple> {
  const runParams = { Params: params, ContextUser: contextUser } as unknown as RunActionParams;
  return (action as RunnableAction).InternalRunAction(runParams);
}

/** Runs the action with NO context user (MISSING_CONTEXT_USER paths). */
async function runWithoutUser(action: object, params: ActionParam[]): Promise<ActionResultSimple> {
  const runParams = { Params: params, ContextUser: undefined } as unknown as RunActionParams;
  return (action as RunnableAction).InternalRunAction(runParams);
}

/** FormBuilders actions mutate the input params array for outputs. */
function paramValue(params: ActionParam[], name: string): unknown {
  return params.find((p) => p.Name === name)?.Value;
}

beforeEach(() => {
  process.env[ENV_KEY] = 'env-token';
  http.instance.get.mockReset();
  http.instance.post.mockReset();
  http.instance.put.mockReset();
  http.axiosDefault.get.mockReset();
  http.axiosDefault.create.mockClear();
});

afterEach(() => {
  delete process.env[ENV_KEY];
  vi.unstubAllGlobals();
});

// ─── GetTypeformAction ──────────────────────────────────────────────────────

describe('GetTypeformAction', () => {
  let action: GetTypeformAction;

  beforeEach(() => {
    action = new GetTypeformAction();
  });

  it('should fail with MISSING_CONTEXT_USER when no context user is provided', async () => {
    const result = await runWithoutUser(action, inputs({ FormID: 'f-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('MISSING_CONTEXT_USER');
    expect(result.Message).toBe('Context user is required for Typeform API calls');
  });

  it('should fail with MISSING_FORM_ID when FormID is missing', async () => {
    const result = await run(action, inputs({}));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('MISSING_FORM_ID');
    expect(result.Message).toBe('FormID parameter is required');
  });

  it('should GET /forms/{id} with the env-resolved bearer token', async () => {
    http.instance.get.mockResolvedValue({
      data: { id: 'f-1', title: 'My Form', fields: [{ id: 'q1', type: 'short_text' }], settings: {}, logic: [], hidden: [] },
      headers: {},
    });

    const params = inputs({ FormID: 'f-1' });
    const result = await run(action, params);

    expect(http.axiosDefault.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://api.typeform.com',
        headers: expect.objectContaining({ Authorization: 'Bearer env-token' }),
      }),
    );
    expect(http.instance.get).toHaveBeenCalledWith('/forms/f-1');
    expect(result.Success).toBe(true);
    expect(result.ResultCode).toBe('SUCCESS');
    expect(result.Message).toBe('Successfully retrieved form "My Form" with 1 fields');
    expect(paramValue(params, 'Title')).toBe('My Form');
    expect(paramValue(params, 'FieldCount')).toBe(1);
  });
});

// ─── CreateTypeformAction ───────────────────────────────────────────────────

describe('CreateTypeformAction', () => {
  let action: CreateTypeformAction;

  beforeEach(() => {
    action = new CreateTypeformAction();
  });

  it('should fail with MISSING_CONTEXT_USER when no context user is provided', async () => {
    const result = await runWithoutUser(action, inputs({ Title: 'T', Fields: [{}] }));
    expect(result.ResultCode).toBe('MISSING_CONTEXT_USER');
  });

  it('should fail with MISSING_TITLE when Title is missing', async () => {
    const result = await run(action, inputs({ Fields: [{ type: 'short_text' }] }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('MISSING_TITLE');
    expect(result.Message).toBe('Title parameter is required');
  });

  it('should fail with MISSING_FIELDS when Fields is missing or empty', async () => {
    const missing = await run(action, inputs({ Title: 'My Form' }));
    expect(missing.ResultCode).toBe('MISSING_FIELDS');

    const empty = await run(action, inputs({ Title: 'My Form', Fields: [] }));
    expect(empty.ResultCode).toBe('MISSING_FIELDS');
  });
});

// ─── ExportTypeformCSVAction ────────────────────────────────────────────────

describe('ExportTypeformCSVAction', () => {
  let action: ExportTypeformCSVAction;

  beforeEach(() => {
    action = new ExportTypeformCSVAction();
  });

  it('should fail with MISSING_FORM_ID when FormID is missing', async () => {
    const result = await run(action, inputs({}));
    expect(result.ResultCode).toBe('MISSING_FORM_ID');
    expect(result.Message).toBe('FormID parameter is required');
  });

  it('should GET /forms/{id}/responses and return NO_DATA for empty results', async () => {
    http.instance.get.mockResolvedValue({
      data: { total_items: 0, page_count: 0, items: [] },
      headers: {},
    });

    const result = await run(action, inputs({ FormID: 'f-1' }));

    expect(http.instance.get).toHaveBeenCalledWith('/forms/f-1/responses', expect.anything());
    // NOTE (current behavior): the empty-result branch reports Success: true
    // with ResultCode NO_DATA.
    expect(result.Success).toBe(true);
    expect(result.ResultCode).toBe('NO_DATA');
    expect(result.Message).toBe('No responses found matching the criteria');
  });
});

// ─── GetTypeformFileContentAction ───────────────────────────────────────────

describe('GetTypeformFileContentAction', () => {
  let action: GetTypeformFileContentAction;

  beforeEach(() => {
    action = new GetTypeformFileContentAction();
  });

  it('should fail with MISSING_FILE_URL when FileURL is missing', async () => {
    const result = await run(action, inputs({}));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('MISSING_FILE_URL');
    expect(result.Message).toBe('FileURL parameter is required');
  });

  it('should fail with INVALID_FORMAT for unsupported formats', async () => {
    const result = await run(action, inputs({ FileURL: 'https://api.typeform.com/file/1', Format: 'yaml' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('INVALID_FORMAT');
    expect(result.Message).toBe('Format must be one of: auto, text, base64, raw');
  });
});

// ─── GetTypeformFormsAction ─────────────────────────────────────────────────

describe('GetTypeformFormsAction', () => {
  let action: GetTypeformFormsAction;

  beforeEach(() => {
    action = new GetTypeformFormsAction();
  });

  it('should fail with MISSING_CONTEXT_USER when no context user is provided', async () => {
    const result = await runWithoutUser(action, inputs({}));
    expect(result.ResultCode).toBe('MISSING_CONTEXT_USER');
  });

  it('should return ERROR (not API_TOKEN_NOT_FOUND) when no token exists — current behavior', async () => {
    // getSecureAPIToken THROWS when no credential is found, so the
    // API_TOKEN_NOT_FOUND branch in this action is unreachable as written.
    delete process.env[ENV_KEY];
    const result = await run(action, inputs({}));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toContain('No API token found');
  });

  it('should GET https://api.typeform.com/forms with the bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [{ id: 'f-1', title: 'Form One', status: 'public', type: 'quiz' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await run(action, inputs({}));

    expect(fetchMock).toHaveBeenCalledWith('https://api.typeform.com/forms', {
      method: 'GET',
      headers: { Authorization: 'Bearer env-token', 'Content-Type': 'application/json' },
    });
    expect(result.Success).toBe(true);
    expect(result.ResultCode).toBe('SUCCESS');
    expect(result.Message).toBe('Successfully retrieved 1 TypeForms from Typeform API');
  });

  it('should map non-OK responses to API_ERROR', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      text: async () => 'nope',
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await run(action, inputs({}));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('API_ERROR');
    expect(result.Message).toBe('Typeform API error: 403 Forbidden. nope');
  });
});

// ─── GetTypeformResponsesAction ─────────────────────────────────────────────

describe('GetTypeformResponsesAction', () => {
  let action: GetTypeformResponsesAction;

  beforeEach(() => {
    action = new GetTypeformResponsesAction();
  });

  it('should fail with MISSING_FORM_ID when FormID is missing', async () => {
    const result = await run(action, inputs({}));
    expect(result.ResultCode).toBe('MISSING_FORM_ID');
  });

  it('should GET /forms/{id}/responses and report retrieved counts', async () => {
    http.instance.get.mockResolvedValue({
      data: {
        total_items: 1,
        page_count: 1,
        items: [
          {
            landing_id: 'l-1',
            token: 'resp-1',
            landed_at: '2024-06-15T10:00:00Z',
            submitted_at: '2024-06-15T10:05:00Z',
            metadata: { platform: 'other' },
            answers: [{ field: { id: 'q1', type: 'short_text' }, type: 'text', text: 'Hi' }],
          },
        ],
      },
      headers: {},
    });

    const result = await run(action, inputs({ FormID: 'f-1' }));

    expect(http.instance.get).toHaveBeenCalledWith('/forms/f-1/responses', expect.anything());
    expect(result.Success).toBe(true);
    expect(result.ResultCode).toBe('SUCCESS');
    expect(result.Message).toBe('Successfully retrieved 1 responses from Typeform (1 total available)');
  });
});

// ─── GetSingleTypeformResponseAction ────────────────────────────────────────

describe('GetSingleTypeformResponseAction', () => {
  let action: GetSingleTypeformResponseAction;

  beforeEach(() => {
    action = new GetSingleTypeformResponseAction();
  });

  it('should fail with MISSING_FORM_ID when FormID is missing', async () => {
    const result = await run(action, inputs({ ResponseToken: 'tok-1' }));
    expect(result.ResultCode).toBe('MISSING_FORM_ID');
  });

  it('should fail with MISSING_RESPONSE_TOKEN when ResponseToken is missing', async () => {
    const result = await run(action, inputs({ FormID: 'f-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('MISSING_RESPONSE_TOKEN');
    expect(result.Message).toBe('ResponseToken parameter is required');
  });
});

// ─── GetTypeformStatisticsAction ────────────────────────────────────────────

describe('GetTypeformStatisticsAction', () => {
  it('should fail with MISSING_FORM_ID when FormID is missing', async () => {
    const result = await run(new GetTypeformStatisticsAction(), inputs({}));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('MISSING_FORM_ID');
    expect(result.Message).toBe('FormID parameter is required');
  });
});

// ─── UpdateTypeformAction ───────────────────────────────────────────────────

describe('UpdateTypeformAction', () => {
  let action: UpdateTypeformAction;

  beforeEach(() => {
    action = new UpdateTypeformAction();
  });

  it('should fail with MISSING_FORM_ID when FormID is missing', async () => {
    const result = await run(action, inputs({ Title: 'New' }));
    expect(result.ResultCode).toBe('MISSING_FORM_ID');
  });

  it('should fail with MISSING_FIELDS when MergeWithExisting is false and Fields is missing', async () => {
    const result = await run(action, inputs({ FormID: 'f-1', MergeWithExisting: false, Title: 'New' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('MISSING_FIELDS');
    expect(result.Message).toBe('Fields parameter is required when MergeWithExisting is false');
  });
});

// ─── WatchNewTypeformResponsesAction ────────────────────────────────────────

describe('WatchNewTypeformResponsesAction', () => {
  it('should fail with MISSING_FORM_ID when FormID is missing', async () => {
    const result = await run(new WatchNewTypeformResponsesAction(), inputs({}));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('MISSING_FORM_ID');
    expect(result.Message).toBe('FormID parameter is required');
  });
});
