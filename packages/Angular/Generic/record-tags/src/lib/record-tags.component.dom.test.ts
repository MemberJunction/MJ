import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { ComponentFixture } from '@angular/core/testing';
import { renderComponentFixture, query, queryAll, text, attr, hasClass, click, capture, createFakeProvider } from '@memberjunction/ng-test-utils';
import { BaseEntity, IMetadataProvider } from '@memberjunction/core';
import { MjSlidePanelComponent, MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { MJWordCloudComponent } from '@memberjunction/ng-word-cloud';
import { RecordTagsComponent } from './record-tags.component';

/**
 * DOM-level spec for <mj-record-tags> — a module-declared (standalone:false), DATA-BOUND
 * component. It loads tags via RunView.FromMetadataProvider(ProviderToUse) in ngOnInit, so we
 * inject a fake provider (createFakeProvider) whose RunView returns canned rows — no backend.
 *
 * Class-level/logic tests for the scoring/merge/format helpers already live in src/__tests__
 * (run on the node preset). This file covers the TEMPLATE contract only: the @if/@else gating
 * (loading vs empty vs populated), {{ }} bindings, [class.x] toggles, [title] bindings, @for
 * rendering, and (click) → @Output wiring that the class-level tests can't see.
 *
 * Records returned from RunView are MJTaggedItemEntity in production; for rendering we only need
 * the Tag/Weight/ID fields the template reads, so plain row objects shaped like that suffice as
 * the fake provider's payload.
 */

interface TagRow {
  ID: string;
  Tag: string;
  Weight: number;
  TagID: string;
}

const TAGS: TagRow[] = [
  { ID: 't1', Tag: 'Machine Learning', Weight: 1.0, TagID: 'tag-1' },
  { ID: 't2', Tag: 'Healthcare', Weight: 0.6, TagID: 'tag-2' },
  { ID: 't3', Tag: 'Research', Weight: 0.4, TagID: 'tag-3' },
];

// A minimal BaseEntity stand-in exposing only what LoadTags() / CheckEntityHasVectors() read:
// EntityInfo.{ID,Name,Fields} and PrimaryKey.Values(). Cast through unknown at the single
// documented seam (the component types it as BaseEntity).
function makeRecord(): BaseEntity {
  return {
    EntityInfo: { ID: 'entity-1', Name: 'Contacts', Fields: [] },
    PrimaryKey: { Values: () => 'pk-1' },
  } as unknown as BaseEntity;
}

const DECLARATIONS = [RecordTagsComponent];
const IMPORTS = [CommonModule, MjSlidePanelComponent, SharedGenericModule, MJWordCloudComponent, MJEmptyStateComponent];

// Render, then await the component's own async LoadTags() (ngOnInit fire-and-forgets it, and
// zoneless whenStable() doesn't track that promise), then flush a final CD so the resolved state
// (IsLoading=false + TaggedItems) is reflected in the DOM. Returns the stable fixture.
async function renderWithTags(rows: TagRow[], inputs: Record<string, unknown> = {}): Promise<ComponentFixture<RecordTagsComponent>> {
  const provider: IMetadataProvider = createFakeProvider({ runViewResults: rows });
  const fixture = renderComponentFixture(RecordTagsComponent, {
    imports: IMPORTS,
    declarations: DECLARATIONS,
    inputs: { Record: makeRecord(), Provider: provider, ...inputs },
  });
  await fixture.componentInstance.LoadTags();
  fixture.detectChanges();
  return fixture;
}

describe('RecordTagsComponent (DOM, data-bound)', () => {
  it('renders the empty state when the record has no tags', async () => {
    const f = await renderWithTags([]);

    expect(query(f, 'mj-empty-state')).not.toBeNull();
    expect(text(f, 'mj-empty-state .mj-empty-state__message')).toContain('No tags have been applied');
    expect(text(f, 'mj-empty-state .mj-record-tags-hint')).toContain('autotagging pipeline');
    // populated container must NOT be present
    expect(query(f, '.mj-record-tags-container')).toBeNull();
  });

  it('renders one pill per tag and the pluralized count in the header', async () => {
    const f = await renderWithTags(TAGS);

    expect(query(f, 'mj-empty-state')).toBeNull();
    expect(queryAll(f, '.mj-record-tag-pill')).toHaveLength(3);
    expect(text(f, '.mj-record-tags-count')).toBe('3 tags');
  });

  it('uses the singular "tag" label for a single tag', async () => {
    const f = await renderWithTags([TAGS[0]]);
    expect(text(f, '.mj-record-tags-count')).toBe('1 tag');
  });

  it('shows the weight badge only for tags below full weight', async () => {
    const f = await renderWithTags(TAGS);
    // tag at weight 1.0 has no badge; the two below 1.0 do
    const badges = queryAll(f, '.mj-record-tag-weight').map((b) => b.textContent?.trim());
    expect(badges).toEqual(['60%', '40%']);
  });

  it('renders the tag text inside each pill', async () => {
    const f = await renderWithTags(TAGS);
    // tags are sorted by weight descending: ML (1.0), Healthcare (0.6), Research (0.4)
    const pills = queryAll(f, '.mj-record-tag-pill').map((p) => p.textContent?.replace(/\s+/g, ' ').trim());
    expect(pills[0]).toContain('Machine Learning');
    expect(pills[1]).toContain('Healthcare');
    expect(pills[2]).toContain('Research');
  });

  it('hides the per-tag remove button by default (AllowRemove=false)', async () => {
    const f = await renderWithTags(TAGS);
    expect(query(f, '.mj-record-tag-remove')).toBeNull();
  });

  it('renders a remove button per tag when AllowRemove is true', async () => {
    const f = await renderWithTags(TAGS, { AllowRemove: true });
    expect(queryAll(f, '.mj-record-tag-remove')).toHaveLength(3);
  });

  it('defaults to list view and switches to cloud view on toggle click', async () => {
    const f = await renderWithTags(TAGS);

    // list view: pills present, word cloud absent
    expect(query(f, '.mj-record-tags-list')).not.toBeNull();
    expect(query(f, '.mj-record-tags-cloud')).toBeNull();
    // toggle icon shows the "switch to cloud" affordance
    expect(hasClass(f, '.mj-record-tags-view-toggle i', 'fa-cloud')).toBe(true);

    click(f, '.mj-record-tags-view-toggle');
    f.detectChanges();

    expect(query(f, '.mj-record-tags-list')).toBeNull();
    expect(query(f, '.mj-record-tags-cloud')).not.toBeNull();
    expect(hasClass(f, '.mj-record-tags-view-toggle i', 'fa-list')).toBe(true);
  });

  it('binds the toggle button title to the current view mode', async () => {
    const f = await renderWithTags(TAGS);
    expect(attr(f, '.mj-record-tags-view-toggle', 'title')).toBe('Switch to word cloud view');

    click(f, '.mj-record-tags-view-toggle');
    f.detectChanges();
    expect(attr(f, '.mj-record-tags-view-toggle', 'title')).toBe('Switch to list view');
  });

  it('emits TagCountChanged with the loaded tag count after load', async () => {
    let counts: number[] = [];
    const fixture = renderComponentFixture(RecordTagsComponent, {
      imports: IMPORTS,
      declarations: DECLARATIONS,
      inputs: { Record: makeRecord(), Provider: createFakeProvider({ runViewResults: TAGS }) },
      // subscribe before we explicitly drive LoadTags below, so we capture its emission.
      setup: (c) => {
        counts = capture(c.TagCountChanged);
      },
    });
    await fixture.componentInstance.LoadTags();

    expect(counts).toContain(3);
  });

  it('shows the Related Records section header when tags are present', async () => {
    const f = await renderWithTags(TAGS);
    expect(query(f, '.mj-related-records-section')).not.toBeNull();
    expect(text(f, '.mj-related-title')).toBe('Related Records');
  });

  it('collapses the Related Records body when the header is clicked', async () => {
    const f = await renderWithTags(TAGS);
    // expanded by default → chevron-down, body present (empty-state row)
    expect(hasClass(f, '.mj-related-header i', 'fa-chevron-down')).toBe(true);

    click(f, '.mj-related-header');
    f.detectChanges();

    expect(hasClass(f, '.mj-related-header i', 'fa-chevron-right')).toBe(true);
    expect(query(f, '.mj-related-empty')).toBeNull();
    expect(query(f, '.mj-related-loading')).toBeNull();
    expect(query(f, '.mj-related-list')).toBeNull();
  });

  it('emits PanelClosed when the slide panel reports a close', async () => {
    const f = await renderWithTags(TAGS);
    const closed = capture(f.componentInstance.PanelClosed);
    f.componentInstance.OnClose();
    expect(closed).toHaveLength(1);
  });
});
