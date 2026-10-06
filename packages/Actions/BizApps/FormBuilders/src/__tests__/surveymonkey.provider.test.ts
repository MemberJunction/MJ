import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpClient } from '@memberjunction/network-utils';

/**
 * Per-action tests for the SurveyMonkey provider.
 *
 * Credentials resolve from the BIZAPPS_SURVEYMONKEY_API_TOKEN environment
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
import { CreateSurveyMonkeyAction } from '../providers/surveymonkey/actions/create-survey.action';
import { ExportSurveyMonkeyCSVAction } from '../providers/surveymonkey/actions/export-csv.action';
import { GetSurveyMonkeyResponsesAction } from '../providers/surveymonkey/actions/get-responses.action';
import { GetSingleSurveyMonkeyResponseAction } from '../providers/surveymonkey/actions/get-single-response.action';
import { GetSurveyMonkeyStatisticsAction } from '../providers/surveymonkey/actions/get-statistics.action';
import { GetSurveyMonkeyDetailsAction } from '../providers/surveymonkey/actions/get-survey.action';
import { UpdateSurveyMonkeyAction } from '../providers/surveymonkey/actions/update-survey.action';
import { WatchNewSurveyMonkeyResponsesAction } from '../providers/surveymonkey/actions/watch-new-responses.action';

const contextUser = { ID: 'user-1', Name: 'Test User', Email: 'test@example.com' } as unknown as UserInfo;
const ENV_KEY = 'BIZAPPS_SURVEYMONKEY_API_TOKEN';

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
  http.instance.Post.mockReset();
  http.instance.Patch.mockReset();
  vi.mocked(HttpClient).mockClear();
});

afterEach(() => {
  delete process.env[ENV_KEY];
});

// ─── GetSurveyMonkeyDetailsAction ───────────────────────────────────────────

describe('GetSurveyMonkeyDetailsAction', () => {
  let action: GetSurveyMonkeyDetailsAction;

  beforeEach(() => {
    action = new GetSurveyMonkeyDetailsAction();
  });

  it('should fail with MISSING_CONTEXT_USER when no context user is provided', async () => {
    const result = await runWithoutUser(action, inputs({ SurveyID: 's-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('MISSING_CONTEXT_USER');
    expect(result.Message).toBe('Context user is required for SurveyMonkey API calls');
  });

  it('should fail with MISSING_SURVEY_ID when SurveyID is missing', async () => {
    const result = await run(action, inputs({}));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('MISSING_SURVEY_ID');
    expect(result.Message).toBe('SurveyID parameter is required');
  });

  it('should GET /surveys/{id}/details with the bearer token', async () => {
    http.instance.Get.mockResolvedValue({
      Data: {
        id: 's-1',
        title: 'Customer Survey',
        question_count: 2,
        page_count: 1,
        response_count: 5,
        date_created: '2024-06-01T00:00:00Z',
        date_modified: '2024-06-02T00:00:00Z',
        pages: [],
      },
      Headers: {},
    });

    const result = await run(action, inputs({ SurveyID: 's-1' }));

    expect(HttpClient).toHaveBeenCalledWith(
      expect.objectContaining({
        BaseURL: 'https://api.surveymonkey.com/v3',
        Headers: expect.objectContaining({ Authorization: 'Bearer env-token' }),
      }),
    );
    expect(http.instance.Get).toHaveBeenCalledWith('/surveys/s-1/details');
    expect(result.Success).toBe(true);
    expect(result.ResultCode).toBe('SUCCESS');
    expect(result.Message).toBe('Successfully retrieved survey "Customer Survey" with 2 questions across 1 pages');
  });
});

// ─── CreateSurveyMonkeyAction ───────────────────────────────────────────────

describe('CreateSurveyMonkeyAction', () => {
  let action: CreateSurveyMonkeyAction;

  beforeEach(() => {
    action = new CreateSurveyMonkeyAction();
  });

  it('should fail with MISSING_CONTEXT_USER when no context user is provided', async () => {
    const result = await runWithoutUser(action, inputs({ Title: 'T', Pages: [{}] }));
    expect(result.ResultCode).toBe('MISSING_CONTEXT_USER');
  });

  it('should fail with MISSING_TITLE when Title is missing', async () => {
    const result = await run(action, inputs({ Pages: [{ questions: [] }] }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('MISSING_TITLE');
    expect(result.Message).toBe('Title parameter is required');
  });

  it('should fail with MISSING_PAGES when Pages is missing or empty', async () => {
    const missing = await run(action, inputs({ Title: 'My Survey' }));
    expect(missing.ResultCode).toBe('MISSING_PAGES');
    expect(missing.Message).toBe('Pages parameter is required and must be a non-empty array');

    const empty = await run(action, inputs({ Title: 'My Survey', Pages: [] }));
    expect(empty.ResultCode).toBe('MISSING_PAGES');
  });
});

// ─── ExportSurveyMonkeyCSVAction ────────────────────────────────────────────

describe('ExportSurveyMonkeyCSVAction', () => {
  let action: ExportSurveyMonkeyCSVAction;

  beforeEach(() => {
    action = new ExportSurveyMonkeyCSVAction();
  });

  it('should fail with MISSING_SURVEY_ID when SurveyID is missing', async () => {
    const result = await run(action, inputs({}));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('MISSING_SURVEY_ID');
    expect(result.Message).toBe('SurveyID parameter is required');
  });

  it('should return NO_DATA (Success true) for a survey with no responses', async () => {
    http.instance.Get.mockResolvedValue({ Data: { data: [], per_page: 100, page: 1, total: 0 }, Headers: {}, Status: 200 });

    const result = await run(action, inputs({ SurveyID: 's-1' }));

    expect(result.Success).toBe(true);
    expect(result.ResultCode).toBe('NO_DATA');
  });
});

// ─── GetSurveyMonkeyResponsesAction ─────────────────────────────────────────

describe('GetSurveyMonkeyResponsesAction', () => {
  let action: GetSurveyMonkeyResponsesAction;

  beforeEach(() => {
    action = new GetSurveyMonkeyResponsesAction();
  });

  it('should fail with MISSING_CONTEXT_USER when no context user is provided', async () => {
    const result = await runWithoutUser(action, inputs({ SurveyID: 's-1' }));
    expect(result.ResultCode).toBe('MISSING_CONTEXT_USER');
  });

  it('should fail with MISSING_SURVEY_ID when SurveyID is missing', async () => {
    const result = await run(action, inputs({}));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('MISSING_SURVEY_ID');
    expect(result.Message).toBe('SurveyID parameter is required');
  });
});

// ─── GetSingleSurveyMonkeyResponseAction ────────────────────────────────────

describe('GetSingleSurveyMonkeyResponseAction', () => {
  let action: GetSingleSurveyMonkeyResponseAction;

  beforeEach(() => {
    action = new GetSingleSurveyMonkeyResponseAction();
  });

  it('should fail with MISSING_SURVEY_ID when SurveyID is missing', async () => {
    const result = await run(action, inputs({ ResponseID: 'r-1' }));
    expect(result.ResultCode).toBe('MISSING_SURVEY_ID');
  });

  it('should fail with MISSING_RESPONSE_ID when ResponseID is missing', async () => {
    const result = await run(action, inputs({ SurveyID: 's-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('MISSING_RESPONSE_ID');
    expect(result.Message).toBe('ResponseID parameter is required');
  });
});

// ─── GetSurveyMonkeyStatisticsAction ────────────────────────────────────────

describe('GetSurveyMonkeyStatisticsAction', () => {
  it('should fail with MISSING_SURVEY_ID when SurveyID is missing', async () => {
    const result = await run(new GetSurveyMonkeyStatisticsAction(), inputs({}));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('MISSING_SURVEY_ID');
    expect(result.Message).toBe('SurveyID parameter is required');
  });
});

// ─── UpdateSurveyMonkeyAction ───────────────────────────────────────────────

describe('UpdateSurveyMonkeyAction', () => {
  let action: UpdateSurveyMonkeyAction;

  beforeEach(() => {
    action = new UpdateSurveyMonkeyAction();
  });

  it('should fail with MISSING_SURVEY_ID when SurveyID is missing', async () => {
    const result = await run(action, inputs({ Title: 'New' }));
    expect(result.ResultCode).toBe('MISSING_SURVEY_ID');
  });

  it('should fail with NO_CHANGES_PROVIDED when nothing is being updated', async () => {
    const result = await run(action, inputs({ SurveyID: 's-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('NO_CHANGES_PROVIDED');
    expect(result.Message).toBe('At least one of Title, Pages, Language, or ButtonsText must be provided');
  });
});

// ─── WatchNewSurveyMonkeyResponsesAction ────────────────────────────────────

describe('WatchNewSurveyMonkeyResponsesAction', () => {
  it('should fail with MISSING_SURVEY_ID when SurveyID is missing', async () => {
    const result = await run(new WatchNewSurveyMonkeyResponsesAction(), inputs({}));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('MISSING_SURVEY_ID');
    expect(result.Message).toBe('SurveyID parameter is required');
  });
});
