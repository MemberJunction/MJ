/**
 * Context object that carries form-level state down to child components.
 * This pattern avoids the need to add individual @Input properties for every form-level setting,
 * making it easier to extend functionality without changing component plumbing.
 */
export interface BaseFormContext {
    /**
     * Current search filter text for filtering sections and highlighting field labels.
     * When set, sections and fields that match the filter will be highlighted.
     */
    sectionFilter?: string;

    /**
     * Controls whether empty fields should be shown in read-only mode.
     * When true, all fields are shown regardless of value.
     * When false (default), empty fields are hidden to reduce visual clutter.
     */
    showEmptyFields?: boolean;

    /**
     * Additional context properties can be added here in the future without
     * requiring changes to component signatures.
     */
}

/**
 * Creates a default BaseFormContext with sensible defaults.
 */
export function createDefaultFormContext(): BaseFormContext {
    return {
        sectionFilter: '',
        showEmptyFields: false
    };
}
