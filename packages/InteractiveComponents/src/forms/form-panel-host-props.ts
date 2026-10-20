import type { FormHostProps } from './form-host-props';
import type { FormContributionPresentation, FormContributionSlot } from './form-contribution-spec';

/** Identity + configuration of the contribution this panel instance renders. */
export interface FormPanelContributionContext {
    key: string;
    slot: FormContributionSlot;
    title: string;
    presentation: FormContributionPresentation;
    configuration: Record<string, unknown>;
}

/** Present only when the panel claims a related-entity grid. */
export interface FormPanelRelatedContext {
    entityName: string;
    joinField?: string;
    /** Prebuilt by the host from BaseFormComponent.BuildRelationshipViewParamsByEntityName — includes join.any OR filters. */
    viewParams: { EntityName: string; ExtraFilter: string; OrderBy?: string };
    /** From BaseFormComponent.NewRecordValues so a "New" action pre-links the child to this record. */
    newRecordValues: Record<string, unknown>;
}

/**
 * Props the host (`InteractiveFormPanelComponent`) passes to a `componentRole: 'form-panel'`
 * component. Extends the whole-form props: the panel sees the same record snapshot,
 * metadata, mode and permissions, plus its own registration context.
 */
export interface FormPanelHostProps extends FormHostProps {
    contribution: FormPanelContributionContext;
    related?: FormPanelRelatedContext;
    /** Section expanded state (accordion) or "is the active rail group" (left-nav). Defer loads while false. */
    isExpanded: boolean;
    layout: 'accordion' | 'left-nav';
}
