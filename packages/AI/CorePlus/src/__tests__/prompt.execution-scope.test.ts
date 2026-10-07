import { describe, it, expect } from 'vitest';
import { UserInfo } from '@memberjunction/core';
import { AIPromptParams, PickPromptExecutionScope } from '../prompt.types';

describe('PickPromptExecutionScope', () => {
  it('copies every field that decides who the prompt runs as and which credentials it spends', () => {
    const params = new AIPromptParams();
    params.contextUser = { ID: 'user-1' } as UserInfo;
    params.configurationId = 'config-1';
    params.apiKeys = [{ driverClass: 'GeminiLLM', apiKey: 'customer-key' }];
    params.credentialId = 'credential-1';
    params.CredentialScope = 'RuntimeOnly';

    expect(PickPromptExecutionScope(params)).toEqual({
      contextUser: params.contextUser,
      provider: undefined,
      configurationId: 'config-1',
      apiKeys: params.apiKeys,
      credentialId: 'credential-1',
      CredentialScope: 'RuntimeOnly',
    });
  });

  it('copies nothing else — the internal prompt sets its own prompt, data and parent run', () => {
    const params = new AIPromptParams();
    params.data = { anything: true };
    params.skipValidation = true;
    params.parentPromptRunId = 'parent-1';

    const scope = PickPromptExecutionScope(params);

    expect(Object.keys(scope).sort()).toEqual(
      ['CredentialScope', 'apiKeys', 'configurationId', 'contextUser', 'credentialId', 'provider']
    );
  });
});
