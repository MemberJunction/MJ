import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { BuildDashboardLayoutPreview, DashboardLayoutPreviewNode } from './dashboard-layout-preview';

/**
 * A miniature of a dashboard's saved panel layout: nested boxes sized like the saved rows, columns
 * and panels, each box with its panel's icon and title. It fills its container and renders only
 * phrasing elements, so it can sit inside a button. It is decorative (aria-hidden), so the host
 * must name the dashboard. It draws nothing when there is no panel layout.
 */
@Component({
    standalone: false,
    selector: 'mj-dashboard-layout-preview',
    templateUrl: './dashboard-layout-preview.component.html',
    styleUrls: ['./dashboard-layout-preview.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { 'aria-hidden': 'true' },
})
export class DashboardLayoutPreviewComponent {
    /** The tree drawn: Preview when it is set, else the tree built from UIConfigDetails, else null. */
    public Root: DashboardLayoutPreviewNode | null = null;

    private _uiConfigDetails: string | null = null;
    private _parsed: DashboardLayoutPreviewNode | null = null;
    private _preview: DashboardLayoutPreviewNode | null = null;

    /** The dashboard's saved configuration (`MJ: Dashboards.UIConfigDetails`). Not used while Preview is set. */
    @Input()
    set UIConfigDetails(value: string | null | undefined) {
        this._uiConfigDetails = value ?? null;
        this._parsed = BuildDashboardLayoutPreview(this._uiConfigDetails);
        this.updateRoot();
    }
    get UIConfigDetails(): string | null {
        return this._uiConfigDetails;
    }

    /**
     * A tree the host already built with BuildDashboardLayoutPreview, so the saved configuration is
     * not parsed again.
     */
    @Input()
    set Preview(value: DashboardLayoutPreviewNode | null | undefined) {
        this._preview = value ?? null;
        this.updateRoot();
    }
    get Preview(): DashboardLayoutPreviewNode | null {
        return this._preview;
    }

    private updateRoot(): void {
        this.Root = this._preview ?? this._parsed;
    }
}
