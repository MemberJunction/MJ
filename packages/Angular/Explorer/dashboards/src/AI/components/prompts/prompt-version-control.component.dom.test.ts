import { Component, Input } from '@angular/core';
import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { MJConfirmService } from '@memberjunction/ng-ui-components';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { renderComponentFixture, query, queryAll, text, capture, createFakeProvider, StubEmptyStateComponent, StubLoadingComponent } from '@memberjunction/ng-test-utils';
import { PromptVersionControlComponent } from './prompt-version-control.component';

/**
 * DOM coverage for <app-prompt-version-control> — the record-change version timeline for a prompt.
 * Loading real history goes through Metadata.GetRecordChanges (not on the fake provider), so we do
 * NOT exercise that path; instead we set autoLoad=false and drive the component's OWNED
 * timeline/filter/label logic by seeding `versions` and calling the public applyFilters/label
 * helpers. Two shapes are covered: (a) no `prompt` → the prompt-selector empty state (loadAvailablePrompts
 * fails against the fake — no GetEntityObject — so availablePrompts stays [] and mj-empty-state shows);
 * (b) a `prompt` + seeded versions → the timeline renders one item per version, applyFilters sorts by
 * changedAt and honors the External/System toggle, and onVersionSelect emits. mj-loading / mj-empty-state
 * / mj-alert are stubbed; the two injected services are stubbed (only touched in restore, not exercised).
 */

@Component({ standalone: true, selector: 'mj-alert', template: '<div class="stub-alert"><ng-content></ng-content></div>' })
class StubAlert {
  @Input() Variant = '';
}

// Minimal PromptVersion rows. Distinct changedAt so DESC sort order is deterministic.
type SeedVersion = {
  id: string;
  version: number;
  changedAt: Date;
  changedBy: string;
  changeType: 'Create' | 'Update' | 'Delete';
  changeSource: 'Internal' | 'External';
  changesDescription: string;
  changesJSON: Record<string, unknown> | null;
  fullRecordJSON: Record<string, unknown> | null;
  isActive: boolean;
  canRestore: boolean;
};

const V: SeedVersion[] = [
  {
    id: 'v3',
    version: 3,
    changedAt: new Date('2026-03-01T00:00:00.000Z'),
    changedBy: 'Ada',
    changeType: 'Update',
    changeSource: 'Internal',
    changesDescription: 'Tweaked wording',
    changesJSON: { Name: { oldValue: 'A', newValue: 'B' } },
    fullRecordJSON: { Name: 'B' },
    isActive: true,
    canRestore: false,
  },
  {
    id: 'v2',
    version: 2,
    changedAt: new Date('2026-02-01T00:00:00.000Z'),
    changedBy: 'Grace',
    changeType: 'Update',
    changeSource: 'External',
    changesDescription: 'System reindex',
    changesJSON: null,
    fullRecordJSON: { Name: 'A' },
    isActive: false,
    canRestore: true,
  },
  {
    id: 'v1',
    version: 1,
    changedAt: new Date('2026-01-01T00:00:00.000Z'),
    changedBy: 'Ada',
    changeType: 'Create',
    changeSource: 'Internal',
    changesDescription: 'Initial version',
    changesJSON: null,
    fullRecordJSON: { Name: 'A' },
    isActive: false,
    canRestore: true,
  },
];

const PROMPT = { ID: 'prompt-1', Name: 'My Prompt' } as unknown as MJAIPromptEntityExtended;

function baseProviders() {
  return [
    { provide: MJNotificationService, useValue: { CreateSimpleNotification: () => {} } },
    { provide: MJConfirmService, useValue: { Confirm: async () => false } },
  ];
}

// Render with a prompt + seeded versions and a chosen filter, then a single detect pass.
function renderTimeline(over?: { filterBy?: string; showSystemChanges?: boolean }) {
  const fixture = renderComponentFixture(PromptVersionControlComponent, {
    imports: [CommonModule, FormsModule, StubLoadingComponent, StubEmptyStateComponent, StubAlert],
    declarations: [PromptVersionControlComponent],
    providers: baseProviders(),
    inputs: { Provider: createFakeProvider({ runViewResults: [] }), autoLoad: false, prompt: PROMPT },
    setup: (c) => {
      // Seed the version list the component's own logic renders/filters. Cast is the same
      // minimal-metadata seam the reference specs use — every field the template reads is present.
      c.versions = V.map((v) => ({ ...v })) as unknown as PromptVersionControlComponent['versions'];
      if (over?.showSystemChanges != null) c.showSystemChanges = over.showSystemChanges;
      if (over?.filterBy != null) c.filterBy = over.filterBy as PromptVersionControlComponent['filterBy'];
      // Run the component's real filter/sort pipeline over the seeded data.
      c.applyFiltersPublic();
    },
  });
  fixture.detectChanges(false);
  return fixture;
}

describe('PromptVersionControlComponent (DOM)', () => {
  it('shows the prompt-selector empty state when no prompt is provided', () => {
    const fixture = renderComponentFixture(PromptVersionControlComponent, {
      imports: [CommonModule, FormsModule, StubLoadingComponent, StubEmptyStateComponent, StubAlert],
      declarations: [PromptVersionControlComponent],
      providers: baseProviders(),
      inputs: { Provider: createFakeProvider({ runViewResults: [] }), autoLoad: false, prompt: null },
    });
    fixture.detectChanges(false);
    expect(query(fixture, '.prompt-selector-section')).not.toBeNull();
    // loadAvailablePrompts fails on the fake (no GetEntityObject) → availablePrompts stays [] → empty state.
    expect(text(fixture, '.stub-empty')).toContain('No prompts available');
  });

  it('renders one timeline item per version, newest first (default filter excludes External)', () => {
    // Default showSystemChanges=false drops the External v2 → v3 then v1 remain, DESC by changedAt.
    const fixture = renderTimeline();
    const items = queryAll(fixture, '.timeline-item');
    expect(items.length).toBe(2);
    const labels = queryAll(fixture, '.version-label').map((e) => e.textContent?.trim());
    expect(labels).toEqual(['v3 (Current)', 'v1 (Initial)']);
  });

  it('includes External changes when the System toggle is on', () => {
    const fixture = renderTimeline({ showSystemChanges: true });
    expect(queryAll(fixture, '.timeline-item').length).toBe(3);
    const authors = queryAll(fixture, '.changed-by').map((e) => e.textContent?.trim());
    expect(authors).toContain('by Grace');
  });

  it('filters to Update-type changes only', () => {
    // "updates" keeps only changeType==='Update'; with system off that is just v3 (Internal Update).
    const fixture = renderTimeline({ filterBy: 'updates', showSystemChanges: false });
    const labels = queryAll(fixture, '.version-label').map((e) => e.textContent?.trim());
    expect(labels).toEqual(['v3 (Current)']);
  });

  it('emits versionSelected with the clicked timeline version', () => {
    const fixture = renderTimeline();
    const selected = capture(fixture.componentInstance.versionSelected);
    (query(fixture, '.timeline-item') as HTMLElement).click();
    expect(selected.length).toBe(1);
    expect(selected[0].version).toBe(3); // newest item clicked
  });
});
