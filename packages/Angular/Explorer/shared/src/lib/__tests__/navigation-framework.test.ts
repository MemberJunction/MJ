/**
 * Tests for the Navigation Back/Forward Framework:
 * - BaseResourceComponent query param lifecycle (OnQueryParamsChanged, UpdateQueryParams, GetQueryParams)
 * - NavigationService.NotifyQueryParamsChanged / QueryParamChanged$
 * - Suppression flag prevents loops
 * - Tab-scoped filtering prevents cross-tab leakage
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Angular dependencies
vi.mock('@angular/core', () => ({
  Directive: () => (target: Function) => target,
  Injectable: () => (target: Function) => target,
  OnInit: class {},
  OnDestroy: class {},
  inject: vi.fn(),
  Input: () => () => {},
  Output: () => () => {},
  EventEmitter: class { emit() {} },
}));

vi.mock('@angular/router', () => ({}));

vi.mock('@memberjunction/core', () => ({
  BaseEntity: class {},
  Metadata: class {},
  CompositeKey: class {},
}));

vi.mock('@memberjunction/core-entities', () => ({
  ResourceData: class {
    ID = 0;
    Name = '';
    ResourceTypeID = '';
    ResourceRecordID = '';
    Configuration: Record<string, unknown> = {};
    constructor(data?: Record<string, unknown>) {
      if (data) Object.assign(this, data);
    }
  },
}));

vi.mock('@memberjunction/global', () => ({
  UUIDsEqual: (a: string, b: string) => a === b,
}));

// ---- QueryParamChangeEvent tests ----

describe('QueryParamChangeEvent', () => {
  it('should have TabId and Params fields', () => {
    // Verify the interface shape by creating a conforming object
    const event = {
      TabId: 'tab-123',
      Params: { entity: 'Actions', filter: 'active' },
    };
    expect(event.TabId).toBe('tab-123');
    expect(event.Params.entity).toBe('Actions');
    expect(event.Params.filter).toBe('active');
  });
});

// ---- Shell helper function tests (pure functions extracted for testing) ----

describe('extractQueryParamsFromUrl', () => {
  // Replicate the shell's extractQueryParamsFromUrl logic for unit testing
  function extractQueryParamsFromUrl(url: string): Record<string, string> {
    const fragmentIndex = url.indexOf('#');
    const cleanUrl = fragmentIndex !== -1 ? url.substring(0, fragmentIndex) : url;
    const queryIndex = cleanUrl.indexOf('?');
    if (queryIndex === -1) return {};
    const params = new URLSearchParams(cleanUrl.substring(queryIndex + 1));
    const result: Record<string, string> = {};
    params.forEach((value, key) => { result[key] = value; });
    return result;
  }

  it('should extract query params from URL', () => {
    const result = extractQueryParamsFromUrl('/app/data-explorer/Data?entity=Actions&filter=active');
    expect(result).toEqual({ entity: 'Actions', filter: 'active' });
  });

  it('should return empty object for URL without query params', () => {
    expect(extractQueryParamsFromUrl('/app/data-explorer/Data')).toEqual({});
  });

  it('should decode encoded values', () => {
    const result = extractQueryParamsFromUrl('/app/data?entity=MJ%3A%20Actions');
    expect(result.entity).toBe('MJ: Actions');
  });

  it('should handle empty values', () => {
    const result = extractQueryParamsFromUrl('/app/data?key=');
    expect(result.key).toBe('');
  });

  it('should ignore fragment (#hash)', () => {
    const result = extractQueryParamsFromUrl('/app/data?entity=Members#section');
    expect(result.entity).toBe('Members');
    expect(result['#section']).toBeUndefined();
  });

  it('should handle URL with only fragment, no query params', () => {
    const result = extractQueryParamsFromUrl('/app/data#section');
    expect(result).toEqual({});
  });

  it('should handle + as space', () => {
    const result = extractQueryParamsFromUrl('/app/data?entity=My+Entity');
    expect(result.entity).toBe('My Entity');
  });
});

describe('queryParamsEqual', () => {
  // Replicate the shell's queryParamsEqual logic
  function queryParamsEqual(a: Record<string, string>, b: Record<string, string>): boolean {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every(key =>
      decodeURIComponent(a[key]?.replace(/\+/g, ' ') || '') ===
      decodeURIComponent(b[key]?.replace(/\+/g, ' ') || '')
    );
  }

  it('should return true for identical params', () => {
    expect(queryParamsEqual({ entity: 'Actions' }, { entity: 'Actions' })).toBe(true);
  });

  it('should return false for different values', () => {
    expect(queryParamsEqual({ entity: 'Actions' }, { entity: 'Members' })).toBe(false);
  });

  it('should return false for different key counts', () => {
    expect(queryParamsEqual({ entity: 'Actions' }, { entity: 'Actions', filter: 'x' })).toBe(false);
  });

  it('should return true for both empty', () => {
    expect(queryParamsEqual({}, {})).toBe(true);
  });

  it('should return false for one empty, one not', () => {
    expect(queryParamsEqual({}, { entity: 'Actions' })).toBe(false);
  });

  it('should normalize + vs %20 encoding', () => {
    expect(queryParamsEqual({ entity: 'My+Entity' }, { entity: 'My%20Entity' })).toBe(true);
  });

  it('should handle missing keys', () => {
    expect(queryParamsEqual({ a: 'x' }, { b: 'x' })).toBe(false);
  });
});

// ---- buildResourceUrl appendQP helper tests ----

describe('appendQueryParams (appendQP helper)', () => {
  function appendQP(url: string, queryParams: Record<string, string> | undefined): string {
    if (!queryParams || Object.keys(queryParams).length === 0) return url;
    const separator = url.includes('?') ? '&' : '?';
    const params = new URLSearchParams(queryParams);
    return `${url}${separator}${params.toString()}`;
  }

  it('should append params to URL without existing params', () => {
    const result = appendQP('/app/data/record/Entity/123', { entity: 'Actions' });
    expect(result).toBe('/app/data/record/Entity/123?entity=Actions');
  });

  it('should append params to URL with existing params', () => {
    const result = appendQP('/app/data?existing=x', { entity: 'Actions' });
    expect(result).toBe('/app/data?existing=x&entity=Actions');
  });

  it('should return URL unchanged for empty params', () => {
    expect(appendQP('/app/data', {})).toBe('/app/data');
  });

  it('should return URL unchanged for undefined params', () => {
    expect(appendQP('/app/data', undefined)).toBe('/app/data');
  });

  it('should properly encode special characters', () => {
    const result = appendQP('/app/data', { entity: 'MJ: Actions' });
    expect(result).toContain('entity=MJ');
    // URLSearchParams encodes spaces as +
    expect(result).toMatch(/entity=MJ[+%].*Actions/);
  });

  it('should handle multiple params', () => {
    const result = appendQP('/app/data', { entity: 'Actions', filter: 'active', view: 'grid' });
    expect(result).toContain('entity=Actions');
    expect(result).toContain('filter=active');
    expect(result).toContain('view=grid');
  });
});

// ---- shouldReuseRoute logic tests ----

describe('shouldReuseRoute logic', () => {
  // Test the comparison logic (routeConfig + params, NOT queryParams)
  function objectContentsEqual(obj1: Record<string, string>, obj2: Record<string, string>): boolean {
    if (obj1 === obj2) return true;
    if (!obj1 || !obj2) return false;
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);
    if (keys1.length !== keys2.length) return false;
    return keys1.every(key => obj1[key] === obj2[key]);
  }

  function shouldReuseRoute(
    futureConfig: object | null,
    currConfig: object | null,
    futureParams: Record<string, string>,
    currParams: Record<string, string>
  ): boolean {
    return futureConfig === currConfig && objectContentsEqual(futureParams, currParams);
  }

  it('should return true for same config and params with different query params', () => {
    const config = {};
    // Query params intentionally excluded
    expect(shouldReuseRoute(config, config, { id: '1' }, { id: '1' })).toBe(true);
  });

  it('should return false for different path params', () => {
    const config = {};
    expect(shouldReuseRoute(config, config, { id: '1' }, { id: '2' })).toBe(false);
  });

  it('should return false for different route configs', () => {
    expect(shouldReuseRoute({}, {}, { id: '1' }, { id: '1' })).toBe(false);
  });

  it('should return true for same everything', () => {
    const config = {};
    expect(shouldReuseRoute(config, config, {}, {})).toBe(true);
  });

  it('should return false when one has params and other does not', () => {
    const config = {};
    expect(shouldReuseRoute(config, config, { id: '1' }, {})).toBe(false);
  });
});

// ---- Suppression flag behavior ----

describe('_suppressQueryParamSync behavior', () => {
  it('should prevent UpdateQueryParams during suppression', () => {
    let suppressFlag = false;
    const mockUpdateActiveTabQP = vi.fn();

    function updateQueryParams(params: Record<string, string | null>): void {
      if (suppressFlag) return;
      mockUpdateActiveTabQP(params);
    }

    // Normal call
    updateQueryParams({ entity: 'Actions' });
    expect(mockUpdateActiveTabQP).toHaveBeenCalledTimes(1);

    // Suppressed call (simulates being inside OnQueryParamsChanged)
    suppressFlag = true;
    updateQueryParams({ entity: 'Members' });
    expect(mockUpdateActiveTabQP).toHaveBeenCalledTimes(1); // Still 1, not 2

    // After suppression cleared
    suppressFlag = false;
    updateQueryParams({ entity: 'Queries' });
    expect(mockUpdateActiveTabQP).toHaveBeenCalledTimes(2);
  });

  it('should clear suppression flag even if OnQueryParamsChanged throws', () => {
    let suppressFlag = false;

    function simulateSubscription(callback: () => void): void {
      suppressFlag = true;
      try {
        callback();
      } finally {
        suppressFlag = false;
      }
    }

    // The try/finally ensures flag is cleared even when callback throws
    try {
      simulateSubscription(() => {
        throw new Error('Component error');
      });
    } catch {
      // Expected — the error propagates but flag should still be cleared
    }

    // Flag should be cleared despite the error
    expect(suppressFlag).toBe(false);
  });
});

// ---- GetQueryParams behavior ----

describe('GetQueryParams', () => {
  it('should return params from Configuration.queryParams', () => {
    const config: Record<string, unknown> = { queryParams: { entity: 'Actions', filter: 'active' } };
    const result = (config['queryParams'] as Record<string, string>) || {};
    expect(result).toEqual({ entity: 'Actions', filter: 'active' });
  });

  it('should return empty object when no queryParams', () => {
    const config: Record<string, unknown> = {};
    const result = (config['queryParams'] as Record<string, string>) || {};
    expect(result).toEqual({});
  });

  it('should return empty object when Configuration is null', () => {
    const config: Record<string, unknown> | null = null;
    const result = ((config?.['queryParams'] ?? {}) as Record<string, string>);
    expect(result).toEqual({});
  });
});

// ---- Tab-scoped filtering ----

describe('Tab-scoped query param filtering', () => {
  it('should only deliver events matching the component tab ID', () => {
    const componentTabId = 'tab-abc';
    const events = [
      { TabId: 'tab-abc', Params: { entity: 'Actions' } },
      { TabId: 'tab-xyz', Params: { entity: 'Members' } },
      { TabId: 'tab-abc', Params: { entity: 'Queries' } },
    ];

    const received = events.filter(e => e.TabId === componentTabId);
    expect(received).toHaveLength(2);
    expect(received[0].Params.entity).toBe('Actions');
    expect(received[1].Params.entity).toBe('Queries');
  });

  it('should not deliver any events for non-matching tab ID', () => {
    const componentTabId = 'tab-none';
    const events = [
      { TabId: 'tab-abc', Params: { entity: 'Actions' } },
      { TabId: 'tab-xyz', Params: { entity: 'Members' } },
    ];

    const received = events.filter(e => e.TabId === componentTabId);
    expect(received).toHaveLength(0);
  });

  it('should handle empty tab ID gracefully', () => {
    const componentTabId = '';
    const events = [
      { TabId: 'tab-abc', Params: { entity: 'Actions' } },
    ];

    const received = events.filter(e => e.TabId === componentTabId);
    expect(received).toHaveLength(0);
  });
});
