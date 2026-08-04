import { describe, it, expect } from 'vitest';
import { Component, Input, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NG_VALUE_ACCESSOR, ControlValueAccessor } from '@angular/forms';
import { renderComponentFixture, query, text, attr, capture, StubEmptyStateComponent } from '@memberjunction/ng-test-utils';
import { AIAgentRunStepDetailComponent } from './ai-agent-run-step-detail.component';
import type { TimelineItem } from './ai-agent-run-timeline.component';

/**
 * DOM coverage for <mj-ai-agent-run-step-detail> — the right-hand inspector panel for a selected
 * timeline item. Purely presentational (only ChangeDetectorRef): the whole panel is gated on
 * `selectedTimelineItem`, and it surfaces the item's title/type/status/duration + a close button.
 * `ngOnChanges` recomputes the JSON string + default tab and calls detectChanges, so we render with
 * `autoDetect` to stay NG0100-safe. CommonModule supplies `ngClass`; FormsModule the code editor's
 * ngModel. The heavy JSON/diff children (`mj-code-editor`, `mj-deep-diff`, `mj-empty-state`) have
 * their own package tests, so we replace them with lightweight selector+@Input stubs.
 */

@Component({
  standalone: true,
  selector: 'mj-code-editor',
  template: '',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => CodeEditorStub), multi: true }],
})
class CodeEditorStub implements ControlValueAccessor {
  @Input() language = '';
  @Input() readonly = false;
  writeValue(): void {}
  registerOnChange(): void {}
  registerOnTouched(): void {}
}

@Component({ standalone: true, selector: 'mj-deep-diff', template: '' })
class DeepDiffStub {
  @Input() oldValue: unknown = null;
  @Input() newValue: unknown = null;
  @Input() title = '';
  @Input() showSummary = false;
  @Input() showUnchanged = false;
  @Input() expandAll = false;
  @Input() maxDepth = 0;
  @Input() maxStringLength = 0;
  @Input() treatNullAsUndefined = false;
}

const item = (over: Partial<TimelineItem> = {}): TimelineItem => ({
  id: 's1',
  type: 'step',
  title: 'Execute Action: Search',
  subtitle: '',
  status: 'Completed',
  startTime: new Date('2026-01-01T10:00:00Z'),
  duration: '1.2s',
  icon: 'fa-wrench',
  color: '#22c55e',
  data: {},
  level: 0,
  ...over,
});

const render = (selectedTimelineItem: TimelineItem | null) =>
  renderComponentFixture(AIAgentRunStepDetailComponent, {
    imports: [CommonModule, FormsModule, CodeEditorStub, DeepDiffStub, StubEmptyStateComponent],
    declarations: [AIAgentRunStepDetailComponent],
    inputs: { selectedTimelineItem },
    autoDetect: true,
  });

describe('AIAgentRunStepDetailComponent (DOM)', () => {
  it('renders nothing when no item is selected', () => {
    expect(query(render(null), '.json-detail-pane')).toBeNull();
  });

  it('renders the panel with the selected item title when an item is provided', () => {
    const fixture = render(item());
    expect(query(fixture, '.json-detail-pane')).not.toBeNull();
    expect(text(fixture, '.json-pane-header h3')).toContain('Execute Action: Search');
  });

  it('surfaces the item type, status, and duration in the meta block', () => {
    const fixture = render(item({ status: 'Failed', duration: '3.4s' }));
    expect(fixture.nativeElement.textContent).toContain('Failed');
    expect(fixture.nativeElement.textContent).toContain('3.4s');
    expect(attr(fixture, '.status-badge', 'data-status')).toBe('Failed');
  });

  it('emits closePanel when the close button is clicked', () => {
    const fixture = render(item());
    const closes = capture(fixture.componentInstance.closePanel);
    (query(fixture, '.json-pane-header .btn-icon') as HTMLElement).click();
    expect(closes.length).toBe(1);
  });

  it('shows the action-log link for an action item that has an ID and emits navigateToActionLog', () => {
    const fixture = render(item({ type: 'action', data: { ID: 'log-7' } }));
    const link = query(fixture, '.action-link .btn-link') as HTMLElement;
    expect(link).not.toBeNull();
    const nav = capture(fixture.componentInstance.navigateToActionLog);
    link.click();
    expect(nav).toEqual(['log-7']);
  });
});
