import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Metadata, IMetadataProvider } from '@memberjunction/core';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { FormState, FormSectionState, DEFAULT_FORM_STATE, DEFAULT_SECTION_STATE } from './form-state.interface';

const SETTING_KEY_PREFIX = 'Form.State.';

/**
 * Service for managing form state persistence per entity.
 * State is stored in the User Settings entity and shared reactively
 * across all form instances for the same entity.
 */
@Injectable({
    providedIn: 'root'
})
export class FormStateService {
    /** Cache of BehaviorSubjects per entity name */
    private stateCache = new Map<string, BehaviorSubject<FormState>>();

    /** Track which entities have been loaded from DB */
    private loadedEntities = new Set<string>();

    /** Track loading promises to prevent duplicate loads */
    private loadingPromises = new Map<string, Promise<void>>();

    /** Track which entities are currently in edit mode (saves suppressed) */
    private editingEntities = new Set<string>();

    private _provider: IMetadataProvider | null = null;

    /**
     * Set the metadata provider this service should use. When unset, falls back to Metadata.Provider.
     */
    public set Provider(value: IMetadataProvider | null) {
        this._provider = value;
    }

    private get metadata(): IMetadataProvider {
        return this._provider ?? Metadata.Provider;
    }

    /**
     * Get the observable state for an entity.
     * Automatically loads from User Settings on first access.
     * @param entityName The entity name
     * @returns Observable of the form state
     */
    GetState$(entityName: string): Observable<FormState> {
        return this.getOrCreateSubject(entityName).asObservable();
    }

    /** @deprecated Use {@link GetState$}. */
    getState$(entityName: string): Observable<FormState> {
        return this.GetState$(entityName);
    }

    /**
     * Get the current state value for an entity.
     * @param entityName The entity name
     * @returns Current form state
     */
    GetCurrentState(entityName: string): FormState {
        return this.getOrCreateSubject(entityName).value;
    }

    /** @deprecated Use {@link GetCurrentState}. */
    getCurrentState(entityName: string): FormState {
        return this.GetCurrentState(entityName);
    }

    /**
     * Initialize state for an entity by loading from User Settings.
     * Call this when a form component initializes.
     * @param entityName The entity name
     */
    async InitializeState(entityName: string): Promise<FormState> {
        // If already loaded, return current state
        if (this.loadedEntities.has(entityName)) {
            return this.GetCurrentState(entityName);
        }

        // If currently loading, wait for that promise
        const existingPromise = this.loadingPromises.get(entityName);
        if (existingPromise) {
            await existingPromise;
            return this.GetCurrentState(entityName);
        }

        // Start loading
        const loadPromise = this.loadState(entityName);
        this.loadingPromises.set(entityName, loadPromise);

        try {
            await loadPromise;
            this.loadedEntities.add(entityName);
            return this.GetCurrentState(entityName);
        } finally {
            this.loadingPromises.delete(entityName);
        }
    }

    /** @deprecated Use {@link InitializeState}. */
    async initializeState(entityName: string): Promise<FormState> {
        return this.InitializeState(entityName);
    }

    /**
     * Get section state, returning defaults if section doesn't exist yet.
     * @param entityName The entity name
     * @param sectionKey The section key
     * @returns Section state with defaults applied
     */
    GetSectionState(entityName: string, sectionKey: string): FormSectionState {
        const state = this.GetCurrentState(entityName);
        return state.sections[sectionKey] || { ...DEFAULT_SECTION_STATE };
    }

    /** @deprecated Use {@link GetSectionState}. */
    getSectionState(entityName: string, sectionKey: string): FormSectionState {
        return this.GetSectionState(entityName, sectionKey);
    }

    /**
     * Check if a section is expanded.
     * @param entityName The entity name
     * @param sectionKey The section key
     * @param defaultExpanded Optional default value to use when no persisted state exists (defaults to DEFAULT_SECTION_STATE.isExpanded)
     * @returns True if expanded
     */
    IsSectionExpanded(entityName: string, sectionKey: string, defaultExpanded?: boolean): boolean {
        const state = this.GetCurrentState(entityName);
        const sectionState = state.sections[sectionKey];
        // Only honor a persisted expansion when it was EXPLICITLY set. A section entry that
        // exists solely to hold a panelHeight has isExpanded === undefined and must fall through
        // to the caller's seeded default (collapsed for related-entity panels).
        if (sectionState && sectionState.isExpanded !== undefined) {
            return sectionState.isExpanded;
        }
        // No explicit persisted state - use provided default or fall back to DEFAULT_SECTION_STATE
        return defaultExpanded !== undefined ? defaultExpanded : (DEFAULT_SECTION_STATE.isExpanded ?? true);
    }

    /** @deprecated Use {@link IsSectionExpanded}. */
    isSectionExpanded(entityName: string, sectionKey: string, defaultExpanded?: boolean): boolean {
        return this.IsSectionExpanded(entityName, sectionKey, defaultExpanded);
    }

    /**
     * Set section expanded state.
     * @param entityName The entity name
     * @param sectionKey The section key
     * @param isExpanded Whether the section is expanded
     */
    SetSectionExpanded(entityName: string, sectionKey: string, isExpanded: boolean): void {
        this.updateSectionState(entityName, sectionKey, { isExpanded });
    }

    /** @deprecated Use {@link SetSectionExpanded}. */
    setSectionExpanded(entityName: string, sectionKey: string, isExpanded: boolean): void {
        return this.SetSectionExpanded(entityName, sectionKey, isExpanded);
    }

    /**
     * Get the persisted panel height for a section.
     * @param entityName The entity name
     * @param sectionKey The section key
     * @returns Panel height in pixels, or undefined if no custom height is set
     */
    GetSectionPanelHeight(entityName: string, sectionKey: string): number | undefined {
        const state = this.GetCurrentState(entityName);
        return state.sections[sectionKey]?.panelHeight;
    }

    /** @deprecated Use {@link GetSectionPanelHeight}. */
    getSectionPanelHeight(entityName: string, sectionKey: string): number | undefined {
        return this.GetSectionPanelHeight(entityName, sectionKey);
    }

    /**
     * Set the panel height for a section (persisted to User Settings).
     * @param entityName The entity name
     * @param sectionKey The section key
     * @param height Panel height in pixels
     */
    SetSectionPanelHeight(entityName: string, sectionKey: string, height: number): void {
        this.updateSectionState(entityName, sectionKey, { panelHeight: height });
    }

    /** @deprecated Use {@link SetSectionPanelHeight}. */
    setSectionPanelHeight(entityName: string, sectionKey: string, height: number): void {
        return this.SetSectionPanelHeight(entityName, sectionKey, height);
    }

    /**
     * Toggle section expanded state.
     * @param entityName The entity name
     * @param sectionKey The section key
     */
    ToggleSection(entityName: string, sectionKey: string): void {
        const current = this.IsSectionExpanded(entityName, sectionKey);
        this.SetSectionExpanded(entityName, sectionKey, !current);
    }

    /** @deprecated Use {@link ToggleSection}. */
    toggleSection(entityName: string, sectionKey: string): void {
        return this.ToggleSection(entityName, sectionKey);
    }

    /**
     * Get form width mode.
     * @param entityName The entity name
     * @returns Width mode ('centered' or 'full-width')
     */
    GetWidthMode(entityName: string): 'centered' | 'full-width' {
        return this.GetCurrentState(entityName).widthMode;
    }

    /** @deprecated Use {@link GetWidthMode}. */
    getWidthMode(entityName: string): 'centered' | 'full-width' {
        return this.GetWidthMode(entityName);
    }

    /**
     * Whether this entity has had an EXPLICIT widthMode set via the toolbar
     * width-toggle (and thus the user's choice should win over component
     * defaults). Returns false for pre-existing persisted blobs that had a
     * default `widthMode` serialized as a side effect of other state saves.
     */
    HasExplicitWidthMode(entityName: string): boolean {
        return this.GetCurrentState(entityName).widthModeExplicit === true;
    }

    /** @deprecated Use {@link HasExplicitWidthMode}. */
    hasExplicitWidthMode(entityName: string): boolean {
        return this.HasExplicitWidthMode(entityName);
    }

    /**
     * Set form width mode. Marks the preference as explicit so it wins over
     * any component-level default in `BaseFormComponent.getFormWidthMode`.
     */
    SetWidthMode(entityName: string, widthMode: 'centered' | 'full-width'): void {
        const subject = this.getOrCreateSubject(entityName);
        const currentState = subject.value;
        const newState: FormState = {
            ...currentState,
            widthMode,
            widthModeExplicit: true
        };
        subject.next(newState);
        this.queueSave(entityName);
    }

    /** @deprecated Use {@link SetWidthMode}. */
    setWidthMode(entityName: string, widthMode: 'centered' | 'full-width'): void {
        return this.SetWidthMode(entityName, widthMode);
    }

    /**
     * Toggle form width mode between centered and full-width.
     * @param entityName The entity name
     */
    ToggleWidthMode(entityName: string): void {
        const current = this.GetWidthMode(entityName);
        this.SetWidthMode(entityName, current === 'centered' ? 'full-width' : 'centered');
    }

    /** @deprecated Use {@link ToggleWidthMode}. */
    toggleWidthMode(entityName: string): void {
        return this.ToggleWidthMode(entityName);
    }

    /**
     * Get showEmptyFields preference for an entity.
     * @param entityName The entity name
     * @returns Whether to show empty fields
     */
    GetShowEmptyFields(entityName: string): boolean {
        return this.GetCurrentState(entityName).showEmptyFields;
    }

    /** @deprecated Use {@link GetShowEmptyFields}. */
    getShowEmptyFields(entityName: string): boolean {
        return this.GetShowEmptyFields(entityName);
    }

    /**
     * Set showEmptyFields preference for an entity.
     * @param entityName The entity name
     * @param show Whether to show empty fields
     */
    SetShowEmptyFields(entityName: string, show: boolean): void {
        const subject = this.getOrCreateSubject(entityName);
        const currentState = subject.value;
        const newState: FormState = {
            ...currentState,
            showEmptyFields: show
        };
        subject.next(newState);
        this.queueSave(entityName);
    }

    /** @deprecated Use {@link SetShowEmptyFields}. */
    setShowEmptyFields(entityName: string, show: boolean): void {
        return this.SetShowEmptyFields(entityName, show);
    }

    /**
     * Expand all sections for an entity.
     * @param entityName The entity name
     * @param sectionKeys Array of all section keys to expand
     */
    ExpandAllSections(entityName: string, sectionKeys: string[]): void {
        const subject = this.getOrCreateSubject(entityName);
        const currentState = subject.value;
        const newSections = { ...currentState.sections };

        for (const key of sectionKeys) {
            newSections[key] = {
                ...DEFAULT_SECTION_STATE,
                ...newSections[key],
                isExpanded: true
            };
        }

        subject.next({ ...currentState, sections: newSections });
        this.queueSave(entityName);
    }

    /** @deprecated Use {@link ExpandAllSections}. */
    expandAllSections(entityName: string, sectionKeys: string[]): void {
        return this.ExpandAllSections(entityName, sectionKeys);
    }

    /**
     * Collapse all sections for an entity.
     * @param entityName The entity name
     * @param sectionKeys Array of all section keys to collapse
     */
    CollapseAllSections(entityName: string, sectionKeys: string[]): void {
        const subject = this.getOrCreateSubject(entityName);
        const currentState = subject.value;
        const newSections = { ...currentState.sections };

        for (const key of sectionKeys) {
            newSections[key] = {
                ...DEFAULT_SECTION_STATE,
                ...newSections[key],
                isExpanded: false
            };
        }

        subject.next({ ...currentState, sections: newSections });
        this.queueSave(entityName);
    }

    /** @deprecated Use {@link CollapseAllSections}. */
    collapseAllSections(entityName: string, sectionKeys: string[]): void {
        return this.CollapseAllSections(entityName, sectionKeys);
    }

    /**
     * Reset state to defaults for an entity.
     * @param entityName The entity name
     */
    ResetToDefaults(entityName: string): void {
        const subject = this.getOrCreateSubject(entityName);
        subject.next({ ...DEFAULT_FORM_STATE });
        this.queueSave(entityName);
    }

    /** @deprecated Use {@link ResetToDefaults}. */
    resetToDefaults(entityName: string): void {
        return this.ResetToDefaults(entityName);
    }

    /**
     * Get the custom section order for an entity.
     * @param entityName The entity name
     * @returns Array of section keys in user's preferred order, or undefined if using default order
     */
    GetSectionOrder(entityName: string): string[] | undefined {
        return this.GetCurrentState(entityName).sectionOrder;
    }

    /** @deprecated Use {@link GetSectionOrder}. */
    getSectionOrder(entityName: string): string[] | undefined {
        return this.GetSectionOrder(entityName);
    }

    /**
     * Set the custom section order for an entity.
     * @param entityName The entity name
     * @param sectionOrder Array of section keys in the desired order
     */
    SetSectionOrder(entityName: string, sectionOrder: string[]): void {
        const subject = this.getOrCreateSubject(entityName);
        const currentState = subject.value;
        const newState: FormState = {
            ...currentState,
            sectionOrder
        };
        subject.next(newState);
        this.queueSave(entityName);
    }

    /** @deprecated Use {@link SetSectionOrder}. */
    setSectionOrder(entityName: string, sectionOrder: string[]): void {
        return this.SetSectionOrder(entityName, sectionOrder);
    }

    /**
     * Reset the section order to default (removes custom ordering).
     * @param entityName The entity name
     */
    ResetSectionOrder(entityName: string): void {
        const subject = this.getOrCreateSubject(entityName);
        const currentState = subject.value;
        const {
            sectionOrder: _order,
            moreSectionKeys: _more,
            firstClassSectionKeys: _first,
            ...stateWithoutChrome
        } = currentState;
        subject.next(stateWithoutChrome as FormState);
        this.queueSave(entityName);
    }

    /** @deprecated Use {@link ResetSectionOrder}. */
    resetSectionOrder(entityName: string): void {
        return this.ResetSectionOrder(entityName);
    }

    GetMoreSectionKeys(entityName: string): string[] | undefined {
        return this.GetCurrentState(entityName).moreSectionKeys;
    }

    /** @deprecated Use {@link GetMoreSectionKeys}. */
    getMoreSectionKeys(entityName: string): string[] | undefined {
        return this.GetMoreSectionKeys(entityName);
    }

    SetMoreSectionKeys(entityName: string, moreSectionKeys: string[]): void {
        const subject = this.getOrCreateSubject(entityName);
        subject.next({ ...subject.value, moreSectionKeys });
        this.queueSave(entityName);
    }

    /** @deprecated Use {@link SetMoreSectionKeys}. */
    setMoreSectionKeys(entityName: string, moreSectionKeys: string[]): void {
        return this.SetMoreSectionKeys(entityName, moreSectionKeys);
    }

    GetFirstClassSectionKeys(entityName: string): string[] | undefined {
        return this.GetCurrentState(entityName).firstClassSectionKeys;
    }

    /** @deprecated Use {@link GetFirstClassSectionKeys}. */
    getFirstClassSectionKeys(entityName: string): string[] | undefined {
        return this.GetFirstClassSectionKeys(entityName);
    }

    SetFirstClassSectionKeys(entityName: string, firstClassSectionKeys: string[]): void {
        const subject = this.getOrCreateSubject(entityName);
        subject.next({ ...subject.value, firstClassSectionKeys });
        this.queueSave(entityName);
    }

    /** @deprecated Use {@link SetFirstClassSectionKeys}. */
    setFirstClassSectionKeys(entityName: string, firstClassSectionKeys: string[]): void {
        return this.SetFirstClassSectionKeys(entityName, firstClassSectionKeys);
    }

    SetChromeMembership(
        entityName: string,
        moreSectionKeys: string[],
        firstClassSectionKeys: string[],
    ): void {
        const subject = this.getOrCreateSubject(entityName);
        subject.next({ ...subject.value, moreSectionKeys, firstClassSectionKeys });
        this.queueSave(entityName);
    }

    /** @deprecated Use {@link SetChromeMembership}. */
    setChromeMembership(
        entityName: string,
        moreSectionKeys: string[],
        firstClassSectionKeys: string[],
    ): void {
        return this.SetChromeMembership(entityName, moreSectionKeys, firstClassSectionKeys);
    }

    /**
     * Check if a custom section order exists for an entity.
     * @param entityName The entity name
     * @returns True if custom order exists
     */
    HasCustomSectionOrder(entityName: string): boolean {
        const order = this.GetSectionOrder(entityName);
        return order !== undefined && order.length > 0;
    }

    /** @deprecated Use {@link HasCustomSectionOrder}. */
    hasCustomSectionOrder(entityName: string): boolean {
        return this.HasCustomSectionOrder(entityName);
    }

    /**
     * Set edit mode for an entity. While in edit mode, state changes update
     * the in-memory BehaviorSubject (so the UI stays reactive) but skip
     * database persistence. When edit mode ends, a single save is queued
     * to persist the final layout state.
     * @param entityName The entity name
     * @param editing Whether the form is entering (true) or exiting (false) edit mode
     */
    SetEditMode(entityName: string, editing: boolean): void {
        if (editing) {
            this.editingEntities.add(entityName);
        } else {
            this.editingEntities.delete(entityName);
            // Persist the final state once on exit
            this.queueSave(entityName);
        }
    }

    /** @deprecated Use {@link SetEditMode}. */
    setEditMode(entityName: string, editing: boolean): void {
        return this.SetEditMode(entityName, editing);
    }

    /**
     * Get the count of expanded sections.
     * @param entityName The entity name
     * @param sectionKeys Array of section keys to check
     * @returns Number of expanded sections
     */
    GetExpandedCount(entityName: string, sectionKeys: string[]): number {
        const state = this.GetCurrentState(entityName);
        return sectionKeys.filter(key => {
            const section = state.sections[key];
            // No entry → seeded global default; entry with explicit value → that value;
            // entry with only a panelHeight (isExpanded undefined) → treat as collapsed.
            return section ? (section.isExpanded ?? false) : DEFAULT_SECTION_STATE.isExpanded;
        }).length;
    }

    /** @deprecated Use {@link GetExpandedCount}. */
    getExpandedCount(entityName: string, sectionKeys: string[]): number {
        return this.GetExpandedCount(entityName, sectionKeys);
    }

    // -------------------- Private Methods --------------------

    /**
     * Get or create the BehaviorSubject for an entity.
     */
    private getOrCreateSubject(entityName: string): BehaviorSubject<FormState> {
        let subject = this.stateCache.get(entityName);
        if (!subject) {
            subject = new BehaviorSubject<FormState>({ ...DEFAULT_FORM_STATE });
            this.stateCache.set(entityName, subject);
        }
        return subject;
    }

    /**
     * Update a single section's state.
     */
    private updateSectionState(entityName: string, sectionKey: string, updates: Partial<FormSectionState>): void {
        const subject = this.getOrCreateSubject(entityName);
        const currentState = subject.value;
        // Start from the existing entry or an EMPTY object — do NOT seed DEFAULT_SECTION_STATE.
        // Seeding it would force isExpanded:true onto a section that's only being given a
        // panelHeight, silently expanding panels the user never opened.
        const currentSection = currentState.sections[sectionKey] || {};

        const newState: FormState = {
            ...currentState,
            sections: {
                ...currentState.sections,
                [sectionKey]: {
                    ...currentSection,
                    ...updates
                }
            }
        };

        subject.next(newState);
        this.queueSave(entityName);
    }

    /**
     * Generate the User Settings key for an entity.
     */
    private getSettingKey(entityName: string): string {
        return `${SETTING_KEY_PREFIX}${entityName}`;
    }

    /**
     * Load state from User Settings using UserInfoEngine for cached access.
     */
    private async loadState(entityName: string): Promise<void> {
        try {
            const userId = this.metadata.CurrentUser?.ID;
            if (!userId) {
                return;
            }

            const settingKey = this.getSettingKey(entityName);
            const engine = UserInfoEngine.Instance;

            // Find setting from cached user settings
            const setting = engine.UserSettings.find(s => s.Setting === settingKey);

            const subject = this.getOrCreateSubject(entityName);

            if (setting?.Value) {
                const savedState = JSON.parse(setting.Value) as Partial<FormState>;
                // Merge with defaults to handle new properties. `widthModeExplicit`
                // rides along with the blob — pre-existing blobs won't have it,
                // which is the desired behavior (component defaults win).
                subject.next({ ...DEFAULT_FORM_STATE, ...savedState });
            } else {
                // No saved state, use defaults
                subject.next({ ...DEFAULT_FORM_STATE });
            }
        } catch (error) {
            console.warn(`Failed to load form state for ${entityName}:`, error);
            // Keep default state on error
        }
    }

    /**
     * Queue a debounced save using UserInfoEngine's centralized debounce.
     * Skipped when the entity is in edit mode to avoid persisting transient
     * layout changes made while editing a record.
     */
    private queueSave(entityName: string): void {
        if (this.editingEntities.has(entityName)) {
            return;
        }

        const userId = this.metadata.CurrentUser?.ID;
        if (!userId) {
            return;
        }

        const settingKey = this.getSettingKey(entityName);
        const state = this.GetCurrentState(entityName);
        UserInfoEngine.Instance.SetSettingDebounced(settingKey, JSON.stringify(state));
    }
}
