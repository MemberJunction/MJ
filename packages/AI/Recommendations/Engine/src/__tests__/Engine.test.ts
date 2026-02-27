import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RecommendationRequest, RecommendationResult } from '../generic/types';

describe('RecommendationResult', () => {
  let result: RecommendationResult;
  let mockRequest: RecommendationRequest;

  beforeEach(() => {
    mockRequest = new RecommendationRequest();
    result = new RecommendationResult(mockRequest);
  });

  describe('constructor', () => {
    it('should initialize with Success=true', () => {
      expect(result.Success).toBe(true);
    });

    it('should initialize with empty ErrorMessage', () => {
      expect(result.ErrorMessage).toBe('');
    });

    it('should store the request', () => {
      expect(result.Request).toBe(mockRequest);
    });
  });

  describe('AppendWarning', () => {
    it('should append warning message with prefix', () => {
      result.AppendWarning('Something looks off');
      expect(result.ErrorMessage).toContain('Warning: Something looks off');
    });

    it('should not change Success flag', () => {
      result.AppendWarning('Something looks off');
      expect(result.Success).toBe(true);
    });

    it('should append multiple warnings', () => {
      result.AppendWarning('Warning 1');
      result.AppendWarning('Warning 2');
      expect(result.ErrorMessage).toContain('Warning: Warning 1');
      expect(result.ErrorMessage).toContain('Warning: Warning 2');
    });
  });

  describe('AppendError', () => {
    it('should append error message with prefix', () => {
      result.AppendError('Something failed');
      expect(result.ErrorMessage).toContain('Error: Something failed');
    });

    it('should set Success to false', () => {
      result.AppendError('Something failed');
      expect(result.Success).toBe(false);
    });

    it('should accumulate errors', () => {
      result.AppendError('Error 1');
      result.AppendError('Error 2');
      expect(result.ErrorMessage).toContain('Error: Error 1');
      expect(result.ErrorMessage).toContain('Error: Error 2');
    });
  });

  describe('GetErrorMessages', () => {
    it('should return array of messages', () => {
      result.AppendWarning('Warn 1');
      result.AppendError('Error 1');
      const messages = result.GetErrorMessages();
      expect(messages.length).toBeGreaterThan(0);
    });

    it('should return array with empty string for no messages', () => {
      const messages = result.GetErrorMessages();
      expect(messages).toEqual(['']);
    });

    it('should split messages by newline', () => {
      result.AppendError('First');
      result.AppendError('Second');
      const messages = result.GetErrorMessages();
      // Each AppendError adds "Error: message \n"
      expect(messages.some(m => m.includes('First'))).toBe(true);
      expect(messages.some(m => m.includes('Second'))).toBe(true);
    });
  });

  describe('mixed warnings and errors', () => {
    it('should handle both warnings and errors', () => {
      result.AppendWarning('Warn');
      expect(result.Success).toBe(true);

      result.AppendError('Err');
      expect(result.Success).toBe(false);

      const messages = result.GetErrorMessages();
      expect(messages.some(m => m.includes('Warning'))).toBe(true);
      expect(messages.some(m => m.includes('Error'))).toBe(true);
    });
  });
});

describe('RecommendationRequest', () => {
  it('should create with default empty Recommendations', () => {
    const request = new RecommendationRequest();
    expect(request.Recommendations).toEqual([]);
  });

  it('should accept optional properties', () => {
    const request = new RecommendationRequest();
    request.ListID = 'list-1';
    request.RunID = 'run-1';
    request.CreateErrorList = true;

    expect(request.ListID).toBe('list-1');
    expect(request.RunID).toBe('run-1');
    expect(request.CreateErrorList).toBe(true);
  });

  it('should accept EntityAndRecordsInfo', () => {
    const request = new RecommendationRequest();
    request.EntityAndRecordsInfo = {
      EntityName: 'Contacts',
      RecordIDs: ['id-1', 'id-2'],
    };

    expect(request.EntityAndRecordsInfo.EntityName).toBe('Contacts');
    expect(request.EntityAndRecordsInfo.RecordIDs).toHaveLength(2);
  });

  it('should support generic Options type', () => {
    const request = new RecommendationRequest<{ maxResults: number }>();
    request.Options = { maxResults: 10 };
    expect(request.Options.maxResults).toBe(10);
  });
});
