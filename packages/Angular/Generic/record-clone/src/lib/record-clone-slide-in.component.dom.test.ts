import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderComponentFixture, query } from '@memberjunction/ng-test-utils';
import { RecordCloneSlideInComponent } from './record-clone-slide-in.component';
import { RecordCloneService } from './record-clone.service';
import type { CloneNavigationEvent } from './record-clone-types';

describe('RecordCloneSlideInComponent (DOM)', () => {
    let mockService: RecordCloneService;

    beforeEach(() => {
        mockService = {
            DescribeRecord: vi.fn().mockResolvedValue({ CanClone: false, Reason: 'Disabled', Relationships: [] }),
            PlanClone: vi.fn(),
            ExecuteClone: vi.fn(),
            GetLineage: vi.fn(),
        } as unknown as RecordCloneService;
    });

    const flush = () => new Promise((r) => setTimeout(r, 0));

    it('does not create the panel until first opened', () => {
        const fixture = renderComponentFixture(RecordCloneSlideInComponent, {
            providers: [{ provide: RecordCloneService, useValue: mockService }],
            inputs: { EntityName: 'Users', RecordKey: 'u-1' },
        });
        expect(query(fixture, 'mj-record-clone-panel')).toBeNull();
        expect(mockService.DescribeRecord).not.toHaveBeenCalled();
    });

    it('creates and starts the panel when opened, and restarts it on each reopen', async () => {
        const fixture = renderComponentFixture(RecordCloneSlideInComponent, {
            providers: [{ provide: RecordCloneService, useValue: mockService }],
            inputs: { EntityName: 'Users', RecordKey: 'u-1' },
        });

        fixture.componentInstance.Open();
        fixture.detectChanges();
        await flush();
        expect(query(fixture, 'mj-record-clone-panel')).not.toBeNull();
        expect(mockService.DescribeRecord).toHaveBeenCalledTimes(1);

        fixture.componentInstance.Close();
        fixture.componentInstance.Open();
        fixture.detectChanges();
        await flush();
        expect(mockService.DescribeRecord).toHaveBeenCalledTimes(2);
    });

    it('emits VisibleChange and Closed when the panel asks to close', async () => {
        const fixture = renderComponentFixture(RecordCloneSlideInComponent, {
            providers: [{ provide: RecordCloneService, useValue: mockService }],
            inputs: { EntityName: 'Users', RecordKey: 'u-1' },
        });
        const visible: boolean[] = [];
        let closed = 0;
        fixture.componentInstance.VisibleChange.subscribe((v) => visible.push(v));
        fixture.componentInstance.Closed.subscribe(() => closed++);

        fixture.componentInstance.Open();
        fixture.detectChanges();
        await flush();
        fixture.componentInstance.Panel!.OnClose();

        expect(visible).toEqual([true, false]);
        expect(closed).toBe(1);
        expect(fixture.componentInstance.Visible).toBe(false);
    });

    it('refuses to close while a clone is executing', async () => {
        const fixture = renderComponentFixture(RecordCloneSlideInComponent, {
            providers: [{ provide: RecordCloneService, useValue: mockService }],
            inputs: { EntityName: 'Users', RecordKey: 'u-1' },
        });
        fixture.componentInstance.Open();
        fixture.detectChanges();
        await flush();

        fixture.componentInstance.Panel!.CurrentState = 'executing';
        fixture.componentInstance.Close();
        expect(fixture.componentInstance.Visible).toBe(true);
        expect(fixture.componentInstance.CanCloseGuard()).toBe(false);
    });

    it('re-emits navigation from the panel and closes', async () => {
        const fixture = renderComponentFixture(RecordCloneSlideInComponent, {
            providers: [{ provide: RecordCloneService, useValue: mockService }],
            inputs: { EntityName: 'Users', RecordKey: 'u-1' },
        });
        let nav: CloneNavigationEvent | null = null;
        fixture.componentInstance.NavigateToRecord.subscribe((e) => (nav = e));

        fixture.componentInstance.Open();
        fixture.detectChanges();
        await flush();
        fixture.componentInstance.Panel!.OnNavigateToRecord({ Kind: 'record', EntityName: 'Users', RecordKey: 'u-2' });

        expect(nav).toEqual({ Kind: 'record', EntityName: 'Users', RecordKey: 'u-2' });
        expect(fixture.componentInstance.Visible).toBe(false);
    });

    it('defaults the title to the entity name', () => {
        const fixture = renderComponentFixture(RecordCloneSlideInComponent, {
            providers: [{ provide: RecordCloneService, useValue: mockService }],
            inputs: { EntityName: 'MJ: Users' },
        });
        expect(fixture.componentInstance.DefaultTitle).toBe('Clone MJ: Users');
    });
});
