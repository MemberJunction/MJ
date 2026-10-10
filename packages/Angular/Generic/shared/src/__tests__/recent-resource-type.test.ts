import { describe, it, expect } from 'vitest';
import { ResourceTypeForEntity } from '../lib/recent-resource-type';

describe('ResourceTypeForEntity', () => {
  it('maps the prefixed dashboards entity to dashboard', () => {
    expect(ResourceTypeForEntity('MJ: Dashboards')).toBe('dashboard');
  });

  it('keeps the legacy unprefixed dashboards name', () => {
    expect(ResourceTypeForEntity('Dashboards')).toBe('dashboard');
  });

  it('maps user views with or without the prefix', () => {
    expect(ResourceTypeForEntity('MJ: User Views')).toBe('view');
    expect(ResourceTypeForEntity('User Views')).toBe('view');
  });

  it('maps conversation artifacts and reports', () => {
    expect(ResourceTypeForEntity('MJ: Conversation Artifacts')).toBe('artifact');
    expect(ResourceTypeForEntity('Reports')).toBe('report');
  });

  it('defaults to record', () => {
    expect(ResourceTypeForEntity('Accounts')).toBe('record');
    expect(ResourceTypeForEntity('')).toBe('record');
  });
});
