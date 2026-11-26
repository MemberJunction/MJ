import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IMetadataProvider } from '@memberjunction/core';
import {
  AVATAR_GENERATE_IMAGE_FALLBACK_ID,
} from './avatar-studio.types';

interface CapturedCall {
  actionId: string;
  params: Array<{ Name: string; Value: string | number | boolean | object | null; Type: string }>;
}

interface MockActionResult {
  Success: boolean;
  Message: string;
  Result: object | null;
  LogEntry: null;
  Params: Array<{ Name: string; Value: string | number | boolean | object | null; Type: string }>;
  RunParams: null;
}

const mockState = {
  runViewResult: { Success: true, Results: [] as Array<{ ID: string }> },
  runActionCalls: [] as CapturedCall[],
  runActionQueue: [] as MockActionResult[],
};

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  return {
    ...actual,
    LogError: vi.fn(),
    RunView: {
      FromMetadataProvider: () => ({
        RunView: vi.fn(async () => mockState.runViewResult),
      }),
    },
  };
});

vi.mock('@memberjunction/graphql-dataprovider', () => ({
  GraphQLDataProvider: class {},
  GraphQLActionClient: class {
    public async RunAction(
      actionId: string,
      params?: Array<{ Name: string; Value: string | number | boolean | object | null; Type: string }>
    ): Promise<MockActionResult> {
      mockState.runActionCalls.push({ actionId, params: params ?? [] });
      return (
        mockState.runActionQueue.shift() ?? {
          Success: true,
          Message: 'OK',
          Result: [],
          LogEntry: null,
          Params: [],
          RunParams: null,
        }
      );
    }
  },
}));

import { AvatarGeneratorService } from './avatar-generator.service';

describe('AvatarGeneratorService', () => {
  let service: AvatarGeneratorService;
  let provider: IMetadataProvider;

  beforeEach(() => {
    service = new AvatarGeneratorService();
    provider = {} as IMetadataProvider;
    mockState.runViewResult = { Success: true, Results: [] };
    mockState.runActionCalls = [];
    mockState.runActionQueue = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves Generate Image action ID from MJ: Actions and caches per provider', async () => {
    const customActionId = '11111111-2222-4333-8444-555555555555';
    mockState.runViewResult = { Success: true, Results: [{ ID: customActionId }] };

    const first = await service.ResolveGenerateImageActionId(provider);
    mockState.runViewResult = { Success: true, Results: [{ ID: 'should-not-requery' }] };
    const second = await service.ResolveGenerateImageActionId(provider);

    expect(first).toBe(customActionId);
    expect(second).toBe(customActionId);
  });

  it('falls back to canonical Generate Image action ID when query returns empty', async () => {
    mockState.runViewResult = { Success: true, Results: [] };
    const id = await service.ResolveGenerateImageActionId(provider);
    expect(id).toBe(AVATAR_GENERATE_IMAGE_FALLBACK_ID);
  });

  it('generates an avatar from index-keyed Result payload and returns raw PNG base64', async () => {
    mockState.runActionQueue.push({
      Success: true,
      Message: 'OK',
      Result: {
        0: {
          Name: 'Images',
          Type: 'Output',
          Value: [
            {
              modality: 'Image',
              mimeType: 'image/png',
              data: 'cG5nLWRhdGE=',
            },
          ],
        },
      },
      LogEntry: null,
      Params: [],
      RunParams: null,
    });

    const result = await service.GenerateAvatar('Minimalist teal owl icon', provider);

    expect(result.Success).toBe(true);
    expect(result.DataUrl).toBe('data:image/png;base64,cG5nLWRhdGE=');
    expect(result.RawPngBase64).toBe('cG5nLWRhdGE=');
    expect(mockState.runActionCalls).toHaveLength(1);
    expect(mockState.runActionCalls[0].actionId).toBe(AVATAR_GENERATE_IMAGE_FALLBACK_ID);
    expect(mockState.runActionCalls[0].params.find((p) => p.Name === 'Prompt')?.Value).toBe(
      'Minimalist teal owl icon'
    );
  });

  it('refines an existing avatar passing cached raw PNG base64 as SourceImage', async () => {
    mockState.runActionQueue.push({
      Success: true,
      Message: 'Edited',
      Result: {
        Params: [
          {
            Name: 'Images',
            Type: 'Output',
            Value: [{ modality: 'Image', mimeType: 'image/png', data: 'cmVmaW5lZA==' }],
          },
        ],
      },
      LogEntry: null,
      Params: [],
      RunParams: null,
    });

    const result = await service.RefineAvatar(
      'Add sleek glasses',
      'data:image/webp;base64,d2VicA==',
      provider,
      { DataUri: 'data:image/webp;base64,d2VicA==', PngBase64: 'b3JpZ2luYWwtcG5n' }
    );

    expect(result.Success).toBe(true);
    expect(result.RawPngBase64).toBe('cmVmaW5lZA==');
    expect(mockState.runActionCalls[0].params.find((p) => p.Name === 'SourceImage')?.Value).toBe(
      'b3JpZ2luYWwtcG5n'
    );
  });

  it('returns clear error when prompt is empty or action fails', async () => {
    const emptyRes = await service.GenerateAvatar('   ', provider);
    expect(emptyRes.Success).toBe(false);
    expect(emptyRes.ErrorMessage).toContain('description');

    mockState.runActionQueue.push({
      Success: false,
      Message: 'No active image model',
      Result: null,
      LogEntry: null,
      Params: [],
      RunParams: null,
    });
    const failedRes = await service.GenerateAvatar('Test avatar', provider);
    expect(failedRes.Success).toBe(false);
    expect(failedRes.ErrorMessage).toBe('No active image model');
  });

  it('strips data URL prefix when building SourceImage in non-DOM environments', async () => {
    const source = await service.BuildSourceImageForEdit('data:image/webp;base64,YWJjMTIz');
    expect(source).toBe('YWJjMTIz');

    const urlSource = await service.BuildSourceImageForEdit('https://cdn.example.com/avatar.png');
    expect(urlSource).toBe('https://cdn.example.com/avatar.png');
  });

  it('rejects non-image uploads in ProcessUploadedFile', async () => {
    const fakeTxt = { type: 'text/plain', name: 'notes.txt' } as unknown as File;
    await expect(service.ProcessUploadedFile(fakeTxt)).rejects.toThrow('Please select an image file');
  });
});
