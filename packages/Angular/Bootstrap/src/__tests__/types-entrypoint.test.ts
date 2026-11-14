import { describe, it, expect } from 'vitest';
import { InjectionToken } from '@angular/core';
import { MJ_ENVIRONMENT as Root_MJ_ENVIRONMENT, MJ_STARTUP_VALIDATION as Root_MJ_STARTUP_VALIDATION } from '../public-api';
import { MJ_ENVIRONMENT, MJ_STARTUP_VALIDATION } from '@memberjunction/ng-bootstrap/types';

describe('@memberjunction/ng-bootstrap/types secondary entrypoint', () => {
  it('exports valid InjectionToken instances without pulling dashboard classes', () => {
    expect(MJ_ENVIRONMENT).toBeInstanceOf(InjectionToken);
    expect(MJ_STARTUP_VALIDATION).toBeInstanceOf(InjectionToken);
  });

  it('maintains 100% backwards compatibility: root export is identical to types export', () => {
    expect(Root_MJ_ENVIRONMENT).toBe(MJ_ENVIRONMENT);
    expect(Root_MJ_STARTUP_VALIDATION).toBe(MJ_STARTUP_VALIDATION);
  });
});
