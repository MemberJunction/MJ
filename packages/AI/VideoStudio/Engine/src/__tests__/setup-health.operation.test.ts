import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseRemotableOperation, type IMetadataProvider, type RemoteOpServerContext, type UserInfo } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { FileStorageEngineBase, type MJAIAgentConfigurationEntity, type MJAIAgentEntity } from '@memberjunction/core-entities';
import { AIAgentPermissionHelper, type AgentStorageAccountResolution } from '@memberjunction/ai-engine-base';
import type { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import type { ModelSelectionPreviewItem } from '@memberjunction/ai-prompts';
import {
  FakeRenderDriver,
  LoadVideoStudioSetupHealthOperation,
  SETUP_HEALTH_NO_STORAGE_MESSAGE,
  SETUP_HEALTH_RENDER_NETWORK_WARNING_ACTION,
  SETUP_HEALTH_RENDER_NETWORK_WARNING_MESSAGE,
  SETUP_HEALTH_STORAGE_ACTION,
  VideoRenderEngine,
  VideoRenderError,
  VideoStudioSetupHealthServerOperation,
  type SetupHealthPromptPreviewRunner,
} from '../index.js';

const AGENT_ID = 'DF2B34D5-091D-4D0A-8222-7B7732BA2D3E';
const PROMPT_ID = '5A3B7AD2-B6E9-4F03-AB71-A8C1EB54B6A4';
const STORAGE_ACCT_ID = '11111111-1111-4111-8111-111111111111';
const DRAFT_CONFIG_ID = '22222222-2222-4222-8222-222222222222';
const STANDARD_CONFIG_ID = '33333333-3333-4333-8333-333333333333';
const HIGH_CONFIG_ID = '44444444-4444-4444-8444-444444444444';

function makeUser(): UserInfo {
  return {
    ID: '99999999-9999-4999-8999-999999999999',
    Name: 'Studio User',
    Email: 'studio@example.com',
  } as unknown as UserInfo;
}

function makeServerContext(user = makeUser()): RemoteOpServerContext {
  return {
    provider: {} as IMetadataProvider,
    user,
    emitProgress: () => undefined,
  };
}

class TestableSetupHealthOperation extends VideoStudioSetupHealthServerOperation {
  public constructor(private readonly runnerStub?: SetupHealthPromptPreviewRunner) {
    super();
  }

  protected override createPromptRunner(): SetupHealthPromptPreviewRunner {
    if (this.runnerStub) {
      return this.runnerStub;
    }
    return super.createPromptRunner();
  }
}

describe('VideoStudioSetupHealthServerOperation (VS-UX-3)', () => {
  let storageResolution: AgentStorageAccountResolution;
  let previewByConfig: Record<string, ModelSelectionPreviewItem[]>;
  let runnerStub: SetupHealthPromptPreviewRunner;

  const fakeAgent = {
    ID: AGENT_ID,
    Name: 'Video Studio',
  } as unknown as MJAIAgentEntity;

  const fakeOrchestratorPrompt = {
    ID: PROMPT_ID,
    Name: 'Video Studio - Orchestrator',
  } as unknown as MJAIPromptEntityExtended;

  const fakePresets: MJAIAgentConfigurationEntity[] = [
    {
      ID: 'A1',
      AgentID: AGENT_ID,
      Name: 'Draft',
      DisplayName: 'Draft',
      AIConfigurationID: DRAFT_CONFIG_ID,
      Status: 'Active',
    } as unknown as MJAIAgentConfigurationEntity,
    {
      ID: 'A2',
      AgentID: AGENT_ID,
      Name: 'Standard',
      DisplayName: 'Standard',
      AIConfigurationID: STANDARD_CONFIG_ID,
      Status: 'Active',
    } as unknown as MJAIAgentConfigurationEntity,
    {
      ID: 'A3',
      AgentID: AGENT_ID,
      Name: 'High',
      DisplayName: 'High',
      AIConfigurationID: HIGH_CONFIG_ID,
      Status: 'Active',
    } as unknown as MJAIAgentConfigurationEntity,
  ];

  beforeEach(() => {
    LoadVideoStudioSetupHealthOperation();

    storageResolution = {
      AccountID: STORAGE_ACCT_ID,
      Source: 'Category',
      Ambiguous: false,
    };

    previewByConfig = {
      [DRAFT_CONFIG_ID]: [
        {
          ModelID: 'm-draft',
          ModelName: 'Gemini 3.1 Flash',
          VendorName: 'Google',
          DriverClass: 'GeminiLLM',
          HasCredentials: true,
        },
      ],
      [STANDARD_CONFIG_ID]: [
        {
          ModelID: 'm-standard',
          ModelName: 'Claude Sonnet 4.6',
          VendorName: 'Anthropic',
          DriverClass: 'AnthropicLLM',
          HasCredentials: true,
        },
      ],
      [HIGH_CONFIG_ID]: [
        {
          ModelID: 'm-high',
          ModelName: 'Claude Opus 4.6',
          VendorName: 'Anthropic',
          DriverClass: 'AnthropicLLM',
          HasCredentials: true,
        },
      ],
    };

    runnerStub = {
      PreviewModelSelection: vi.fn(async (_prompt: MJAIPromptEntityExtended, configurationId?: string) => previewByConfig[configurationId ?? ''] ?? []),
    };

    vi.spyOn(AIEngine, 'Instance', 'get').mockReturnValue({
      Loaded: true,
      Config: vi.fn().mockResolvedValue(undefined),
      GetAgentByName: vi.fn((name: string) => (name === 'Video Studio' ? fakeAgent : undefined)),
      Agents: [fakeAgent],
      Prompts: [fakeOrchestratorPrompt],
      GetAgentConfigurationPresets: vi.fn(() => fakePresets),
      ResolveAgentStorageAccount: vi.fn(() => storageResolution),
    } as unknown as AIEngine);

    vi.spyOn(FileStorageEngineBase, 'Instance', 'get').mockReturnValue({
      Loaded: true,
      Config: vi.fn().mockResolvedValue(undefined),
      GetAccountById: vi.fn((id: string) => (id === STORAGE_ACCT_ID ? { ID: STORAGE_ACCT_ID, Name: 'Studio GCS Bucket' } : undefined)),
      Accounts: [{ ID: STORAGE_ACCT_ID, Name: 'Studio GCS Bucket' }],
    } as unknown as FileStorageEngineBase);

    vi.spyOn(AIAgentPermissionHelper, 'HasPermission').mockResolvedValue(true);

    VideoRenderEngine.Instance.UseDriver(
      new FakeRenderDriver({
        Health: {
          Healthy: true,
          NodeVersion: 'v24.18.0',
          HyperFramesVersion: '0.8.134',
          ChromiumVersion: '146.0.0',
          FfmpegVersion: '7.1.1',
          Errors: [],
        },
      }),
    );
  });

  afterEach(() => {
    VideoRenderEngine.Instance.UseDriver(null);
    vi.restoreAllMocks();
  });

  it('registers VideoStudioSetupHealthServerOperation under BaseRemotableOperation with key VideoStudio.SetupHealth', () => {
    const reg = MJGlobal.Instance.ClassFactory.GetRegistration(BaseRemotableOperation, 'VideoStudio.SetupHealth');
    expect(reg?.SubClass).toBe(VideoStudioSetupHealthServerOperation);
  });

  describe('Authorize', () => {
    it('returns false when user lacks run permission on Video Studio agent', async () => {
      vi.spyOn(AIAgentPermissionHelper, 'HasPermission').mockResolvedValue(false);
      const op = new TestableSetupHealthOperation(runnerStub);

      const res = await op.ExecuteServer({}, makeServerContext());

      expect(res.Success).toBe(false);
      expect(res.ResultCode).toBe('FORBIDDEN');
      expect(AIAgentPermissionHelper.HasPermission).toHaveBeenCalledWith(AGENT_ID, expect.anything(), 'run');
    });

    it('returns false when permission check throws', async () => {
      vi.spyOn(AIAgentPermissionHelper, 'HasPermission').mockRejectedValue(new Error('Permission lookup failed'));
      const op = new TestableSetupHealthOperation(runnerStub);

      const res = await op.ExecuteServer({}, makeServerContext());

      expect(res.Success).toBe(false);
      expect(res.ResultCode).toBe('FORBIDDEN');
    });
  });

  describe('Storage check states', () => {
    it('reports Error with exact message and action when storage source is None', async () => {
      storageResolution = {
        AccountID: null,
        Source: 'None',
        Ambiguous: false,
      };
      const op = new TestableSetupHealthOperation(runnerStub);

      const res = await op.ExecuteServer({}, makeServerContext());

      expect(res.Success).toBe(true);
      expect(res.Output?.Healthy).toBe(false);
      const storage = res.Output?.Checks.find((c) => c.Key === 'Storage');
      expect(storage).toEqual({
        Key: 'Storage',
        Status: 'Error',
        Title: 'File Storage',
        Message: SETUP_HEALTH_NO_STORAGE_MESSAGE,
        Action: SETUP_HEALTH_STORAGE_ACTION,
      });
    });

    it('reports Warning naming the chosen account when storage is Fallback + Ambiguous', async () => {
      storageResolution = {
        AccountID: STORAGE_ACCT_ID,
        Source: 'Fallback',
        Ambiguous: true,
      };
      const op = new TestableSetupHealthOperation(runnerStub);

      const res = await op.ExecuteServer({}, makeServerContext());

      expect(res.Success).toBe(true);
      expect(res.Output?.Healthy).toBe(true);
      const storage = res.Output?.Checks.find((c) => c.Key === 'Storage');
      expect(storage?.Status).toBe('Warning');
      expect(storage?.Message).toContain('Studio GCS Bucket');
      expect(storage?.Action).toBe(SETUP_HEALTH_STORAGE_ACTION);
    });

    it('reports OK with account name and source when storage is explicitly resolved', async () => {
      storageResolution = {
        AccountID: STORAGE_ACCT_ID,
        Source: 'Category',
        Ambiguous: false,
      };
      const op = new TestableSetupHealthOperation(runnerStub);

      const res = await op.ExecuteServer({}, makeServerContext());

      expect(res.Success).toBe(true);
      const storage = res.Output?.Checks.find((c) => c.Key === 'Storage');
      expect(storage).toEqual({
        Key: 'Storage',
        Status: 'OK',
        Title: 'File Storage',
        Message: "Using file storage account 'Studio GCS Bucket' (Category).",
      });
    });
  });

  describe('Render check states', () => {
    it('reports Error naming configured driver and valid drivers when VideoRenderEngine throws UnknownDriver', async () => {
      vi.spyOn(VideoRenderEngine.Instance, 'Driver', 'get').mockImplementation(() => {
        throw new VideoRenderError(
          'UnknownDriver',
          "Unknown video render driver 'Podman' configured in videoStudio.render.driver. Registered drivers: 'LocalWorker', 'Remote', 'Docker'.",
        );
      });
      const op = new TestableSetupHealthOperation(runnerStub);

      const res = await op.ExecuteServer({}, makeServerContext());

      expect(res.Success).toBe(true);
      expect(res.Output?.Healthy).toBe(false);
      const render = res.Output?.Checks.find((c) => c.Key === 'Render');
      expect(render?.Status).toBe('Error');
      expect(render?.Message).toContain('Podman');
      expect(render?.Message).toContain("'LocalWorker', 'Remote', 'Docker'");
      expect(render?.Action).toContain('videoStudio.render.driver');
    });

    it('reports Error with Errors as Details and driver remediation action when worker is unhealthy (ffmpeg missing)', async () => {
      VideoRenderEngine.Instance.UseDriver(
        new FakeRenderDriver({
          Health: {
            Healthy: false,
            NodeVersion: 'v24.18.0',
            HyperFramesVersion: '0.8.134',
            Errors: ['ffmpeg binary not found on PATH'],
          },
        }),
      );
      const op = new TestableSetupHealthOperation(runnerStub);

      const res = await op.ExecuteServer({}, makeServerContext());

      expect(res.Success).toBe(true);
      expect(res.Output?.Healthy).toBe(false);
      const render = res.Output?.Checks.find((c) => c.Key === 'Render');
      expect(render?.Status).toBe('Error');
      expect(render?.Message).toContain('LocalWorker');
      expect(render?.Details).toEqual(['ffmpeg binary not found on PATH']);
      expect(render?.Action).toContain('ffmpeg');
    });

    it('reports Error when Health() exceeds RenderTimeoutMs while allowing background start to continue', async () => {
      vi.useFakeTimers();
      try {
        let backgroundFinished = false;
        const slowDriver = new FakeRenderDriver();
        vi.spyOn(slowDriver, 'Health').mockImplementation(
          () =>
            new Promise((resolve) => {
              setTimeout(() => {
                backgroundFinished = true;
                resolve({
                  Healthy: true,
                  NodeVersion: 'v24.18.0',
                  HyperFramesVersion: '0.8.134',
                  Errors: [],
                });
              }, 5_000);
            }),
        );
        VideoRenderEngine.Instance.UseDriver(slowDriver);

        const op = new TestableSetupHealthOperation(runnerStub);
        const execPromise = op.ExecuteServer({ RenderTimeoutMs: 1_000 }, makeServerContext());

        await vi.advanceTimersByTimeAsync(1_000);
        const res = await execPromise;

        expect(res.Success).toBe(true);
        expect(res.Output?.Healthy).toBe(false);
        const render = res.Output?.Checks.find((c) => c.Key === 'Render');
        expect(render?.Status).toBe('Error');
        expect(render?.Message).toBe("The render worker didn't answer in 1 s (driver LocalWorker).");
        expect(render?.Action).toContain('ffmpeg');

        await vi.advanceTimersByTimeAsync(4_000);
        expect(backgroundFinished).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it('reports OK with version details when worker is healthy and network-isolated', async () => {
      VideoRenderEngine.Instance.UseDriver(
        new FakeRenderDriver({
          Health: {
            Healthy: true,
            NodeVersion: 'v24.18.0',
            HyperFramesVersion: '0.8.134',
            ChromiumVersion: '146.0.0',
            FfmpegVersion: '7.1.1',
            Errors: [],
          },
          IsNetworkIsolated: true,
        }),
      );
      const op = new TestableSetupHealthOperation(runnerStub);

      const res = await op.ExecuteServer({}, makeServerContext());

      expect(res.Success).toBe(true);
      expect(res.Output?.Healthy).toBe(true);
      const render = res.Output?.Checks.find((c) => c.Key === 'Render');
      expect(render?.Status).toBe('OK');
      expect(render?.Details).toEqual(['Node v24.18.0', 'HyperFrames 0.8.134', 'Chromium 146.0.0', 'ffmpeg 7.1.1']);
    });

    it('reports Warning when worker is healthy but Driver.IsNetworkIsolated is false', async () => {
      VideoRenderEngine.Instance.UseDriver(
        new FakeRenderDriver({
          Health: {
            Healthy: true,
            NodeVersion: 'v24.18.0',
            HyperFramesVersion: '0.8.134',
            ChromiumVersion: '146.0.0',
            FfmpegVersion: '7.1.1',
            Errors: [],
          },
          IsNetworkIsolated: false,
        }),
      );
      const op = new TestableSetupHealthOperation(runnerStub);

      const res = await op.ExecuteServer({}, makeServerContext());

      expect(res.Success).toBe(true);
      expect(res.Output?.Healthy).toBe(true);
      const render = res.Output?.Checks.find((c) => c.Key === 'Render');
      expect(render).toEqual({
        Key: 'Render',
        Status: 'Warning',
        Title: 'Render Worker',
        Message: SETUP_HEALTH_RENDER_NETWORK_WARNING_MESSAGE,
        Action: SETUP_HEALTH_RENDER_NETWORK_WARNING_ACTION,
        Details: ['Node v24.18.0', 'HyperFrames 0.8.134', 'Chromium 146.0.0', 'ffmpeg 7.1.1'],
      });
    });
  });

  describe('Models check states', () => {
    it('reports Error with preset, first model, vendor, and action when a preset has no candidate with credentials', async () => {
      previewByConfig[STANDARD_CONFIG_ID] = [
        {
          ModelID: 'm-gemini-pro',
          ModelName: 'Gemini 3.1 Pro',
          VendorName: 'Google',
          DriverClass: 'GeminiLLM',
          HasCredentials: false,
        },
        {
          ModelID: 'm-gemini-flash',
          ModelName: 'Gemini 3.1 Flash',
          VendorName: 'Google',
          DriverClass: 'GeminiLLM',
          HasCredentials: false,
        },
      ];
      const op = new TestableSetupHealthOperation(runnerStub);

      const res = await op.ExecuteServer({}, makeServerContext());

      expect(res.Success).toBe(true);
      expect(res.Output?.Healthy).toBe(false);
      const models = res.Output?.Checks.find((c) => c.Key === 'Models');
      expect(models?.Status).toBe('Error');
      expect(models?.Message).toBe("Standard can't run: no credentials for Gemini 3.1 Pro (Google)");
      expect(models?.Action).toBe('Add a credential for Google');
    });

    it('reports Warning when the primary candidate lacks credentials and a fallback candidate has credentials', async () => {
      previewByConfig[STANDARD_CONFIG_ID] = [
        {
          ModelID: 'm-opus',
          ModelName: 'Claude Opus 4.6',
          VendorName: 'Anthropic',
          DriverClass: 'AnthropicLLM',
          HasCredentials: false,
        },
        {
          ModelID: 'm-gemini-pro',
          ModelName: 'Gemini 3.1 Pro',
          VendorName: 'Google',
          DriverClass: 'GeminiLLM',
          HasCredentials: true,
        },
      ];
      const op = new TestableSetupHealthOperation(runnerStub);

      const res = await op.ExecuteServer({}, makeServerContext());

      expect(res.Success).toBe(true);
      expect(res.Output?.Healthy).toBe(true);
      const models = res.Output?.Checks.find((c) => c.Key === 'Models');
      expect(models?.Status).toBe('Warning');
      expect(models?.Message).toBe('Standard will use Gemini 3.1 Pro instead of Claude Opus 4.6');
      expect(models?.Action).toBe('Add a credential for Anthropic');
    });

    it('reports OK when every active preset has credentials on its primary candidate', async () => {
      const op = new TestableSetupHealthOperation(runnerStub);

      const res = await op.ExecuteServer({}, makeServerContext());

      expect(res.Success).toBe(true);
      expect(res.Output?.Healthy).toBe(true);
      const models = res.Output?.Checks.find((c) => c.Key === 'Models');
      expect(models?.Status).toBe('OK');
      expect(models?.Details).toEqual(['Draft: Gemini 3.1 Flash (Google)', 'Standard: Claude Sonnet 4.6 (Anthropic)', 'High: Claude Opus 4.6 (Anthropic)']);
    });
  });

  describe('Resilience when a check throws', () => {
    it('converts an unexpected check exception into an Error row for that check without failing the operation', async () => {
      vi.spyOn(AIEngine.Instance, 'ResolveAgentStorageAccount').mockImplementation(() => {
        throw new Error('Unexpected storage resolution crash');
      });
      const op = new TestableSetupHealthOperation(runnerStub);

      const res = await op.ExecuteServer({}, makeServerContext());

      expect(res.Success).toBe(true);
      expect(res.Output?.Healthy).toBe(false);
      const storage = res.Output?.Checks.find((c) => c.Key === 'Storage');
      expect(storage).toEqual({
        Key: 'Storage',
        Status: 'Error',
        Title: 'File Storage',
        Message: 'Unexpected storage resolution crash',
      });
      expect(res.Output?.Checks.find((c) => c.Key === 'Render')?.Status).toBe('OK');
      expect(res.Output?.Checks.find((c) => c.Key === 'Models')?.Status).toBe('OK');
    });
  });
});
