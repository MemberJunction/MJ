/**
 * State for an individual form section (panel)
 */
export interface FormSectionState {
    /**
     * Whether the section is currently expanded. Optional: `undefined` means the user has
     * never explicitly expanded/collapsed this section, so the section's seeded default
     * (passed by the caller / from `initSections()`) should govern. This must stay decoupled
     * from `panelHeight` — persisting a height must NOT imply an expansion state, otherwise
     * measuring a collapsed panel on load would silently mark it expanded.
     */
    isExpanded?: boolean;
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
    /**
     * Whether `widthMode` reflects an explicit user choice (via the toolbar
     * width-toggle button) vs. a default carried along in the serialized
     * blob. Only true when `setWidthMode` has been called. Callers that want
     * to honor a component-level default should check this flag before
     * using `widthMode` — see `BaseFormComponent.getFormWidthMode`.
     *
     * Optional because pre-existing persisted blobs predate this flag; they
     * are treated as non-explicit so custom forms with their own defaults
     * can take precedence on upgrade.
     */
    widthModeExplicit?: boolean;
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
