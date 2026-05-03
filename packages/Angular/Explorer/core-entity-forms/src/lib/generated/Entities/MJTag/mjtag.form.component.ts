import { Component } from '@angular/core';
import { MJTagEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Tags') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtag-form',
    templateUrl: './mjtag.form.component.html'
})
export class MJTagFormComponent extends BaseFormComponent {
    public record!: MJTagEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'tagBasics', sectionName: 'Tag Basics', isExpanded: true },
            { sectionKey: 'tagHierarchy', sectionName: 'Tag Hierarchy', isExpanded: true },
            { sectionKey: 'tagLifecycle', sectionName: 'Tag Lifecycle', isExpanded: false },
            { sectionKey: 'tagConfiguration', sectionName: 'Tag Configuration', isExpanded: false },
            { sectionKey: 'aIIntelligence', sectionName: 'AI Intelligence', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJTagsParentID', sectionName: 'Tags', isExpanded: false },
            { sectionKey: 'mJTaggedItems', sectionName: 'Tagged Items', isExpanded: false },
            { sectionKey: 'mJTagCoOccurrencesTagBID', sectionName: 'Tag Co Occurrences (Tag B ID)', isExpanded: false },
            { sectionKey: 'mJContentItemTags', sectionName: 'Content Item Tags', isExpanded: false },
            { sectionKey: 'mJTagSynonyms', sectionName: 'Tag Synonyms', isExpanded: false },
            { sectionKey: 'mJTagAuditLogsRelatedTagID', sectionName: 'Tag Audit Logs (Related Tag)', isExpanded: false },
            { sectionKey: 'mJTagCoOccurrencesTagAID', sectionName: 'Tag Co Occurrences (Tag A ID)', isExpanded: false },
            { sectionKey: 'mJTagScopes', sectionName: 'Tag Scopes', isExpanded: false },
            { sectionKey: 'mJTagSuggestionsProposedParentID', sectionName: 'Tag Suggestions (Proposed Parent)', isExpanded: false },
            { sectionKey: 'mJTagAuditLogsTagID', sectionName: 'Tag Audit Logs (Tag)', isExpanded: false },
            { sectionKey: 'mJTagsMergedIntoTagID', sectionName: 'Tags (Merged Into)', isExpanded: false },
            { sectionKey: 'mJTagSuggestionsBestMatchTagID', sectionName: 'Tag Suggestions (Best Match Tag)', isExpanded: false },
            { sectionKey: 'mJTagSuggestionsResolvedTagID', sectionName: 'Tag Suggestions (Resolved Tag)', isExpanded: false }
        ]);
    }
}

