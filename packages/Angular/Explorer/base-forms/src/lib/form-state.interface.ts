/**
 * State for an individual form section (panel)
 */
export interface FormSectionState {
    /** Whether the section is currently expanded */
    isExpanded: boolean;
    /** User-resized panel height in pixels (related-entity panels only) */
    panelHeight?: number;
}

/**
 * Complete form state for an entity, persisted to User Settings
 */
export interface FormState {
    /** Per-section state, keyed by sectionKey */
    sections: Record<string, FormSectionState>;
    /** Whether to show fields with empty values */
    showEmptyFields: boolean;
    /** Form width mode - 'centered' uses max-width constraint, 'full-width' uses all available space */
    widthMode: 'centered' | 'full-width';
    /** Custom section ordering - array of sectionKeys in user's preferred order */
    sectionOrder?: string[];
}

/**
 * Default state for a new form (when no saved state exists)
 */
export const DEFAULT_FORM_STATE: FormState = {
    sections: {},
    showEmptyFields: false,
    widthMode: 'centered'
};

/**
 * Default state for a new section (when section not yet in saved state)
 */
export const DEFAULT_SECTION_STATE: FormSectionState = {
    isExpanded: true
};
