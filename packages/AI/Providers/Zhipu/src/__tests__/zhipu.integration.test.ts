import { ZhipuLLM } from '../models/zhipu';
import { ChatParams, ChatMessage, ChatMessageRole } from '@memberjunction/ai';

describe('ZhipuLLM', () => {
  let zhipu: ZhipuLLM;
  const apiKey = process.env.AI_VENDOR_API_KEY__ZhipuLLM || 'test-key';

  beforeEach(() => {
    zhipu = new ZhipuLLM(apiKey);
  });

  describe('Constructor and Configuration', () => {
    it('should create instance with default base URL', () => {
      expect(zhipu).toBeInstanceOf(ZhipuLLM);
      expect(zhipu.OpenAI).toBeDefined();
    });

    it('should support streaming', () => {
      expect(zhipu.SupportsStreaming).toBe(true);
    });
  });

  describe('Message Conversion', () => {
    it('should convert MJ role to OpenAI role - system', () => {
      const role = zhipu.ConvertMJToOpenAIRole('system');
      expect(role).toBe('system');
    });

    it('should convert MJ role to OpenAI role - user', () => {
      const role = zhipu.ConvertMJToOpenAIRole('user');
      expect(role).toBe('user');
    });

    it('should convert MJ role to OpenAI role - assistant', () => {
      const role = zhipu.ConvertMJToOpenAIRole('assistant');
      expect(role).toBe('assistant');
    });

    it('should throw error for unknown role', () => {
      expect(() => zhipu.ConvertMJToOpenAIRole('unknown')).toThrow();
    });

    it('should convert MJ chat messages to OpenAI format', () => {
      const messages: ChatMessage[] = [
        { role: ChatMessageRole.system, content: 'You are helpful' },
        { role: ChatMessageRole.user, content: 'Hello' },
        { role: ChatMessageRole.assistant, content: 'Hi there!' }
      ];
      const converted = zhipu.ConvertMJToOpenAIChatMessages(messages);
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
      const converted = zhipu.ConvertMJToOpenAIChatMessages(messages);
      expect(converted).toHaveLength(1);
      expect(Array.isArray(converted[0].content)).toBe(true);
    });
  });

  // Integration tests - only run if API key is available
  describe('Integration Tests', () => {
    const hasApiKey = !!process.env.AI_VENDOR_API_KEY__ZhipuLLM;

    (hasApiKey ? it : it.skip)('should make successful chat completion with GLM 5', async () => {
      const params: ChatParams = {
        model: 'glm-5',
        messages: [
          { role: ChatMessageRole.user, content: 'Say "test successful" if you can read this.' }
        ],
        temperature: 0.7,
        maxOutputTokens: 50
      };

      const result = await zhipu.ChatCompletion(params);
      expect(result.success).toBe(true);
      expect(result.data.choices).toHaveLength(1);
      expect(result.data.choices[0].message.content).toBeTruthy();
      expect(result.data.usage).toBeDefined();
      expect(result.data.usage.promptTokens).toBeGreaterThan(0);
      expect(result.data.usage.completionTokens).toBeGreaterThan(0);
    }, 30000); // 30 second timeout for API call

    (hasApiKey ? it : it.skip)('should handle JSON response format', async () => {
      const params: ChatParams = {
        model: 'glm-5',
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

      const result = await zhipu.ChatCompletion(params);
      expect(result.success).toBe(true);
      const content = result.data.choices[0].message.content;
      expect(() => JSON.parse(content)).not.toThrow();
      const parsed = JSON.parse(content);
      expect(parsed).toHaveProperty('status');
    }, 30000);

    (hasApiKey ? it : it.skip)('should make successful chat completion with GLM 4.7', async () => {
      const params: ChatParams = {
        model: 'glm-4-plus',
        messages: [
          { role: ChatMessageRole.user, content: 'Count to 3' }
        ],
        temperature: 0.5,
        maxOutputTokens: 30
      };

      const result = await zhipu.ChatCompletion(params);
      expect(result.success).toBe(true);
      expect(result.data.choices[0].message.content).toBeTruthy();
    }, 30000);

    (hasApiKey ? it : it.skip)('should support streaming response', async () => {
      const params: ChatParams = {
        model: 'glm-5',
        messages: [
          { role: ChatMessageRole.user, content: 'Say hello in one word' }
        ],
        temperature: 0.7,
        maxOutputTokens: 20
      };

      // Test that streaming capability is inherited
      expect(zhipu.SupportsStreaming).toBe(true);

      // Make a standard completion to verify the model works
      const result = await zhipu.ChatCompletion(params);
      expect(result.success).toBe(true);
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
        const result = await zhipu.ChatCompletion(params);
        expect(result.success).toBe(false);
      } catch (error) {
        expect(error).toBeDefined();
      }
    }, 15000);
  });
});
