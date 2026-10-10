import type { MJDashboardEntity } from '@memberjunction/core-entities';
import { BuildDashboardLayoutPreview, DashboardLayoutPreviewNode } from '../layout-preview/dashboard-layout-preview';

/**
 * The layout preview a dashboard card draws: the tree of a Config dashboard's saved panel layout,
 * or null (a Code dashboard, or no panels). It builds the tree again only when the saved
 * configuration or the type changes, so a template can ask on every change detection, also after
 * the same dashboard object is saved again, and the preview gets the same tree until then.
 */
export class LayoutPreviewCache {
    private checkedDetails: string | null = null;
    private checkedType: MJDashboardEntity['Type'] | null = null;
    private preview: DashboardLayoutPreviewNode | null = null;

    public PreviewFor(dashboard: Pick<MJDashboardEntity, 'Type' | 'UIConfigDetails'>): DashboardLayoutPreviewNode | null {
        const details = dashboard.UIConfigDetails ?? null;
        if (details !== this.checkedDetails || dashboard.Type !== this.checkedType) {
            this.checkedDetails = details;
            this.checkedType = dashboard.Type;
            this.preview = dashboard.Type === 'Config' ? BuildDashboardLayoutPreview(details) : null;
        }
        return this.preview;
    }
}
