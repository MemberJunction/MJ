import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { DashboardLayoutPreviewGroup, DashboardLayoutPreviewNode, DashboardLayoutPreviewPanel } from './dashboard-layout-preview';

/**
 * One node of a dashboard layout preview: a panel box, or a row or column that draws its children
 * with this component. The host takes the node's share of its parent as its flex-grow.
 */
@Component({
    standalone: false,
    selector: 'mj-dashboard-layout-preview-node',
    templateUrl: './dashboard-layout-preview-node.component.html',
    styleUrls: ['./dashboard-layout-preview-node.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: {
        '[class.dlp-row]': "Group?.Kind === 'row'",
        '[class.dlp-column]': "Group?.Kind === 'column'",
        '[style.flex-grow]': 'Weight',
    },
})
export class DashboardLayoutPreviewNodeComponent {
    /** The node when it is a panel, else null. */
    public Panel: DashboardLayoutPreviewPanel | null = null;
    /** The node when it is a row or column, else null. */
    public Group: DashboardLayoutPreviewGroup | null = null;
    /** The node's share of its parent, from 0 to 1. */
    public Weight = 1;

    private _node: DashboardLayoutPreviewNode | null = null;

    @Input({ required: true })
    set Node(value: DashboardLayoutPreviewNode) {
        this._node = value;
        this.Weight = value.Weight;
        this.Panel = value.Kind === 'panel' ? value : null;
        this.Group = value.Kind === 'panel' ? null : value;
    }
    get Node(): DashboardLayoutPreviewNode | null {
        return this._node;
    }
}
