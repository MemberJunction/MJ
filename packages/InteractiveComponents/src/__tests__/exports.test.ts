import { describe, it, expect } from 'vitest';

import {
  ComponentSpec,
  BuildComponentCompleteCode,
  BuildComponentCode,
} from '../index';

describe('InteractiveComponents exports', () => {
  it('should export ComponentSpec class', () => {
    expect(ComponentSpec).toBeDefined();
    const spec = new ComponentSpec();
    expect(spec).toBeInstanceOf(ComponentSpec);
  });

  it('should export BuildComponentCompleteCode function', () => {
    expect(typeof BuildComponentCompleteCode).toBe('function');
  });

  it('should export BuildComponentCode function', () => {
    expect(typeof BuildComponentCode).toBe('function');
  });
});
