import { describe, it, expect, beforeEach } from 'vitest';
import { ReactDebugConfig } from '../lib/config/react-debug.config';

describe('ReactDebugConfig', () => {
  beforeEach(() => {
    ReactDebugConfig.DEBUG_MODE = false;
    if (typeof window !== 'undefined') {
      delete (window as unknown as Record<string, unknown>).__MJ_REACT_DEBUG_MODE__;
    }
  });

  describe('DEBUG_MODE', () => {
    it('should default to false', () => {
      expect(ReactDebugConfig.DEBUG_MODE).toBe(false);
    });

    it('should be settable', () => {
      ReactDebugConfig.DEBUG_MODE = true;
      expect(ReactDebugConfig.DEBUG_MODE).toBe(true);
    });
  });

  describe('getDebugMode', () => {
    it('should return false by default', () => {
      expect(ReactDebugConfig.getDebugMode()).toBe(false);
    });

    it('should return static DEBUG_MODE value', () => {
      ReactDebugConfig.DEBUG_MODE = true;
      expect(ReactDebugConfig.getDebugMode()).toBe(true);
    });
  });

  describe('setDebugMode', () => {
    it('should set DEBUG_MODE to true', () => {
      ReactDebugConfig.setDebugMode(true);
      expect(ReactDebugConfig.DEBUG_MODE).toBe(true);
      expect(ReactDebugConfig.getDebugMode()).toBe(true);
    });

    it('should set DEBUG_MODE to false', () => {
      ReactDebugConfig.setDebugMode(true);
      ReactDebugConfig.setDebugMode(false);
      expect(ReactDebugConfig.DEBUG_MODE).toBe(false);
    });
  });
});
