import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Angular and MJ deps
vi.mock('@angular/core', () => ({ Injectable: () => () => {} }));
vi.mock('@memberjunction/ai-core-plus', () => ({
  AIAgentEntityExtended: class {},
  ConversationUtility: {
    ToPlainText: vi.fn((text: string) => text.replace(/@\{[^}]+\}/g, '@MockName'))
  }
}));
vi.mock('@memberjunction/core', () => ({
  UserInfo: class { ID = ''; Name = ''; Email = ''; }
}));

import { MentionParserService } from '../lib/services/mention-parser.service';

// Create mock agents matching AIAgentEntityExtended shape
function createMockAgent(id: string, name: string): { ID: string; Name: string } {
  return { ID: id, Name: name };
}

function createMockUser(id: string, name: string, email?: string): { ID: string; Name: string; Email?: string } {
  return { ID: id, Name: name, Email: email };
}

describe('MentionParserService', () => {
  let service: MentionParserService;

  beforeEach(() => {
    service = new MentionParserService();
  });

  describe('parseMentions - JSON format', () => {
    it('should parse JSON mention format', () => {
      const text = '@{"type":"agent","id":"123","name":"Sage"} help me';
      const agents = [createMockAgent('123', 'Sage')] as never[];
      const result = service.parseMentions(text, agents);

      expect(result.mentions).toHaveLength(1);
      expect(result.mentions[0].type).toBe('agent');
      expect(result.mentions[0].id).toBe('123');
      expect(result.mentions[0].name).toBe('Sage');
      expect(result.agentMention).not.toBeNull();
    });

    it('should parse JSON mention with config', () => {
      const text = '@{"type":"agent","id":"123","name":"Sage","configId":"cfg-1"} hello';
      const agents = [createMockAgent('123', 'Sage')] as never[];
      const result = service.parseMentions(text, agents);

      expect(result.mentions[0].configurationId).toBe('cfg-1');
    });

    it('should handle invalid JSON gracefully', () => {
      const text = '@{invalid json} hello';
      const agents: never[] = [];
      const result = service.parseMentions(text, agents);
      expect(result.mentions).toHaveLength(0);
    });

    it('should skip mentions missing required fields', () => {
      const text = '@{"type":"agent"} hello';
      const agents: never[] = [];
      const result = service.parseMentions(text, agents);
      expect(result.mentions).toHaveLength(0);
    });
  });

  describe('parseMentions - legacy format', () => {
    it('should match agent by exact name', () => {
      const text = '@Sage help me';
      const agents = [createMockAgent('a1', 'Sage')] as never[];
      const result = service.parseMentions(text, agents);

      expect(result.mentions).toHaveLength(1);
      expect(result.agentMention).not.toBeNull();
      expect(result.agentMention!.name).toBe('Sage');
    });

    it('should match quoted names with spaces', () => {
      const text = '@"Data Agent" help me';
      const agents = [createMockAgent('a2', 'Data Agent')] as never[];
      const result = service.parseMentions(text, agents);

      expect(result.mentions).toHaveLength(1);
      expect(result.agentMention!.name).toBe('Data Agent');
    });

    it('should match agent by starts-with', () => {
      const text = '@Sag help me';
      const agents = [createMockAgent('a1', 'Sage')] as never[];
      const result = service.parseMentions(text, agents);

      expect(result.mentions).toHaveLength(1);
    });

    it('should match users if no agent matches', () => {
      const text = '@John hello';
      const agents: never[] = [];
      const users = [createMockUser('u1', 'John Doe', 'john@test.com')] as never[];
      const result = service.parseMentions(text, agents, users);

      expect(result.mentions).toHaveLength(1);
      expect(result.mentions[0].type).toBe('user');
      expect(result.userMentions).toHaveLength(1);
    });

    it('should separate agent and user mentions', () => {
      const result = service.parseMentions('hello', [] as never[]);
      expect(result.agentMention).toBeNull();
      expect(result.userMentions).toHaveLength(0);
    });
  });

  describe('extractMentionNames', () => {
    it('should extract names from JSON mentions', () => {
      const text = '@{"type":"agent","id":"1","name":"Sage"} and @{"type":"user","id":"2","name":"John"}';
      const names = service.extractMentionNames(text);
      expect(names).toContain('Sage');
      expect(names).toContain('John');
    });

    it('should extract names from legacy mentions', () => {
      const text = '@Sage and @"John Doe" hello';
      const names = service.extractMentionNames(text);
      expect(names).toContain('Sage');
      expect(names).toContain('John Doe');
    });

    it('should return empty for no mentions', () => {
      const names = service.extractMentionNames('no mentions here');
      expect(names).toHaveLength(0);
    });
  });

  describe('validateMentions', () => {
    it('should return invalid JSON mentions', () => {
      const text = '@{"type":"agent","id":"1","name":"Unknown"}';
      const agents: never[] = [];
      const invalid = service.validateMentions(text, agents);
      expect(invalid).toContain('Unknown');
    });

    it('should return empty for valid mentions', () => {
      const text = '@{"type":"agent","id":"1","name":"Sage"}';
      const agents = [createMockAgent('1', 'Sage')] as never[];
      const invalid = service.validateMentions(text, agents);
      expect(invalid).toHaveLength(0);
    });

    it('should validate legacy mentions against agents', () => {
      const text = '@Unknown hello';
      const agents: never[] = [];
      const invalid = service.validateMentions(text, agents);
      expect(invalid).toContain('Unknown');
    });
  });

  describe('formatMentions', () => {
    it('should format mentions with proper names', () => {
      const text = '@"sage" hello';
      const mentions = [{ type: 'agent' as const, id: '1', name: 'Sage' }];
      const formatted = service.formatMentions(text, mentions);
      expect(formatted).toContain('@Sage');
    });
  });

  describe('toPlainText', () => {
    it('should return empty string for empty input', () => {
      expect(service.toPlainText('')).toBe('');
    });

    it('should delegate to ConversationUtility.ToPlainText', () => {
      const result = service.toPlainText('@{"type":"agent","id":"1","name":"Sage"} hello');
      expect(result).toBeDefined();
    });
  });
});
