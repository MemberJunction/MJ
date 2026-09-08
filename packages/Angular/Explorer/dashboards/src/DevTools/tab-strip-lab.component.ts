import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { MJWorkspaceTab, MJWorkspaceTabStore, MJTabReorder } from '@memberjunction/ng-ui-components';
import { TabClosedEvent } from '@memberjunction/ng-tabstrip';

/**
 * Tab Strip Lab — MJ's two tab strips, rendered side by side over the SAME labels.
 *
 * They are two components on purpose: `mj-tabstrip` takes tabs as projected children and addresses
 * them by position (it owns their bodies), while `mj-workspace-tab-strip` takes a data array and
 * addresses it by stable id (it projects nothing). Those are genuinely different API contracts.
 * What they must NEVER differ on is how a tab looks or how it responds to a keyboard — and that is
 * exactly the kind of drift no unit test catches and nobody notices until two screens sit side by
 * side. Hence this page: the same four labels through both, so any divergence is immediate.
 *
 * Both get their chrome from the one global `.mj-tabs*` stylesheet and their keyboard behaviour
 * from the one `mjTabList` directive, so a difference visible here is a bug in that sharing.
 *
 * 🚨 SAFETY BOUNDARY: deliberately unwired from agent context and client tools, as a developer
 * fixture rather than a data surface (the GraphQL Console precedent). It reads and writes nothing.
 */
@RegisterClass(BaseResourceComponent, 'TabStripLabInspector')
@Component({
    standalone: false,
    selector: 'mj-tab-strip-lab',
    templateUrl: './tab-strip-lab.component.html',
    styleUrls: ['./inspector-shared.css', './tab-strip-lab.component.css']
})
export class TabStripLabComponent extends BaseResourceComponent implements OnInit {
    /** One source of labels for both strips — the comparison is worthless if they differ. */
    public readonly Labels: string[] = ['Overview', 'Line items', 'A deliberately long tab label that must ellipsize', 'Audit'];

    /**
     * The projected strip's tabs, as mutable state: `mj-tabstrip` owns no tab array, so CLOSING a
     * tab means the host removing it from the list it renders — a close with no `(BeforeTabClosed)`
     * handler waits forever on the strip's cancelable-close contract and silently does nothing.
     */
    public ProjectedLabels: string[] = [...this.Labels];

    /** Drives the projected strip. */
    public ProjectedIndex = 0;

    /**
     * Drives the data-driven strip. Uses the real store rather than a hand-rolled array so the
     * fixture also exercises open/close/reorder/neighbour-activation as shipped.
     */
    public readonly Store = new MJWorkspaceTabStore<{ Note: string }>();

    constructor(private cdr: ChangeDetectorRef) {
        super();
    }

    public override async GetResourceDisplayName(): Promise<string> { return 'Tab Strip Lab'; }
    public override async GetResourceIconClass(): Promise<string> { return 'fa-solid fa-folder-tree'; }

    /**
     * Snapshot of `Store.Tabs`, reassigned by every handler. A getter delegating to the store
     * returns a FRESH array per read, which both defeats the strip's OnPush change detection and
     * trips dev-mode `ExpressionChanged` under default CD — the classic unstable-binding bug.
     */
    public DraftTabs: MJWorkspaceTab<{ Note: string }>[] = [];

    public ngOnInit(): void {
        this.ResetDraftTabs();
        this.NotifyLoadComplete();
    }

    /**
     * Seeded so every per-tab state the chrome can express is on screen at once — a plain tab, one
     * with unsaved edits (dot), one rejected (warning tint + icon), one complete. Otherwise the
     * states that only appear mid-workflow are the ones that quietly drift.
     */
    public ResetDraftTabs(): void {
        this.ProjectedLabels = [...this.Labels];
        this.Store.Clear();
        this.Labels.forEach((label, i) => {
            this.Store.Open({
                Id: `t${i}`,
                Label: label,
                Status: i === 2 ? 'rejected' : i === 3 ? 'complete' : 'draft',
                Dirty: i === 1,
                State: { Note: label },
            });
        });
        this.Store.Activate('t0');
        this.DraftTabs = this.Store.Tabs;
        this.cdr.detectChanges();
    }

    public OnDraftSelected(id: string): void {
        this.Store.Activate(id);
        this.DraftTabs = this.Store.Tabs;
        this.cdr.detectChanges();
    }

    public OnDraftClosed(id: string): void {
        this.Store.Close(id);
        this.DraftTabs = this.Store.Tabs;
        this.cdr.detectChanges();
    }

    public OnDraftReordered(move: MJTabReorder): void {
        this.Store.Reorder(move.previousIndex, move.currentIndex);
        this.DraftTabs = this.Store.Tabs;
        this.cdr.detectChanges();
    }

    public OnDraftNew(): void {
        const n = this.Store.Count + 1;
        this.Store.Open({ Id: `new-${n}-${this.Labels.length}`, Label: `Draft ${n}`, Status: 'draft', State: { Note: '' } });
        this.DraftTabs = this.Store.Tabs;
        this.cdr.detectChanges();
    }

    public OnProjectedTabSelect(event: { index: number }): void {
        this.ProjectedIndex = event.index;
        this.cdr.detectChanges();
    }

    /**
     * Complete the strip's close contract: `(TabClosed)` hands the host a `done` callback and the
     * strip's `CloseTab` awaits it — the host removes the tab from ITS list (the strip owns no tab
     * array) and signals done. Without a handler the promise never settles and the close button
     * (and the Delete key) silently do nothing — the exact contract this page exists to demonstrate.
     */
    public OnProjectedTabClosed(props: TabClosedEvent): void {
        this.ProjectedLabels = this.ProjectedLabels.filter((_, i) => i !== props.index);
        this.cdr.detectChanges();
        props.done();
    }
}
