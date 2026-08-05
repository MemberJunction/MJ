import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query } from '@memberjunction/ng-test-utils';
import { MJBootstrapComponent } from './bootstrap.component';
import { MJ_ENVIRONMENT } from './bootstrap.types';

/**
 * DOM coverage for <mj-bootstrap> — the minimal top-level bootstrap wrapper. It's a thin projection
 * container (a styled block that projects its content via <ng-content>); ngOnInit just flips the
 * production flag. This verifies the container renders (with the required MJ_ENVIRONMENT token).
 */

describe('MJBootstrapComponent (DOM)', () => {
  it('renders the bootstrap container', () => {
    const f = renderComponentFixture(MJBootstrapComponent, {
      declarations: [MJBootstrapComponent],
      providers: [{ provide: MJ_ENVIRONMENT, useValue: { production: false } }],
    });
    expect(query(f, '.mj-bootstrap-container')).not.toBeNull();
  });
});
