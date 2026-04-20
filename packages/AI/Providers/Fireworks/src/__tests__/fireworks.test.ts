import { FireworksLLM } from '../models/fireworks';
import { ChatParams, ChatMessage, ChatMessageRole } from '@memberjunction/ai';

describe('FireworksLLM', () => {
  let fireworks: FireworksLLM;
  const apiKey = process.env.AI_VENDOR_API_KEY__FireworksLLM || 'test-key';

  beforeEach(() => {
    fireworks = new FireworksLLM(apiKey);
  });

  describe('Constructor and Configuration', () => {
    it('should create instance with default base URL', () => {
      expect(fireworks).toBeInstanceOf(FireworksLLM);
      expect(fireworks.Client).toBeDefined();
    });

    it('should create instance with custom base URL', () => {
      const customURL = 'https://custom.fireworks.ai/v1';
      const customFireworks = new FireworksLLM(apiKey, customURL);
      expect(customFireworks).toBeInstanceOf(FireworksLLM);
    });

    it('should support streaming', () => {
      expect(fireworks.SupportsStreaming).toBe(true);
    });
  });

  describe('Message Conversion', () => {
    it('should convert MJ role to OpenAI role - system', () => {
      const role = fireworks.ConvertMJToOpenAIRole('system');
      expect(role).toBe('system');
    });

    it('should convert MJ role to OpenAI role - user', () => {
      const role = fireworks.ConvertMJToOpenAIRole('user');
      expect(role).toBe('user');
    });

    it('should convert MJ role to OpenAI role - assistant', () => {
      const role = fireworks.ConvertMJToOpenAIRole('assistant');
      expect(role).toBe('assistant');
    });

    it('should throw error for unknown role', () => {
      expect(() => fireworks.ConvertMJToOpenAIRole('unknown')).toThrow();
    });

    it('should convert MJ chat messages to OpenAI format', () => {
      const messages: ChatMessage[] = [
        { role: ChatMessageRole.system, content: 'You are helpful' },
        { role: ChatMessageRole.user, content: 'Hello' },
        { role: ChatMessageRole.assistant, content: 'Hi there!' }
      ];
      const converted = fireworks.ConvertMJToOpenAIChatMessages(messages);
      expect(converted).toHaveLength(3);
      expect(converted[0]).toHaveProperty('role', 'system');
      expect(converted[0]).toHaveProperty('content', 'You are helpful');
    });

    it('should handle multimodal content with text and images', () => {
      const messages: ChatMessage[] = [{
        role: ChatMessageRole.user,
        content: [
          { type: 'text', content: 'What is in this image?' },
          { type: 'image_url', content: 'https://example.com/image.jpg' }
        ]
      }];
      const converted = fireworks.ConvertMJToOpenAIChatMessages(messages);
      expect(converted).toHaveLength(1);
      expect(Array.isArray(converted[0].content)).toBe(true);
    });
  });

  // Integration tests - only run if API key is available
  describe('Integration Tests', () => {
    const hasApiKey = !!process.env.AI_VENDOR_API_KEY__FireworksLLM;

    (hasApiKey ? it : it.skip)('should make successful chat completion with Kimi K2.5', async () => {
      const params: ChatParams = {
        model: 'accounts/fireworks/models/kimi-k2p5',
        messages: [
          { role: ChatMessageRole.user, content: 'Say "test successful" if you can read this.' }
        ],
        temperature: 0.7,
        maxOutputTokens: 50
      };

      const result = await fireworks.ChatCompletion(params);
      expect(result.success).toBe(true);
      expect(result.data.choices).toHaveLength(1);
      expect(result.data.choices[0].message.content).toBeTruthy();
      expect(result.data.usage).toBeDefined();
      expect(result.data.usage.promptTokens).toBeGreaterThan(0);
      expect(result.data.usage.completionTokens).toBeGreaterThan(0);
    }, 30000); // 30 second timeout for API call

    (hasApiKey ? it : it.skip)('should handle JSON response format', async () => {
      const params: ChatParams = {
        model: 'accounts/fireworks/models/kimi-k2p5',
        messages: [
          {
            role: ChatMessageRole.user,
            content: 'Return a JSON object with a single key "status" set to "ok"'
          }
        ],
        responseFormat: 'JSON',
        temperature: 0.3,
        maxOutputTokens: 50
      };

      const result = await fireworks.ChatCompletion(params);
      expect(result.success).toBe(true);
      const content = result.data.choices[0].message.content;
      expect(() => JSON.parse(content)).not.toThrow();
      const parsed = JSON.parse(content);
      expect(parsed).toHaveProperty('status');
    }, 30000);

    (hasApiKey ? it : it.skip)('should support topK parameter', async () => {
      const params: ChatParams = {
        model: 'accounts/fireworks/models/kimi-k2p5',
        messages: [
          { role: ChatMessageRole.user, content: 'Say hello' }
        ],
        topK: 40,
        temperature: 0.7,
        maxOutputTokens: 20
      };

      const result = await fireworks.ChatCompletion(params);
      expect(result.success).toBe(true);
    }, 30000);

    (hasApiKey ? it : it.skip)('should make successful chat completion with Qwen 3 235B', async () => {
      const params: ChatParams = {
        model: 'accounts/fireworks/models/qwen3-235b-a22b',
        messages: [
          { role: ChatMessageRole.user, content: 'Count to 3' }
        ],
        temperature: 0.5,
        maxOutputTokens: 30
      };

      const result = await fireworks.ChatCompletion(params);
      expect(result.success).toBe(true);
      expect(result.data.choices[0].message.content).toBeTruthy();
    }, 30000);
  });

  describe('Error Handling', () => {
    it('should handle invalid model name gracefully', async () => {
      const params: ChatParams = {
        model: 'invalid-model-that-does-not-exist',
        messages: [{ role: ChatMessageRole.user, content: 'Test' }],
        temperature: 0.7,
        maxOutputTokens: 10
      };

      // This should either throw or return success:false
      try {
        const result = await fireworks.ChatCompletion(params);
        expect(result.success).toBe(false);
      } catch (error) {
        expect(error).toBeDefined();
      }
    }, 15000);
  });
});
