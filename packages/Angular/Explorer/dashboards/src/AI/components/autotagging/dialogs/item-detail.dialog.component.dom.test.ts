import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, queryAll, capture } from '@memberjunction/ng-test-utils';
import type { ContentItemDetail } from '../shared/classify.types';
import { ClassifyItemDetailDialogComponent } from './item-detail.dialog.component';

/**
 * DOM coverage for <classify-item-detail-dialog> — a presentational item slide-in gated on
 * `Show && Item`, emitting `Closed` / `OpenRecordRequested`. No DI/async: single synchronous render.
 */
const ITEM = {
  Name: 'Quarterly Report',
  SourceName: 'Website',
  RequiresContentType: true,
  ContentTypeName: 'Article',
  FileTypeName: 'PDF',
  URL: 'https://example.com/doc',
  TextContent: 'A short preview of the content.',
  Tags: [{ Tag: 'finance', Weight: 1 }, { Tag: 'q3', Weight: 0.5 }],
  Checksum: 'abc123',
  CreatedAt: '2026-01-01',
  UpdatedAt: '2026-02-01',
} as unknown as ContentItemDetail;

const render = (inputs: { Show?: boolean; Item?: ContentItemDetail | null }) =>
  renderComponentFixture(ClassifyItemDetailDialogComponent, {
    declarations: [ClassifyItemDetailDialogComponent],
    inputs: { Show: inputs.Show ?? false, Item: inputs.Item ?? null },
  });

describe('ClassifyItemDetailDialogComponent (DOM)', () => {
  it('renders nothing when hidden (Show=false)', () => {
    expect(query(render({ Show: false, Item: ITEM }), '.at-detail-panel')).toBeNull();
  });

  it('renders nothing when there is no item (Item=null)', () => {
    expect(query(render({ Show: true, Item: null }), '.at-detail-panel')).toBeNull();
  });

  it('renders the item name and source when shown', () => {
    const fixture = render({ Show: true, Item: ITEM });
    expect(query(fixture, '.at-detail-item-name')?.textContent?.trim()).toBe('Quarterly Report');
    expect(fixture.nativeElement.textContent).toContain('Website');
  });

  it('renders the URL link when the item has a URL', () => {
    const link = query(render({ Show: true, Item: ITEM }), '.at-detail-link') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('https://example.com/doc');
  });

  it('renders one tag pill per weighted tag with the count in the label', () => {
    const fixture = render({ Show: true, Item: ITEM });
    expect(queryAll(fixture, '.at-tag-pill').length).toBe(2);
    expect(fixture.nativeElement.textContent).toContain('Tags (2)');
  });

  it('emits Closed when the close button is clicked', () => {
    const fixture = render({ Show: true, Item: ITEM });
    const closed = capture(fixture.componentInstance.Closed);
    (query(fixture, '.at-slide-close') as HTMLElement).click();
    expect(closed.length).toBe(1);
  });

  it('emits OpenRecordRequested with the item when Open Record is clicked', () => {
    const fixture = render({ Show: true, Item: ITEM });
    const opened = capture(fixture.componentInstance.OpenRecordRequested);
    (queryAll(fixture, 'button').find((b) => b.textContent?.includes('Open Record')) as HTMLElement).click();
    expect(opened).toEqual([ITEM]);
  });
});
