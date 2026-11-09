import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { MJDashboardEntity } from '@memberjunction/core-entities';
import { HighlightSearchMatches } from '@memberjunction/global';
import type { DashboardLayoutPreviewNode } from '../layout-preview/dashboard-layout-preview';
import { FormatDashboardDate } from './dashboard-card.helpers';
import { LayoutPreviewCache } from './layout-preview-cache';

/** A click on a dashboard card outside its buttons. */
export interface DashboardCardClickEvent {
    Dashboard: MJDashboardEntity;
    /** The click; the host reads its Shift, Ctrl and Cmd keys. */
    MouseEvent: MouseEvent;
}

/**
 * A dashboard card: a picture, the name, the description, and a meta row with the owner, a Shared
 * marker, the category and the last update. The picture is the screenshot (Thumbnail), else a
 * miniature of the saved panel layout, else an icon. A Config dashboard with no parts shows the icon
 * and "Not set up yet". Presentational: the host decides what each event does.
 */
@Component({
    standalone: false,
    selector: 'mj-dashboard-card',
    templateUrl: './dashboard-card.component.html',
    styleUrls: ['./dashboard-card.component.css'],
})
export class DashboardCardComponent {
    @Input({ required: true }) Dashboard!: MJDashboardEntity;
    /** True when the dashboard is one of the user's favorites: the star is filled. */
    @Input() IsFavorite = false;
    /** Whether the card shows the favorite star. */
    @Input() ShowFavorite = true;
    /** True when another user owns the dashboard and shared it with this user. */
    @Input() IsShared = false;
    /** Who owns the dashboard, for example "You" or "Ana Ruiz". Null shows no owner. */
    @Input() OwnerLabel: string | null = null;
    /** The category path, for example "Sales › Pipeline". Null shows no category. */
    @Input() CategoryPath: string | null = null;
    /** Search text to mark in the name and description. */
    @Input() HighlightQuery = '';
    /** True in selection mode: the card shows a checkbox. */
    @Input() Selectable = false;
    /** True when the card is selected. */
    @Input() Selected = false;
    /** Whether the card offers Edit. */
    @Input() CanEdit = false;
    /** Whether the card offers Delete. */
    @Input() CanDelete = false;

    /** A click on the card outside its buttons. */
    @Output() CardClick = new EventEmitter<DashboardCardClickEvent>();
    /** A double-click on the card outside its buttons. */
    @Output() CardDoubleClick = new EventEmitter<DashboardCardClickEvent>();
    /** A click on the star. */
    @Output() ToggleFavorite = new EventEmitter<MJDashboardEntity>();
    /** A change of the selection checkbox. */
    @Output() SelectionToggle = new EventEmitter<MJDashboardEntity>();
    /** A click on Edit. */
    @Output() Edit = new EventEmitter<MJDashboardEntity>();
    /** A click on Delete. */
    @Output() Delete = new EventEmitter<MJDashboardEntity>();

    private layoutPreview = new LayoutPreviewCache();

    /** The miniature of the saved panel layout: a Config dashboard's saved panels, else null. */
    public get LayoutPreview(): DashboardLayoutPreviewNode | null {
        return this.layoutPreview.PreviewFor(this.Dashboard);
    }

    /** True for a Config dashboard with no parts. Uses the cached preview, so the JSON is parsed once. */
    public get IsNotSetUp(): boolean {
        return this.Dashboard.Type === 'Config' && this.LayoutPreview === null;
    }

    /** The name, with the search text marked. */
    public get NameHtml(): string {
        return HighlightSearchMatches(this.Dashboard.Name ?? '', this.HighlightQuery);
    }

    /** The description, with the search text marked. */
    public get DescriptionHtml(): string {
        return HighlightSearchMatches(this.Dashboard.Description ?? '', this.HighlightQuery);
    }

    /** When the dashboard was last updated, for example "Yesterday". Empty without a date. */
    public get UpdatedLabel(): string {
        return FormatDashboardDate(this.Dashboard.__mj_UpdatedAt);
    }

    public OnCardClick(event: MouseEvent): void {
        this.CardClick.emit({ Dashboard: this.Dashboard, MouseEvent: event });
    }

    public OnCardDoubleClick(event: MouseEvent): void {
        this.CardDoubleClick.emit({ Dashboard: this.Dashboard, MouseEvent: event });
    }

    /** Runs a card button's action without the click also counting as a click on the card. */
    public OnAction(event: Event, action: EventEmitter<MJDashboardEntity>): void {
        event.stopPropagation();
        action.emit(this.Dashboard);
    }
}
