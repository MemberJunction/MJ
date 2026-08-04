import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Router } from '@angular/router';
import { MJAuthBase } from '@memberjunction/ng-auth-services';
import { renderComponentFixture, query, text } from '@memberjunction/ng-test-utils';
import { MJAuthShellComponent } from './auth-shell.component';
import { MJInitializationService } from '../services/initialization.service';
import { MJ_ENVIRONMENT } from '../bootstrap.types';

/**
 * DOM coverage for <mj-auth-shell> — the auth wrapper that gates the app behind login/init. The auth +
 * initialization flow runs in ngOnInit (stubbed here); these cover the shell's own render branches
 * driven by public state: it projects content while there's no error (or in validation-only mode) and
 * swaps to the error container when a hard error occurs.
 */

type OnInitProto = { ngOnInit: () => Promise<void> };
const PROVIDERS = [
  { provide: Router, useValue: {} },
  { provide: MJAuthBase, useValue: {} },
  { provide: MJInitializationService, useValue: {} },
  { provide: MJ_ENVIRONMENT, useValue: { production: false } },
];

beforeEach(() => {
  // ngOnInit runs setupAuth (auth subscriptions + init) — stub it so the render branches can be
  // exercised via public state without a live auth provider.
  vi.spyOn(MJAuthShellComponent.prototype as unknown as OnInitProto, 'ngOnInit').mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

const render = (state: Partial<{ HasError: boolean; ErrorMessage: string; showValidationOnly: boolean }> = {}) =>
  renderComponentFixture(MJAuthShellComponent, {
    declarations: [MJAuthShellComponent],
    providers: PROVIDERS,
    setup: (c) => {
      c.HasError = state.HasError ?? false;
      c.ErrorMessage = state.ErrorMessage ?? '';
      c.showValidationOnly = state.showValidationOnly ?? false;
    },
  });

describe('MJAuthShellComponent (DOM)', () => {
  it('renders the shell without an error container when there is no error', () => {
    const f = render({ HasError: false });
    expect(query(f, '.mj-auth-shell')).not.toBeNull();
    expect(query(f, '.error-container')).toBeNull();
  });

  it('shows the error container with the message on a hard error', () => {
    const f = render({ HasError: true, ErrorMessage: 'Access denied' });
    expect(query(f, '.error-container')).not.toBeNull();
    expect(text(f, '.error-container p')).toBe('Access denied');
  });

  it('suppresses the error container in validation-only mode (so the projected banner shows instead)', () => {
    const f = render({ HasError: true, showValidationOnly: true });
    expect(query(f, '.error-container')).toBeNull();
  });
});
