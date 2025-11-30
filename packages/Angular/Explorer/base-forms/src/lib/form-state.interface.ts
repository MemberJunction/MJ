/**
 * State for an individual form section (panel)
 */
export interface FormSectionState {
    /** Whether the section is currently expanded */
    isExpanded: boolean;
    /** Width mode for the section panel */
    widthMode: 'normal' | 'full-width';
}

/**
 * Complete form state for an entity, persisted to User Settings
 */
export interface FormState {
    /** Per-section state, keyed by sectionKey */
    sections: Record<string, FormSectionState>;
    /** Whether to show fields with empty values */
    showEmptyFields: boolean;
}

/**
 * Default state for a new form (when no saved state exists)
 */
export const DEFAULT_FORM_STATE: FormState = {
    sections: {},
    showEmptyFields: false
};

/**
 * Default state for a new section (when section not yet in saved state)
 */
export const DEFAULT_SECTION_STATE: FormSectionState = {
    isExpanded: true,
    widthMode: 'normal'
};
