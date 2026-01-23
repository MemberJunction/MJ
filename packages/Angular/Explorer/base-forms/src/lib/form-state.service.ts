import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Metadata } from '@memberjunction/core';
import { UserSettingEntity, UserInfoEngine } from '@memberjunction/core-entities';
import { FormState, FormSectionState, DEFAULT_FORM_STATE, DEFAULT_SECTION_STATE } from './form-state.interface';

const SETTING_KEY_PREFIX = 'Form.State.';
const SAVE_DEBOUNCE_MS = 1000;

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

    /** Debounce timeouts per entity name */
    private saveTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

    /** Track which entities have been loaded from DB */
    private loadedEntities = new Set<string>();

    /** Track loading promises to prevent duplicate loads */
    private loadingPromises = new Map<string, Promise<void>>();

    private metadata = new Metadata();

    /**
     * Get the observable state for an entity.
     * Automatically loads from User Settings on first access.
     * @param entityName The entity name
     * @returns Observable of the form state
     */
    getState$(entityName: string): Observable<FormState> {
        return this.getOrCreateSubject(entityName).asObservable();
    }

    /**
     * Get the current state value for an entity.
     * @param entityName The entity name
     * @returns Current form state
     */
    getCurrentState(entityName: string): FormState {
        return this.getOrCreateSubject(entityName).value;
    }

    /**
     * Initialize state for an entity by loading from User Settings.
     * Call this when a form component initializes.
     * @param entityName The entity name
     */
    async initializeState(entityName: string): Promise<FormState> {
        // If already loaded, return current state
        if (this.loadedEntities.has(entityName)) {
            return this.getCurrentState(entityName);
        }

        // If currently loading, wait for that promise
        const existingPromise = this.loadingPromises.get(entityName);
        if (existingPromise) {
            await existingPromise;
            return this.getCurrentState(entityName);
        }

        // Start loading
        const loadPromise = this.loadState(entityName);
        this.loadingPromises.set(entityName, loadPromise);

        try {
            await loadPromise;
            this.loadedEntities.add(entityName);
            return this.getCurrentState(entityName);
        } finally {
            this.loadingPromises.delete(entityName);
        }
    }

    /**
     * Get section state, returning defaults if section doesn't exist yet.
     * @param entityName The entity name
     * @param sectionKey The section key
     * @returns Section state with defaults applied
     */
    getSectionState(entityName: string, sectionKey: string): FormSectionState {
        const state = this.getCurrentState(entityName);
        return state.sections[sectionKey] || { ...DEFAULT_SECTION_STATE };
    }

    /**
     * Check if a section is expanded.
     * @param entityName The entity name
     * @param sectionKey The section key
     * @param defaultExpanded Optional default value to use when no persisted state exists (defaults to DEFAULT_SECTION_STATE.isExpanded)
     * @returns True if expanded
     */
    isSectionExpanded(entityName: string, sectionKey: string, defaultExpanded?: boolean): boolean {
        const state = this.getCurrentState(entityName);
        const sectionState = state.sections[sectionKey];
        if (sectionState) {
            return sectionState.isExpanded;
        }
        // No persisted state - use provided default or fall back to DEFAULT_SECTION_STATE
        return defaultExpanded !== undefined ? defaultExpanded : DEFAULT_SECTION_STATE.isExpanded;
    }

    /**
     * Set section expanded state.
     * @param entityName The entity name
     * @param sectionKey The section key
     * @param isExpanded Whether the section is expanded
     */
    setSectionExpanded(entityName: string, sectionKey: string, isExpanded: boolean): void {
        this.updateSectionState(entityName, sectionKey, { isExpanded });
    }

    /**
     * Toggle section expanded state.
     * @param entityName The entity name
     * @param sectionKey The section key
     */
    toggleSection(entityName: string, sectionKey: string): void {
        const current = this.isSectionExpanded(entityName, sectionKey);
        this.setSectionExpanded(entityName, sectionKey, !current);
    }

    /**
     * Get section width mode.
     * @param entityName The entity name
     * @param sectionKey The section key
     * @returns Width mode ('normal' or 'full-width')
     */
    getSectionWidthMode(entityName: string, sectionKey: string): 'normal' | 'full-width' {
        return this.getSectionState(entityName, sectionKey).widthMode;
    }

    /**
     * Set section width mode.
     * @param entityName The entity name
     * @param sectionKey The section key
     * @param widthMode The width mode
     */
    setSectionWidthMode(entityName: string, sectionKey: string, widthMode: 'normal' | 'full-width'): void {
        this.updateSectionState(entityName, sectionKey, { widthMode });
    }

    /**
     * Toggle section width mode between normal and full-width.
     * @param entityName The entity name
     * @param sectionKey The section key
     */
    toggleSectionWidthMode(entityName: string, sectionKey: string): void {
        const current = this.getSectionWidthMode(entityName, sectionKey);
        this.setSectionWidthMode(entityName, sectionKey, current === 'normal' ? 'full-width' : 'normal');
    }

    /**
     * Get showEmptyFields preference for an entity.
     * @param entityName The entity name
     * @returns Whether to show empty fields
     */
    getShowEmptyFields(entityName: string): boolean {
        return this.getCurrentState(entityName).showEmptyFields;
    }

    /**
     * Set showEmptyFields preference for an entity.
     * @param entityName The entity name
     * @param show Whether to show empty fields
     */
    setShowEmptyFields(entityName: string, show: boolean): void {
        const subject = this.getOrCreateSubject(entityName);
        const currentState = subject.value;
        const newState: FormState = {
            ...currentState,
            showEmptyFields: show
        };
        subject.next(newState);
        this.debouncedSave(entityName);
    }

    /**
     * Expand all sections for an entity.
     * @param entityName The entity name
     * @param sectionKeys Array of all section keys to expand
     */
    expandAllSections(entityName: string, sectionKeys: string[]): void {
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
        this.debouncedSave(entityName);
    }

    /**
     * Collapse all sections for an entity.
     * @param entityName The entity name
     * @param sectionKeys Array of all section keys to collapse
     */
    collapseAllSections(entityName: string, sectionKeys: string[]): void {
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
        this.debouncedSave(entityName);
    }

    /**
     * Reset all panel widths to normal for an entity.
     * @param entityName The entity name
     */
    resetAllPanelWidths(entityName: string): void {
        const subject = this.getOrCreateSubject(entityName);
        const currentState = subject.value;
        const newSections: Record<string, FormSectionState> = {};

        for (const [key, section] of Object.entries(currentState.sections)) {
            newSections[key] = { ...section, widthMode: 'normal' };
        }

        subject.next({ ...currentState, sections: newSections });
        this.debouncedSave(entityName);
    }

    /**
     * Reset state to defaults for an entity.
     * @param entityName The entity name
     */
    resetToDefaults(entityName: string): void {
        const subject = this.getOrCreateSubject(entityName);
        subject.next({ ...DEFAULT_FORM_STATE });
        this.debouncedSave(entityName);
    }

    /**
     * Get the count of expanded sections.
     * @param entityName The entity name
     * @param sectionKeys Array of section keys to check
     * @returns Number of expanded sections
     */
    getExpandedCount(entityName: string, sectionKeys: string[]): number {
        const state = this.getCurrentState(entityName);
        return sectionKeys.filter(key => {
            const section = state.sections[key];
            return section ? section.isExpanded : DEFAULT_SECTION_STATE.isExpanded;
        }).length;
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
        const currentSection = currentState.sections[sectionKey] || { ...DEFAULT_SECTION_STATE };

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
        this.debouncedSave(entityName);
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
                // Merge with defaults to handle new properties
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
     * Debounced save to avoid too many writes.
     */
    private debouncedSave(entityName: string): void {
        const existingTimeout = this.saveTimeouts.get(entityName);
        if (existingTimeout) {
            clearTimeout(existingTimeout);
        }

        const timeout = setTimeout(() => {
            this.saveState(entityName);
            this.saveTimeouts.delete(entityName);
        }, SAVE_DEBOUNCE_MS);

        this.saveTimeouts.set(entityName, timeout);
    }

    /**
     * Save state to User Settings using UserInfoEngine for cached lookup.
     */
    private async saveState(entityName: string): Promise<void> {
        try {
            const userId = this.metadata.CurrentUser?.ID;
            if (!userId) {
                return;
            }

            const settingKey = this.getSettingKey(entityName);
            const state = this.getCurrentState(entityName);
            const md = new Metadata();
            const engine = UserInfoEngine.Instance;

            // Find existing setting from cached user settings
            let setting = engine.UserSettings.find(s => s.Setting === settingKey);

            if (!setting) {
                // Create new setting if not found
                setting = await md.GetEntityObject<UserSettingEntity>('MJ: User Settings');
                setting.UserID = userId;
                setting.Setting = settingKey;
            }

            setting.Value = JSON.stringify(state);
            await setting.Save();
        } catch (error) {
            console.warn(`Failed to save form state for ${entityName}:`, error);
        }
    }
}
