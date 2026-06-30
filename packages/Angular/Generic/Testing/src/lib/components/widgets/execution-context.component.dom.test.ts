import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, queryAll, text } from '@memberjunction/ng-test-utils';
import { ExecutionContextComponent } from './execution-context.component';

// Module-declared leaf, OnPush, uses [ngClass] (so CommonModule is required) and
// ngOnChanges to parse runContextDetailsJson. autoDetect handles the parse-on-init
// recompute safely. Many @if-gated context-items; empty-state shows when no data.
describe('ExecutionContextComponent (DOM)', () => {
  it('shows the empty state when no data is provided', () => {
    const fixture = renderComponentFixture(ExecutionContextComponent, {
      imports: [CommonModule, MJEmptyStateComponent],
      declarations: [ExecutionContextComponent],
      autoDetect: true,
    });
    // No data → the canonical <mj-empty-state> placeholder renders, titled
    // "No Execution Context" (passed via its Title input).
    const empty = query(fixture, 'mj-empty-state');
    expect(empty).not.toBeNull();
    expect(empty!.textContent).toContain('No Execution Context');
  });

  it('renders machine name and user values and hides the empty state', () => {
    const fixture = renderComponentFixture(ExecutionContextComponent, {
      imports: [CommonModule],
      declarations: [ExecutionContextComponent],
      inputs: { machineName: 'build-box-01', runByUserName: 'Ada Lovelace' },
      autoDetect: true,
    });
    expect(query(fixture, 'mj-empty-state')).toBeNull();
    const values = queryAll(fixture, '.context-value').map((e) => e.textContent?.trim());
    expect(values).toContain('build-box-01');
    expect(values).toContain('Ada Lovelace');
  });

  it('parses runContextDetailsJson and renders the runtime environment section', () => {
    const json = JSON.stringify({ osType: 'darwin', osVersion: '14.0', nodeVersion: 'v20.0.0', timezone: 'UTC' });
    const fixture = renderComponentFixture(ExecutionContextComponent, {
      imports: [CommonModule],
      declarations: [ExecutionContextComponent],
      inputs: { runContextDetailsJson: json },
      autoDetect: true,
    });
    const headers = queryAll(fixture, '.section-header h4').map((e) => e.textContent?.trim());
    expect(headers).toContain('Runtime Environment');
    const values = queryAll(fixture, '.context-value').map((e) => e.textContent?.trim());
    // getOSDisplayName() maps 'darwin' → 'macOS'
    expect(values).toContain('macOS');
    expect(values).toContain('v20.0.0');
  });

  it('renders the CI/CD section when ci info is present in the json', () => {
    const json = JSON.stringify({ ciProvider: 'GitHub Actions', buildNumber: '42', branch: 'main' });
    const fixture = renderComponentFixture(ExecutionContextComponent, {
      imports: [CommonModule],
      declarations: [ExecutionContextComponent],
      inputs: { runContextDetailsJson: json },
      autoDetect: true,
    });
    expect(query(fixture, '.ci-section')).not.toBeNull();
    expect(text(fixture, '.ci-provider-name')).toBe('GitHub Actions');
    // getCIProviderClass() maps a 'github'-containing provider → 'github'
    expect(query(fixture, '.ci-banner')!.classList.contains('github')).toBe(true);
  });

  it('does not render the runtime section when the json is malformed', () => {
    const fixture = renderComponentFixture(ExecutionContextComponent, {
      imports: [CommonModule],
      declarations: [ExecutionContextComponent],
      inputs: { machineName: 'box', runContextDetailsJson: '{not valid json' },
      autoDetect: true,
    });
    const headers = queryAll(fixture, '.section-header h4').map((e) => e.textContent?.trim());
    expect(headers).not.toContain('Runtime Environment');
  });
});
