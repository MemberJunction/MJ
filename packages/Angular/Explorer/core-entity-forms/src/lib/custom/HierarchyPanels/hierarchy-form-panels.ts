import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel, BaseFormsModule } from '@memberjunction/ng-base-forms';
import { HierarchyTreeComponent, HierarchyTreeConfig } from '@memberjunction/ng-hierarchy-tree';
import {
    MJAIAgentCategoryEntity,
    MJAIPromptCategoryEntity,
    MJActionCategoryEntity,
    MJDashboardCategoryEntity,
    MJQueryCategoryEntity,
    MJTagEntity,
    MJProjectEntity,
    MJContentItemEntity,
    MJFileCategoryEntity,
    MJListCategoryEntity,
    MJRecordProcessCategoryEntity,
    MJSkillEntity,
    MJTemplateCategoryEntity,
    MJTestSuiteEntity,
    MJUserViewCategoryEntity
} from '@memberjunction/core-entities';

// ============================================================================
// 1. AI Agent Categories
// ============================================================================
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:AI Agent Categories:hierarchy',
    metadata: {
        entity: 'AI Agent Categories',
        slot: 'after-related',
        sortKey: 50,
        relatedEntity: 'AI Agent Categories',
        relatedJoinField: 'ParentID'
    }
})
@Component({
    selector: 'mj-ai-agent-category-hierarchy-panel',
    standalone: true,
    imports: [CommonModule, BaseFormsModule, HierarchyTreeComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <mj-collapsible-panel
            SectionKey="agentCategoryHierarchy"
            SectionName="Agent Category Hierarchy & Taxonomy"
            Icon="fa-solid fa-sitemap"
            Variant="related-entity"
            [Form]="FormComponent"
            [FormContext]="FormContext"
            [DefaultExpanded]="true">
            @if (Record.IsSaved) {
                <mj-hierarchy-tree
                    [Config]="treeConfig"
                    (Navigate)="FormComponent.OnFormNavigate($event)">
                </mj-hierarchy-tree>
            }
        </mj-collapsible-panel>
    `,
    styles: [`:host { display: block; width: 100%; margin-bottom: 20px; }`]
})
export class AIAgentCategoryHierarchyPanel extends BaseFormPanel<MJAIAgentCategoryEntity> {
    public get treeConfig(): HierarchyTreeConfig {
        return {
            EntityName: 'AI Agent Categories',
            ParentField: 'ParentID',
            SubtitleField: 'Description',
            DefaultIcon: 'fa-solid fa-robot',
            DefaultColor: '#8b5cf6',
            FocusRecordID: this.Record?.ID || undefined,
            Height: '440px',
            ShowSearch: true,
            ShowToolbar: true
        };
    }
}

// ============================================================================
// 2. AI Prompt Categories
// ============================================================================
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:AI Prompt Categories:hierarchy',
    metadata: {
        entity: 'AI Prompt Categories',
        slot: 'after-related',
        sortKey: 50,
        relatedEntity: 'AI Prompt Categories',
        relatedJoinField: 'ParentID'
    }
})
@Component({
    selector: 'mj-ai-prompt-category-hierarchy-panel',
    standalone: true,
    imports: [CommonModule, BaseFormsModule, HierarchyTreeComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <mj-collapsible-panel
            SectionKey="promptCategoryHierarchy"
            SectionName="Prompt Category Hierarchy"
            Icon="fa-solid fa-sitemap"
            Variant="related-entity"
            [Form]="FormComponent"
            [FormContext]="FormContext"
            [DefaultExpanded]="true">
            @if (Record.IsSaved) {
                <mj-hierarchy-tree
                    [Config]="treeConfig"
                    (Navigate)="FormComponent.OnFormNavigate($event)">
                </mj-hierarchy-tree>
            }
        </mj-collapsible-panel>
    `,
    styles: [`:host { display: block; width: 100%; margin-bottom: 20px; }`]
})
export class AIPromptCategoryHierarchyPanel extends BaseFormPanel<MJAIPromptCategoryEntity> {
    public get treeConfig(): HierarchyTreeConfig {
        return {
            EntityName: 'AI Prompt Categories',
            ParentField: 'ParentID',
            SubtitleField: 'Description',
            DefaultIcon: 'fa-solid fa-wand-magic-sparkles',
            DefaultColor: '#ec4899',
            FocusRecordID: this.Record?.ID || undefined,
            Height: '440px',
            ShowSearch: true,
            ShowToolbar: true
        };
    }
}

// ============================================================================
// 3. Action Categories
// ============================================================================
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:Action Categories:hierarchy',
    metadata: {
        entity: 'Action Categories',
        slot: 'after-related',
        sortKey: 50,
        relatedEntity: 'Action Categories',
        relatedJoinField: 'ParentID'
    }
})
@Component({
    selector: 'mj-action-category-hierarchy-panel',
    standalone: true,
    imports: [CommonModule, BaseFormsModule, HierarchyTreeComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <mj-collapsible-panel
            SectionKey="actionCategoryHierarchy"
            SectionName="Action Category Taxonomy"
            Icon="fa-solid fa-sitemap"
            Variant="related-entity"
            [Form]="FormComponent"
            [FormContext]="FormContext"
            [DefaultExpanded]="true">
            @if (Record.IsSaved) {
                <mj-hierarchy-tree
                    [Config]="treeConfig"
                    (Navigate)="FormComponent.OnFormNavigate($event)">
                </mj-hierarchy-tree>
            }
        </mj-collapsible-panel>
    `,
    styles: [`:host { display: block; width: 100%; margin-bottom: 20px; }`]
})
export class ActionCategoryHierarchyPanel extends BaseFormPanel<MJActionCategoryEntity> {
    public get treeConfig(): HierarchyTreeConfig {
        return {
            EntityName: 'Action Categories',
            ParentField: 'ParentID',
            SubtitleField: 'Description',
            DefaultIcon: 'fa-solid fa-bolt',
            DefaultColor: '#f59e0b',
            FocusRecordID: this.Record?.ID || undefined,
            Height: '440px',
            ShowSearch: true,
            ShowToolbar: true
        };
    }
}

// ============================================================================
// 4. Dashboard Categories
// ============================================================================
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:Dashboard Categories:hierarchy',
    metadata: {
        entity: 'Dashboard Categories',
        slot: 'after-related',
        sortKey: 50,
        relatedEntity: 'Dashboard Categories',
        relatedJoinField: 'ParentID'
    }
})
@Component({
    selector: 'mj-dashboard-category-hierarchy-panel',
    standalone: true,
    imports: [CommonModule, BaseFormsModule, HierarchyTreeComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <mj-collapsible-panel
            SectionKey="dashboardCategoryHierarchy"
            SectionName="Dashboard Category Hierarchy"
            Icon="fa-solid fa-sitemap"
            Variant="related-entity"
            [Form]="FormComponent"
            [FormContext]="FormContext"
            [DefaultExpanded]="true">
            @if (Record.IsSaved) {
                <mj-hierarchy-tree
                    [Config]="treeConfig"
                    (Navigate)="FormComponent.OnFormNavigate($event)">
                </mj-hierarchy-tree>
            }
        </mj-collapsible-panel>
    `,
    styles: [`:host { display: block; width: 100%; margin-bottom: 20px; }`]
})
export class DashboardCategoryHierarchyPanel extends BaseFormPanel<MJDashboardCategoryEntity> {
    public get treeConfig(): HierarchyTreeConfig {
        return {
            EntityName: 'Dashboard Categories',
            ParentField: 'ParentID',
            SubtitleField: 'Description',
            DefaultIcon: 'fa-solid fa-chart-pie',
            DefaultColor: '#3b82f6',
            FocusRecordID: this.Record?.ID || undefined,
            Height: '440px',
            ShowSearch: true,
            ShowToolbar: true
        };
    }
}

// ============================================================================
// 5. Query Categories
// ============================================================================
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:Query Categories:hierarchy',
    metadata: {
        entity: 'Query Categories',
        slot: 'after-related',
        sortKey: 50,
        relatedEntity: 'Query Categories',
        relatedJoinField: 'ParentCategoryID'
    }
})
@Component({
    selector: 'mj-query-category-hierarchy-panel',
    standalone: true,
    imports: [CommonModule, BaseFormsModule, HierarchyTreeComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <mj-collapsible-panel
            SectionKey="queryCategoryHierarchy"
            SectionName="Query Category Taxonomy"
            Icon="fa-solid fa-sitemap"
            Variant="related-entity"
            [Form]="FormComponent"
            [FormContext]="FormContext"
            [DefaultExpanded]="true">
            @if (Record.IsSaved) {
                <mj-hierarchy-tree
                    [Config]="treeConfig"
                    (Navigate)="FormComponent.OnFormNavigate($event)">
                </mj-hierarchy-tree>
            }
        </mj-collapsible-panel>
    `,
    styles: [`:host { display: block; width: 100%; margin-bottom: 20px; }`]
})
export class QueryCategoryHierarchyPanel extends BaseFormPanel<MJQueryCategoryEntity> {
    public get treeConfig(): HierarchyTreeConfig {
        return {
            EntityName: 'Query Categories',
            ParentField: 'ParentCategoryID',
            SubtitleField: 'Description',
            DefaultIcon: 'fa-solid fa-database',
            DefaultColor: '#06b6d4',
            FocusRecordID: this.Record?.ID || undefined,
            Height: '440px',
            ShowSearch: true,
            ShowToolbar: true
        };
    }
}

// ============================================================================
// 6. Tags (Self-Referencing Tag Taxonomy)
// ============================================================================
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:Tags:hierarchy',
    metadata: {
        entity: 'Tags',
        slot: 'after-related',
        sortKey: 50,
        relatedEntity: 'Tags',
        relatedJoinField: 'ParentID'
    }
})
@Component({
    selector: 'mj-tag-hierarchy-panel',
    standalone: true,
    imports: [CommonModule, BaseFormsModule, HierarchyTreeComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <mj-collapsible-panel
            SectionKey="tagHierarchy"
            SectionName="Tag Taxonomy Tree"
            Icon="fa-solid fa-tags"
            Variant="related-entity"
            [Form]="FormComponent"
            [FormContext]="FormContext"
            [DefaultExpanded]="true">
            @if (Record.IsSaved) {
                <mj-hierarchy-tree
                    [Config]="treeConfig"
                    (Navigate)="FormComponent.OnFormNavigate($event)">
                </mj-hierarchy-tree>
            }
        </mj-collapsible-panel>
    `,
    styles: [`:host { display: block; width: 100%; margin-bottom: 20px; }`]
})
export class TagHierarchyPanel extends BaseFormPanel<MJTagEntity> {
    public get treeConfig(): HierarchyTreeConfig {
        return {
            EntityName: 'Tags',
            ParentField: 'ParentID',
            SubtitleField: 'Description',
            DefaultIcon: 'fa-solid fa-tag',
            DefaultColor: '#14b8a6',
            FocusRecordID: this.Record?.ID || undefined,
            Height: '440px',
            ShowSearch: true,
            ShowToolbar: true
        };
    }
}

// ============================================================================
// 8. Projects (Portfolio -> Program -> Project Hierarchy)
// ============================================================================
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:Projects:hierarchy',
    metadata: {
        entity: 'Projects',
        slot: 'after-related',
        sortKey: 50,
        relatedEntity: 'Projects',
        relatedJoinField: 'ParentID'
    }
})
@Component({
    selector: 'mj-project-hierarchy-panel',
    standalone: true,
    imports: [CommonModule, BaseFormsModule, HierarchyTreeComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <mj-collapsible-panel
            SectionKey="projectHierarchy"
            SectionName="Project Structure & Work Breakdown"
            Icon="fa-solid fa-diagram-project"
            Variant="related-entity"
            [Form]="FormComponent"
            [FormContext]="FormContext"
            [DefaultExpanded]="true">
            @if (Record.IsSaved) {
                <mj-hierarchy-tree
                    [Config]="treeConfig"
                    (Navigate)="FormComponent.OnFormNavigate($event)">
                </mj-hierarchy-tree>
            }
        </mj-collapsible-panel>
    `,
    styles: [`:host { display: block; width: 100%; margin-bottom: 20px; }`]
})
export class ProjectHierarchyPanel extends BaseFormPanel<MJProjectEntity> {
    public get treeConfig(): HierarchyTreeConfig {
        return {
            EntityName: 'Projects',
            ParentField: 'ParentID',
            SubtitleField: 'Status',
            DefaultIcon: 'fa-solid fa-diagram-project',
            DefaultColor: '#6366f1',
            FocusRecordID: this.Record?.ID || undefined,
            Height: '440px',
            ShowSearch: true,
            ShowToolbar: true
        };
    }
}

// ============================================================================
// 9. Content Items (Knowledge Base / Documentation Tree)
// ============================================================================
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:Content Items:hierarchy',
    metadata: {
        entity: 'Content Items',
        slot: 'after-related',
        sortKey: 50,
        relatedEntity: 'Content Items',
        relatedJoinField: 'ParentID'
    }
})
@Component({
    selector: 'mj-content-item-hierarchy-panel',
    standalone: true,
    imports: [CommonModule, BaseFormsModule, HierarchyTreeComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <mj-collapsible-panel
            SectionKey="contentItemHierarchy"
            SectionName="Content Hierarchy & Structure"
            Icon="fa-solid fa-book-bookmark"
            Variant="related-entity"
            [Form]="FormComponent"
            [FormContext]="FormContext"
            [DefaultExpanded]="true">
            @if (Record.IsSaved) {
                <mj-hierarchy-tree
                    [Config]="treeConfig"
                    (Navigate)="FormComponent.OnFormNavigate($event)">
                </mj-hierarchy-tree>
            }
        </mj-collapsible-panel>
    `,
    styles: [`:host { display: block; width: 100%; margin-bottom: 20px; }`]
})
export class ContentItemHierarchyPanel extends BaseFormPanel<MJContentItemEntity> {
    public get treeConfig(): HierarchyTreeConfig {
        return {
            EntityName: 'Content Items',
            ParentField: 'ParentID',
            SubtitleField: 'ContentType',
            DefaultIcon: 'fa-solid fa-file-lines',
            DefaultColor: '#0ea5e9',
            FocusRecordID: this.Record?.ID || undefined,
            Height: '440px',
            ShowSearch: true,
            ShowToolbar: true
        };
    }
}

// ============================================================================
// 10. File Categories (Folder Directory Tree)
// ============================================================================
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:File Categories:hierarchy',
    metadata: {
        entity: 'File Categories',
        slot: 'after-related',
        sortKey: 50,
        relatedEntity: 'File Categories',
        relatedJoinField: 'ParentID'
    }
})
@Component({
    selector: 'mj-file-category-hierarchy-panel',
    standalone: true,
    imports: [CommonModule, BaseFormsModule, HierarchyTreeComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <mj-collapsible-panel
            SectionKey="fileCategoryHierarchy"
            SectionName="Folder Directory Hierarchy"
            Icon="fa-solid fa-folder-tree"
            Variant="related-entity"
            [Form]="FormComponent"
            [FormContext]="FormContext"
            [DefaultExpanded]="true">
            @if (Record.IsSaved) {
                <mj-hierarchy-tree
                    [Config]="treeConfig"
                    (Navigate)="FormComponent.OnFormNavigate($event)">
                </mj-hierarchy-tree>
            }
        </mj-collapsible-panel>
    `,
    styles: [`:host { display: block; width: 100%; margin-bottom: 20px; }`]
})
export class FileCategoryHierarchyPanel extends BaseFormPanel<MJFileCategoryEntity> {
    public get treeConfig(): HierarchyTreeConfig {
        return {
            EntityName: 'File Categories',
            ParentField: 'ParentID',
            SubtitleField: 'Description',
            DefaultIcon: 'fa-solid fa-folder-open',
            DefaultColor: '#eab308',
            FocusRecordID: this.Record?.ID || undefined,
            Height: '440px',
            ShowSearch: true,
            ShowToolbar: true
        };
    }
}

// ============================================================================
// 11. List Categories
// ============================================================================
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:List Categories:hierarchy',
    metadata: {
        entity: 'List Categories',
        slot: 'after-related',
        sortKey: 50,
        relatedEntity: 'List Categories',
        relatedJoinField: 'ParentID'
    }
})
@Component({
    selector: 'mj-list-category-hierarchy-panel',
    standalone: true,
    imports: [CommonModule, BaseFormsModule, HierarchyTreeComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <mj-collapsible-panel
            SectionKey="listCategoryHierarchy"
            SectionName="List Category Hierarchy"
            Icon="fa-solid fa-list-check"
            Variant="related-entity"
            [Form]="FormComponent"
            [FormContext]="FormContext"
            [DefaultExpanded]="true">
            @if (Record.IsSaved) {
                <mj-hierarchy-tree
                    [Config]="treeConfig"
                    (Navigate)="FormComponent.OnFormNavigate($event)">
                </mj-hierarchy-tree>
            }
        </mj-collapsible-panel>
    `,
    styles: [`:host { display: block; width: 100%; margin-bottom: 20px; }`]
})
export class ListCategoryHierarchyPanel extends BaseFormPanel<MJListCategoryEntity> {
    public get treeConfig(): HierarchyTreeConfig {
        return {
            EntityName: 'List Categories',
            ParentField: 'ParentID',
            SubtitleField: 'Description',
            DefaultIcon: 'fa-solid fa-table-list',
            DefaultColor: '#0284c7',
            FocusRecordID: this.Record?.ID || undefined,
            Height: '440px',
            ShowSearch: true,
            ShowToolbar: true
        };
    }
}

// ============================================================================
// 12. Record Process Categories
// ============================================================================
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:Record Process Categories:hierarchy',
    metadata: {
        entity: 'Record Process Categories',
        slot: 'after-related',
        sortKey: 50,
        relatedEntity: 'Record Process Categories',
        relatedJoinField: 'ParentID'
    }
})
@Component({
    selector: 'mj-record-process-category-hierarchy-panel',
    standalone: true,
    imports: [CommonModule, BaseFormsModule, HierarchyTreeComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <mj-collapsible-panel
            SectionKey="recordProcessCategoryHierarchy"
            SectionName="Process Pipeline Category Hierarchy"
            Icon="fa-solid fa-arrows-split-up-and-left"
            Variant="related-entity"
            [Form]="FormComponent"
            [FormContext]="FormContext"
            [DefaultExpanded]="true">
            @if (Record.IsSaved) {
                <mj-hierarchy-tree
                    [Config]="treeConfig"
                    (Navigate)="FormComponent.OnFormNavigate($event)">
                </mj-hierarchy-tree>
            }
        </mj-collapsible-panel>
    `,
    styles: [`:host { display: block; width: 100%; margin-bottom: 20px; }`]
})
export class RecordProcessCategoryHierarchyPanel extends BaseFormPanel<MJRecordProcessCategoryEntity> {
    public get treeConfig(): HierarchyTreeConfig {
        return {
            EntityName: 'Record Process Categories',
            ParentField: 'ParentID',
            SubtitleField: 'Description',
            DefaultIcon: 'fa-solid fa-diagram-next',
            DefaultColor: '#a855f7',
            FocusRecordID: this.Record?.ID || undefined,
            Height: '440px',
            ShowSearch: true,
            ShowToolbar: true
        };
    }
}

// ============================================================================
// 13. Skills (AI Agent Skill Hierarchy)
// ============================================================================
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:Skills:hierarchy',
    metadata: {
        entity: 'Skills',
        slot: 'after-related',
        sortKey: 50,
        relatedEntity: 'Skills',
        relatedJoinField: 'ParentID'
    }
})
@Component({
    selector: 'mj-skill-hierarchy-panel',
    standalone: true,
    imports: [CommonModule, BaseFormsModule, HierarchyTreeComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <mj-collapsible-panel
            SectionKey="skillHierarchy"
            SectionName="Skill Taxonomy & Decomposition"
            Icon="fa-solid fa-brain"
            Variant="related-entity"
            [Form]="FormComponent"
            [FormContext]="FormContext"
            [DefaultExpanded]="true">
            @if (Record.IsSaved) {
                <mj-hierarchy-tree
                    [Config]="treeConfig"
                    (Navigate)="FormComponent.OnFormNavigate($event)">
                </mj-hierarchy-tree>
            }
        </mj-collapsible-panel>
    `,
    styles: [`:host { display: block; width: 100%; margin-bottom: 20px; }`]
})
export class SkillHierarchyPanel extends BaseFormPanel<MJSkillEntity> {
    public get treeConfig(): HierarchyTreeConfig {
        return {
            EntityName: 'Skills',
            ParentField: 'ParentID',
            SubtitleField: 'Description',
            DefaultIcon: 'fa-solid fa-wand-magic',
            DefaultColor: '#f43f5e',
            FocusRecordID: this.Record?.ID || undefined,
            Height: '440px',
            ShowSearch: true,
            ShowToolbar: true
        };
    }
}

// ============================================================================
// 14. Template Categories
// ============================================================================
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:Template Categories:hierarchy',
    metadata: {
        entity: 'Template Categories',
        slot: 'after-related',
        sortKey: 50,
        relatedEntity: 'Template Categories',
        relatedJoinField: 'ParentID'
    }
})
@Component({
    selector: 'mj-template-category-hierarchy-panel',
    standalone: true,
    imports: [CommonModule, BaseFormsModule, HierarchyTreeComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <mj-collapsible-panel
            SectionKey="templateCategoryHierarchy"
            SectionName="Template Category Hierarchy"
            Icon="fa-solid fa-file-lines"
            Variant="related-entity"
            [Form]="FormComponent"
            [FormContext]="FormContext"
            [DefaultExpanded]="true">
            @if (Record.IsSaved) {
                <mj-hierarchy-tree
                    [Config]="treeConfig"
                    (Navigate)="FormComponent.OnFormNavigate($event)">
                </mj-hierarchy-tree>
            }
        </mj-collapsible-panel>
    `,
    styles: [`:host { display: block; width: 100%; margin-bottom: 20px; }`]
})
export class TemplateCategoryHierarchyPanel extends BaseFormPanel<MJTemplateCategoryEntity> {
    public get treeConfig(): HierarchyTreeConfig {
        return {
            EntityName: 'Template Categories',
            ParentField: 'ParentID',
            SubtitleField: 'Description',
            DefaultIcon: 'fa-solid fa-folder-open',
            DefaultColor: '#64748b',
            FocusRecordID: this.Record?.ID || undefined,
            Height: '440px',
            ShowSearch: true,
            ShowToolbar: true
        };
    }
}

// ============================================================================
// 15. Test Suites (Nested Automated Test Suites)
// ============================================================================
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:Test Suites:hierarchy',
    metadata: {
        entity: 'Test Suites',
        slot: 'after-related',
        sortKey: 50,
        relatedEntity: 'Test Suites',
        relatedJoinField: 'ParentID'
    }
})
@Component({
    selector: 'mj-test-suite-hierarchy-panel',
    standalone: true,
    imports: [CommonModule, BaseFormsModule, HierarchyTreeComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <mj-collapsible-panel
            SectionKey="testSuiteHierarchy"
            SectionName="Test Suite Hierarchy & Sub-Suites"
            Icon="fa-solid fa-vial-circle-check"
            Variant="related-entity"
            [Form]="FormComponent"
            [FormContext]="FormContext"
            [DefaultExpanded]="true">
            @if (Record.IsSaved) {
                <mj-hierarchy-tree
                    [Config]="treeConfig"
                    (Navigate)="FormComponent.OnFormNavigate($event)">
                </mj-hierarchy-tree>
            }
        </mj-collapsible-panel>
    `,
    styles: [`:host { display: block; width: 100%; margin-bottom: 20px; }`]
})
export class TestSuiteHierarchyPanel extends BaseFormPanel<MJTestSuiteEntity> {
    public get treeConfig(): HierarchyTreeConfig {
        return {
            EntityName: 'Test Suites',
            ParentField: 'ParentID',
            SubtitleField: 'Description',
            DefaultIcon: 'fa-solid fa-vial',
            DefaultColor: '#22c55e',
            FocusRecordID: this.Record?.ID || undefined,
            Height: '440px',
            ShowSearch: true,
            ShowToolbar: true
        };
    }
}

// ============================================================================
// 16. User View Categories (Saved Views Directory Hierarchy)
// ============================================================================
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:User View Categories:hierarchy',
    metadata: {
        entity: 'User View Categories',
        slot: 'after-related',
        sortKey: 50,
        relatedEntity: 'User View Categories',
        relatedJoinField: 'ParentID'
    }
})
@Component({
    selector: 'mj-user-view-category-hierarchy-panel',
    standalone: true,
    imports: [CommonModule, BaseFormsModule, HierarchyTreeComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <mj-collapsible-panel
            SectionKey="userViewCategoryHierarchy"
            SectionName="View Category Directory Hierarchy"
            Icon="fa-solid fa-table-cells-large"
            Variant="related-entity"
            [Form]="FormComponent"
            [FormContext]="FormContext"
            [DefaultExpanded]="true">
            @if (Record.IsSaved) {
                <mj-hierarchy-tree
                    [Config]="treeConfig"
                    (Navigate)="FormComponent.OnFormNavigate($event)">
                </mj-hierarchy-tree>
            }
        </mj-collapsible-panel>
    `,
    styles: [`:host { display: block; width: 100%; margin-bottom: 20px; }`]
})
export class UserViewCategoryHierarchyPanel extends BaseFormPanel<MJUserViewCategoryEntity> {
    public get treeConfig(): HierarchyTreeConfig {
        return {
            EntityName: 'User View Categories',
            ParentField: 'ParentID',
            SubtitleField: 'Description',
            DefaultIcon: 'fa-solid fa-folder-tree',
            DefaultColor: '#38bdf8',
            FocusRecordID: this.Record?.ID || undefined,
            Height: '440px',
            ShowSearch: true,
            ShowToolbar: true
        };
    }
}

/** Array of all Core Hierarchy Form Panels for module imports/exports. */
export const HIERARCHY_FORM_PANELS = [
    AIAgentCategoryHierarchyPanel,
    AIPromptCategoryHierarchyPanel,
    ActionCategoryHierarchyPanel,
    DashboardCategoryHierarchyPanel,
    QueryCategoryHierarchyPanel,
    TagHierarchyPanel,
    ProjectHierarchyPanel,
    ContentItemHierarchyPanel,
    FileCategoryHierarchyPanel,
    ListCategoryHierarchyPanel,
    RecordProcessCategoryHierarchyPanel,
    SkillHierarchyPanel,
    TemplateCategoryHierarchyPanel,
    TestSuiteHierarchyPanel,
    UserViewCategoryHierarchyPanel
];
