import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { VertexLLM } from '../models/vertexLLM';
import { VertexKeySourceOf } from '../vertexCredentials';
import { ChatParams, ChatMessageRole } from '@memberjunction/ai';

/**
 * Live Gemini 3 tests for VertexLLM, skipped unless VERTEX_PROJECT_ID and VERTEX_SERVICE_ACCOUNT_KEY_PATH are set
 * (see vertexLLM.test.ts for the setup).
 *
 * Gemini 3 preview models need the `global` location, so these tests use their own credentials JSON. VertexLLM honours
 * a key file only in its environment key (AI_VENDOR_API_KEY__VertexLLM), and the platform keeps the first environment
 * key it reads for the life of the process, so they run in their own file, apart from the regional tests.
 */

describe('VertexLLM', () => {
  const projectId = process.env.VERTEX_PROJECT_ID || 'test-project';
  const keyPath = process.env.VERTEX_SERVICE_ACCOUNT_KEY_PATH;

  describe('Gemini 3 Models - Integration Tests', () => {
    // Skip actual API calls in CI/CD - only run when credentials are available
    const shouldRunIntegrationTests = process.env.VERTEX_PROJECT_ID &&
                                     process.env.VERTEX_SERVICE_ACCOUNT_KEY_PATH;

    // Gemini 3 preview models require 'global' location, not regional endpoints
    // See: https://github.com/block/goose/issues/6186
    const gemini3CredentialsJson = JSON.stringify({
      project: projectId,
      location: 'global', // Must use global for Gemini 3 preview models
      ...(keyPath ? { keyFilePath: keyPath } : {})
    });

    let vertexLLM: VertexLLM;

    // With a key file, provide the same credentials through the environment key before any driver reads it.
    beforeAll(() => {
      if (keyPath) {
        vi.stubEnv('AI_VENDOR_API_KEY__VertexLLM', gemini3CredentialsJson);
      }
    });

    afterAll(() => {
      vi.unstubAllEnvs();
    });

    beforeEach(() => {
      if (shouldRunIntegrationTests) {
        vertexLLM = new VertexLLM(gemini3CredentialsJson);
      }
    });

    it('provides the key file through the environment key, so the key-file rule accepts it', () => {
      if (!keyPath) {
        console.log('Skipping integration test - credentials not configured');
        return;
      }
      // A refused key would otherwise read below as "not available (preview)".
      expect(VertexKeySourceOf('VertexLLM', gemini3CredentialsJson)).toBe('environment');
    });

    it('should work with Gemini 3 Flash', async () => {
      if (!shouldRunIntegrationTests) {
        console.log('Skipping integration test - credentials not configured');
        return;
      }

      const params: ChatParams = {
        messages: [
          {
            role: ChatMessageRole.user,
            content: 'What is the capital of France? Reply with just the city name.'
          }
        ],
        model: 'gemini-3-flash-preview',
        temperature: 0.1,
        maxOutputTokens: 20
      };

      const result = await vertexLLM.ChatCompletion(params);

      // Gemini 3 models may not be available in all projects (preview status)
      if (!result.success) {
        console.log('Gemini 3 Flash not available (preview), skipping:', result.errorMessage);
        return; // Skip test if model not available
      }

      expect(result.success).toBe(true);
      expect(result.data.choices).toHaveLength(1);
      expect(result.data.choices[0].message.content).toBeTruthy();
      expect(result.data.choices[0].message.content.toLowerCase()).toContain('paris');
    }, 30000);

    it('should work with Gemini 3 Pro for complex reasoning', async () => {
      if (!shouldRunIntegrationTests) {
        console.log('Skipping integration test - credentials not configured');
        return;
      }

      const params: ChatParams = {
        messages: [
          {
            role: ChatMessageRole.user,
            content: 'Write a function in Python that calculates fibonacci numbers. Keep it concise.'
          }
        ],
        model: 'gemini-3-pro-preview',
        temperature: 0.3,
        maxOutputTokens: 200,
        effortLevel: '75' // High reasoning effort
      };

      const result = await vertexLLM.ChatCompletion(params);

      // Gemini 3 models may not be available in all projects (preview status)
      if (!result.success) {
        console.log('Gemini 3 Pro not available (preview), skipping:', result.errorMessage);
        return; // Skip test if model not available
      }

      expect(result.success).toBe(true);
      expect(result.data.choices).toHaveLength(1);
      const content = result.data.choices[0].message.content;
      expect(content).toBeTruthy();
      expect(content.toLowerCase()).toContain('def');
      // Model may use "fib" or "fibonacci" as function name
      expect(content.toLowerCase()).toMatch(/fib(onacci)?/);
    }, 30000);

    it('should handle Gemini 3 Pro Image for image generation', async () => {
      if (!shouldRunIntegrationTests) {
        console.log('Skipping integration test - credentials not configured');
        return;
      }

      const params: ChatParams = {
        messages: [
          {
            role: ChatMessageRole.user,
            content: 'Describe what a blue sky looks like. Keep it brief.'
          }
        ],
        model: 'gemini-3-pro-image-preview',
        temperature: 0.5,
        maxOutputTokens: 100
      };

      const result = await vertexLLM.ChatCompletion(params);

      // Gemini 3 Pro Image may not be available in all projects (preview status)
      if (!result.success) {
        console.log('Gemini 3 Pro Image not available (preview), skipping:', result.errorMessage);
        return; // Skip test if model not available
      }

      expect(result.success).toBe(true);
      expect(result.data.choices).toHaveLength(1);
      expect(result.data.choices[0].message.content).toBeTruthy();
    }, 60000); // Increased timeout for slower image model
  });
});
