import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';
import type { EntityInfo, IMetadataProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import { RecycleBinChipComponent } from '../lib/recycle-bin/recycle-bin-chip.component';
import type {
  AfterRecycleBinOpenEventArgs,
  AfterRestoreCommitEventArgs,
  BeforeRecordRestoreEventArgs,
} from '../lib/recycle-bin/events/recycle-bin-events';

@Component({ standalone: true, selector: 'mj-recycle-bin', template: '' })
class RecycleBinStub {
  @Input() Provider: unknown;
  @Input() Visible = false;
  @Input() EntityName: string | null = null;
  @Input() ContextUser: unknown;
  @Output() Closed = new EventEmitter<void>();
  @Output() BeforeRecycleBinOpen = new EventEmitter<unknown>();
  @Output() AfterRecycleBinOpen = new EventEmitter<AfterRecycleBinOpenEventArgs>();
  @Output() BeforeRecordRestore = new EventEmitter<BeforeRecordRestoreEventArgs>();
  @Output() AfterRecordRestore = new EventEmitter<unknown>();
  @Output() BeforeRestoreCommit = new EventEmitter<unknown>();
  @Output() AfterRestoreCommit = new EventEmitter<AfterRestoreCommitEventArgs>();
}

type ObserverCallback = (entries: IntersectionObserverEntry[]) => void;

function createMockMetadataProvider(runViewSpy: (params: RunViewParams) => Promise<RunViewResult>): IMetadataProvider {
  const dummyUser: UserInfo = {
    ID: 'user-1',
    Name: 'Test User',
    Email: 'test@example.com',
  } as unknown as UserInfo;

  const entityInfo: EntityInfo = {
    ID: 'entity-guid-1',
    Name: 'TestEntity',
    TrackRecordChanges: true,
    GetUserPermisions: () => ({ CanDelete: true }),
  } as unknown as EntityInfo;

  return {
    CurrentUser: dummyUser,
    Entities: [entityInfo],
    RunView: runViewSpy,
  } as unknown as IMetadataProvider;
}

describe('RecycleBinChipComponent Visibility Deferral and Query Optimization', () => {
  let savedIntersectionObserver: typeof IntersectionObserver | undefined;
  let observerCallback: ObserverCallback | null = null;
  let observedElement: Element | null = null;
  let observerDisconnected = false;

  class MockIntersectionObserver {
    constructor(callback: ObserverCallback) {
      observerCallback = callback;
    }
    observe(element: Element): void {
      observedElement = element;
    }
    unobserve(): void {}
    disconnect(): void {
      observerDisconnected = true;
    }
  }

  beforeEach(() => {
    savedIntersectionObserver = globalThis.IntersectionObserver;
    globalThis.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;
    observerCallback = null;
    observedElement = null;
    observerDisconnected = false;
    RecycleBinChipComponent.SkipIntersectionObserverInTest = false;
  });

  afterEach(() => {
    RecycleBinChipComponent.SkipIntersectionObserverInTest = true;
    if (savedIntersectionObserver) {
      globalThis.IntersectionObserver = savedIntersectionObserver;
    } else {
      delete (globalThis as Record<string, unknown>).IntersectionObserver;
    }
    vi.restoreAllMocks();
  });

  it('defers refreshCount until IntersectionObserver reports intersection', async () => {
    let refreshCountCalls = 0;
    const runViewCalls: RunViewParams[] = [];

    const mockProvider = createMockMetadataProvider(async (params: RunViewParams) => {
      runViewCalls.push(params);
      return {
        Success: true,
        Results: [{ ID: 'rc-1', RecordID: 'r-1' }],
        RowCount: 1,
        TotalRowCount: 1,
      } as unknown as RunViewResult;
    });

    const refreshSpy = vi.spyOn(
      RecycleBinChipComponent.prototype as unknown as { refreshCount: () => Promise<void> },
      'refreshCount'
    ).mockImplementation(async function (this: RecycleBinChipComponent) {
      refreshCountCalls++;
    });

    const fixture = renderComponentFixture(RecycleBinChipComponent, {
      imports: [RecycleBinStub],
      declarations: [RecycleBinChipComponent],
      setup: (c) => {
        c.Provider = mockProvider;
        c.EntityName = 'TestEntity';
      },
    });

    // Observer should have been set up and observing native element
    expect(observedElement).toBe(fixture.debugElement.nativeElement);
    // Because isVisibleInViewport is false, refreshCount should not have fired yet
    expect(refreshCountCalls).toBe(0);

    // Now trigger non-intersecting entry: still no query
    observerCallback?.([{ isIntersecting: false } as IntersectionObserverEntry]);
    expect(refreshCountCalls).toBe(0);
    expect(observerDisconnected).toBe(false);

    // Trigger intersecting entry: should disconnect observer and call refreshCount
    observerCallback?.([{ isIntersecting: true } as IntersectionObserverEntry]);
    expect(observerDisconnected).toBe(true);
    expect(refreshCountCalls).toBe(1);

    refreshSpy.mockRestore();
  });

  it('triggers refreshCount immediately if Toggle() is invoked before intersection', async () => {
    let refreshCountCalls = 0;
    vi.spyOn(
      RecycleBinChipComponent.prototype as unknown as { refreshCount: () => Promise<void> },
      'refreshCount'
    ).mockImplementation(async () => {
      refreshCountCalls++;
    });

    const fixture = renderComponentFixture(RecycleBinChipComponent, {
      imports: [RecycleBinStub],
      declarations: [RecycleBinChipComponent],
      setup: (c) => {
        c.EntityName = 'TestEntity';
      },
    });

    expect(refreshCountCalls).toBe(0);

    // Calling Toggle() opens panel and forces visible count refresh
    fixture.componentInstance.Toggle();
    expect(refreshCountCalls).toBe(1);
    expect(fixture.componentInstance.PanelVisible).toBe(true);
  });

  it('uses lightweight count query parameters: Fields=["RecordID"] and SkipTotalRowCount=true', async () => {
    let capturedParams: RunViewParams | null = null;

    const mockProvider = createMockMetadataProvider(async (params: RunViewParams) => {
      capturedParams = params;
      return {
        Success: true,
        Results: [
          { ID: 'rc-1', RecordID: 'record-A' },
          { ID: 'rc-2', RecordID: 'record-B' },
          { ID: 'rc-3', RecordID: 'record-A' }, // duplicate deleted record
        ],
        RowCount: 3,
        TotalRowCount: 3,
      } as unknown as RunViewResult;
    });

    const fixture = renderComponentFixture(RecycleBinChipComponent, {
      imports: [RecycleBinStub],
      declarations: [RecycleBinChipComponent],
      setup: (c) => {
        c.Provider = mockProvider;
      },
    });

    fixture.componentInstance.EntityName = 'TestEntity';

    // Simulate intersection
    observerCallback?.([{ isIntersecting: true } as IntersectionObserverEntry]);

    // Wait for async refreshCount to finish
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(capturedParams).not.toBeNull();
    const params = capturedParams!;
    expect(params.EntityName).toBe('MJ: Record Changes');
    expect(params.Fields).toEqual(['RecordID']);
    expect(params.SkipTotalRowCount).toBe(true);
    expect(params.MaxRows).toBe(500);
    expect(params.ResultType).toBe('simple');

    // Distinct record count: 2 distinct IDs ('record-A', 'record-B')
    expect(fixture.componentInstance.DeletedCount).toBe(2);
    expect(fixture.componentInstance.IsVisible).toBe(true);
  });

  it('disconnects IntersectionObserver on destroy', () => {
    const fixture = renderComponentFixture(RecycleBinChipComponent, {
      imports: [RecycleBinStub],
      declarations: [RecycleBinChipComponent],
      setup: (c) => {
        c.EntityName = 'TestEntity';
      },
    });

    expect(observerDisconnected).toBe(false);
    fixture.destroy();
    expect(observerDisconnected).toBe(true);
  });
});
