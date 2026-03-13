import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CARD_CONFIG,
  DEFAULT_VIRTUAL_SCROLL_CONFIG,
  DEFAULT_VIRTUAL_SCROLL_STATE
} from '../lib/types';
import type {
  TimelineOrientation,
  TimelineLayout,
  TimelineSortOrder,
  TimeSegmentGrouping,
  TimelineCardConfig,
  VirtualScrollConfig,
  TimelineAction,
  TimelineDisplayField,
  MJTimelineEvent,
  TimelineSegment
} from '../lib/types';

describe('DEFAULT_CARD_CONFIG', () => {
  it('should have showIcon true', () => {
    expect(DEFAULT_CARD_CONFIG.showIcon).toBe(true);
  });

  it('should have showDate true', () => {
    expect(DEFAULT_CARD_CONFIG.showDate).toBe(true);
  });

  it('should have showSubtitle true', () => {
    expect(DEFAULT_CARD_CONFIG.showSubtitle).toBe(true);
  });

  it('should have default date format', () => {
    expect(DEFAULT_CARD_CONFIG.dateFormat).toBe('MMM d, yyyy');
  });

  it('should default to collapsible', () => {
    expect(DEFAULT_CARD_CONFIG.collapsible).toBe(true);
    expect(DEFAULT_CARD_CONFIG.defaultExpanded).toBe(false);
  });

  it('should default descriptionMaxLines to 3', () => {
    expect(DEFAULT_CARD_CONFIG.descriptionMaxLines).toBe(3);
  });

  it('should not allow HTML description by default', () => {
    expect(DEFAULT_CARD_CONFIG.allowHtmlDescription).toBe(false);
  });

  it('should have maxWidth of 400px', () => {
    expect(DEFAULT_CARD_CONFIG.maxWidth).toBe('400px');
  });
});

describe('DEFAULT_VIRTUAL_SCROLL_CONFIG', () => {
  it('should be enabled by default', () => {
    expect(DEFAULT_VIRTUAL_SCROLL_CONFIG.enabled).toBe(true);
  });

  it('should have batchSize of 20', () => {
    expect(DEFAULT_VIRTUAL_SCROLL_CONFIG.batchSize).toBe(20);
  });

  it('should have loadThreshold of 200', () => {
    expect(DEFAULT_VIRTUAL_SCROLL_CONFIG.loadThreshold).toBe(200);
  });

  it('should show loading indicator', () => {
    expect(DEFAULT_VIRTUAL_SCROLL_CONFIG.showLoadingIndicator).toBe(true);
  });
});

describe('DEFAULT_VIRTUAL_SCROLL_STATE', () => {
  it('should start with zero loaded count', () => {
    expect(DEFAULT_VIRTUAL_SCROLL_STATE.loadedCount).toBe(0);
  });

  it('should have hasMore as false', () => {
    expect(DEFAULT_VIRTUAL_SCROLL_STATE.hasMore).toBe(false);
  });

  it('should not be loading', () => {
    expect(DEFAULT_VIRTUAL_SCROLL_STATE.isLoading).toBe(false);
  });

  it('should have zero scroll offset', () => {
    expect(DEFAULT_VIRTUAL_SCROLL_STATE.scrollOffset).toBe(0);
  });
});

describe('type correctness', () => {
  it('should accept valid TimelineOrientation values', () => {
    const v: TimelineOrientation = 'vertical';
    const h: TimelineOrientation = 'horizontal';
    expect(v).toBe('vertical');
    expect(h).toBe('horizontal');
  });

  it('should accept valid TimelineLayout values', () => {
    const s: TimelineLayout = 'single';
    const a: TimelineLayout = 'alternating';
    expect(s).toBe('single');
    expect(a).toBe('alternating');
  });

  it('should accept valid TimeSegmentGrouping values', () => {
    const groups: TimeSegmentGrouping[] = ['none', 'day', 'week', 'month', 'quarter', 'year'];
    expect(groups).toHaveLength(6);
  });

  it('should construct TimelineAction', () => {
    const action: TimelineAction = {
      id: 'view',
      label: 'View',
      icon: 'fa-solid fa-eye',
      variant: 'primary',
      tooltip: 'View details',
      disabled: false
    };
    expect(action.id).toBe('view');
    expect(action.variant).toBe('primary');
  });

  it('should construct TimelineDisplayField', () => {
    const field: TimelineDisplayField = {
      fieldName: 'Status',
      label: 'Status',
      icon: 'fa-solid fa-circle',
      formatter: (v) => String(v).toUpperCase()
    };
    expect(field.formatter!('active')).toBe('ACTIVE');
  });

  it('should construct MJTimelineEvent', () => {
    const event: MJTimelineEvent<{ Name: string }> = {
      id: '1',
      entity: { Name: 'Test' },
      title: 'Test Event',
      date: new Date(),
      config: {},
      groupIndex: 0,
      isExpanded: false
    };
    expect(event.entity.Name).toBe('Test');
  });

  it('should construct TimelineSegment', () => {
    const segment: TimelineSegment = {
      label: 'January 2026',
      startDate: new Date(2026, 0, 1),
      endDate: new Date(2026, 1, 1),
      events: [],
      isExpanded: true,
      eventCount: 0
    };
    expect(segment.label).toBe('January 2026');
    expect(segment.isExpanded).toBe(true);
  });
});
