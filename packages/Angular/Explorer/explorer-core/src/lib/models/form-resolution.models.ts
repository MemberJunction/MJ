import { Type } from '@angular/core';
import { ComponentSpec } from '@memberjunction/interactivecomponents';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

/**
 * Form implementation type
 */
export type FormImplementationType = 'Interactive' | 'CodeBased' | 'Generated';

/**
 * Scope type for form registration
 */
export type FormScope = 'User' | 'Role' | 'Global';

/**
 * Result of form component resolution
 */
export interface FormResolutionResult {
    /**
     * The type of form implementation
     */
    type: FormImplementationType;

    /**
     * Component class to instantiate (for CodeBased and Generated types)
     */
    componentClass?: Type<BaseFormComponent>;

    /**
     * Component specification (for Interactive type)
     */
    componentSpec?: ComponentSpec;

    /**
     * The entity form record ID (if applicable)
     */
    entityFormId?: string;

    /**
     * The entity ID this form is for
     */
    entityId: string;

    /**
     * The entity name this form is for
     */
    entityName: string;

    /**
     * The priority of the selected form
     */
    priority?: number;

    /**
     * The scope of the selected form
     */
    scope?: FormScope;
}
