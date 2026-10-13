import type { MJDashboardEntity } from '@memberjunction/core-entities';

/** How the editor lays out its body: the dashboard fills the editor, or sits in a padded card. */
export type DashboardEditorBodyStyle = 'fill' | 'card';

/** Why the editor could not show a dashboard. */
export interface DashboardEditorLoadError {
    /** The dashboard the editor was asked to show. */
    DashboardId: string;
    /** What went wrong. */
    Message: string;
}

/** A name and description that a Save applies instead of the fields' values (an agent's confirmed request). */
export interface DashboardSaveOverrides {
    Name?: string;
    Description?: string;
}

/** The context a host's TitleTemplate gets. */
export interface DashboardEditorTitleContext {
    $implicit: MJDashboardEntity; // case-violation-ok-legacy-back-compat: Angular's implicit template context key
    Dashboard: MJDashboardEntity;
}

/** Why the editor refuses a save or an edit while a Save runs. */
export const DASHBOARD_SAVE_IN_PROGRESS = 'A save is in progress. Try again when it finishes.';
