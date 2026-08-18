import { Component, ChangeDetectionStrategy, Directive } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseEntity } from '@memberjunction/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel, BaseFormsModule, FormNavigationEvent } from '@memberjunction/ng-base-forms';
import { HierarchyTreeComponent, HierarchyTreeConfig } from '@memberjunction/ng-hierarchy-tree';
import {
    UserInfoEngine,
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

/**
 * Base class for hierarchy form panels providing shared height, zoom persistence via UserInfoEngine,
 * and unified navigation event handling.
 */
@Directive()
export abstract class BaseHierarchyFormPanel<TRecord extends BaseEntity> extends BaseFormPanel<TRecord> {
    private _cachedTreeConfig: HierarchyTreeConfig | null = null;
    private _cachedRecordId: string | null = null;

    public get treeConfig(): HierarchyTreeConfig {
        const recId = this.Record?.PrimaryKey ? this.Record.PrimaryKey.ToString() : null;
        if (!this._cachedTreeConfig || this._cachedRecordId !== recId) {
            this._cachedRecordId = recId;
            this._cachedTreeConfig = this.buildTreeConfig();
        }
        return this._cachedTreeConfig;
    }

    protected abstract buildTreeConfig(): HierarchyTreeConfig;

    protected get settingKey(): string {
        const entityName = this.Record?.EntityInfo?.Name || this.treeConfig.EntityName || 'default';
        const sanitized = entityName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        return `mj.hierarchyTree.zoom.${sanitized}`;
    }

    public get persistedZoomLevel(): number | undefined {
        const raw = UserInfoEngine.Instance.GetSetting(this.settingKey);
        return raw ? parseFloat(raw) : undefined;
    }

    public onZoomChange(zoom: number): void {
        UserInfoEngine.Instance.SetSettingDebounced(this.settingKey, zoom.toFixed(2));
    }

    public onNavigate(event: FormNavigationEvent): void {
        if (this.FormComponent?.OnFormNavigate) {
            this.FormComponent.OnFormNavigate(event);
        }
    }
}

// ============================================================================
// 1. AI Agent Categories
// ============================================================================
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:AI Agent Categories:hierarchy',
    metadata: {
        entity: 'MJ: AI Agent Categories',
        slot: 'after-related',
        sortKey: 50,
        relatedEntity: 'MJ: AI Agent Categories',
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
            SectionName="Hierarchy"
            Icon="fa-solid fa-sitemap"
            Variant="related-entity"
            [Form]="FormComponent"
            [FormContext]="FormContext"
            [DefaultExpanded]="true">
            @if (Record.IsSaved) {
                <mj-hierarchy-tree
                    [Config]="treeConfig"
                    [ZoomLevel]="persistedZoomLevel"
                    (ZoomChange)="onZoomChange($event)"
                    (Navigate)="onNavigate($event)">
                </mj-hierarchy-tree>
            }
        </mj-collapsible-panel>
    `,
    styles: [`:host { display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 640px; min-height: calc(100vh - 280px); flex: 1; margin-bottom: 20px; }`]
})
export class AIAgentCategoryHierarchyPanel extends BaseHierarchyFormPanel<MJAIAgentCategoryEntity> {
    protected buildTreeConfig(): HierarchyTreeConfig {
        return {
            EntityName: 'MJ: AI Agent Categories',
            ParentField: 'ParentID',
            SubtitleField: 'Description',
            DefaultIcon: 'fa-solid fa-robot',
            DefaultColor: '#8b5cf6',
            ActiveRecordID: this.Record?.ID || undefined,
            Height: '100%',
            MinHeight: '640px',
            ShowSearch: true,
            ShowToolbar: true,
            NavigateOnNodeClick: true
        };
    }
}

// ============================================================================
// 2. AI Prompt Categories
// ============================================================================
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:AI Prompt Categories:hierarchy',
    metadata: {
        entity: 'MJ: AI Prompt Categories',
        slot: 'after-related',
        sortKey: 50,
        relatedEntity: 'MJ: AI Prompt Categories',
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
            SectionName="Hierarchy"
            Icon="fa-solid fa-sitemap"
            Variant="related-entity"
            [Form]="FormComponent"
            [FormContext]="FormContext"
            [DefaultExpanded]="true">
            @if (Record.IsSaved) {
                <mj-hierarchy-tree
                    [Config]="treeConfig"
                    [ZoomLevel]="persistedZoomLevel"
                    (ZoomChange)="onZoomChange($event)"
                    (Navigate)="onNavigate($event)">
                </mj-hierarchy-tree>
            }
        </mj-collapsible-panel>
    `,
    styles: [`:host { display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 640px; min-height: calc(100vh - 280px); flex: 1; margin-bottom: 20px; }`]
})
export class AIPromptCategoryHierarchyPanel extends BaseHierarchyFormPanel<MJAIPromptCategoryEntity> {
    protected buildTreeConfig(): HierarchyTreeConfig {
        return {
            EntityName: 'MJ: AI Prompt Categories',
            ParentField: 'ParentID',
            SubtitleField: 'Description',
            DefaultIcon: 'fa-solid fa-wand-magic-sparkles',
            DefaultColor: '#ec4899',
            ActiveRecordID: this.Record?.ID || undefined,
            Height: '100%',
            MinHeight: '640px',
            ShowSearch: true,
            ShowToolbar: true,
            NavigateOnNodeClick: true
        };
    }
}

// ============================================================================
// 3. Action Categories
// ============================================================================
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:Action Categories:hierarchy',
    metadata: {
        entity: 'MJ: Action Categories',
        slot: 'after-related',
        sortKey: 50,
        relatedEntity: 'MJ: Action Categories',
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
            SectionName="Hierarchy"
            Icon="fa-solid fa-sitemap"
            Variant="related-entity"
            [Form]="FormComponent"
            [FormContext]="FormContext"
            [DefaultExpanded]="true">
            @if (Record.IsSaved) {
                <mj-hierarchy-tree
                    [Config]="treeConfig"
                    [ZoomLevel]="persistedZoomLevel"
                    (ZoomChange)="onZoomChange($event)"
                    (Navigate)="onNavigate($event)">
                </mj-hierarchy-tree>
            }
        </mj-collapsible-panel>
    `,
    styles: [`:host { display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 640px; min-height: calc(100vh - 280px); flex: 1; margin-bottom: 20px; }`]
})
export class ActionCategoryHierarchyPanel extends BaseHierarchyFormPanel<MJActionCategoryEntity> {
    protected buildTreeConfig(): HierarchyTreeConfig {
        return {
            EntityName: 'MJ: Action Categories',
            ParentField: 'ParentID',
            SubtitleField: 'Description',
            DefaultIcon: 'fa-solid fa-bolt',
            DefaultColor: '#f59e0b',
            ActiveRecordID: this.Record?.ID || undefined,
            Height: '100%',
            MinHeight: '640px',
            ShowSearch: true,
            ShowToolbar: true,
            NavigateOnNodeClick: true
        };
    }
}

// ============================================================================
// 4. Dashboard Categories
// ============================================================================
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:Dashboard Categories:hierarchy',
    metadata: {
        entity: 'MJ: Dashboard Categories',
        slot: 'after-related',
        sortKey: 50,
        relatedEntity: 'MJ: Dashboard Categories',
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
            SectionName="Hierarchy"
            Icon="fa-solid fa-sitemap"
            Variant="related-entity"
            [Form]="FormComponent"
            [FormContext]="FormContext"
            [DefaultExpanded]="true">
            @if (Record.IsSaved) {
                <mj-hierarchy-tree
                    [Config]="treeConfig"
                    [ZoomLevel]="persistedZoomLevel"
                    (ZoomChange)="onZoomChange($event)"
                    (Navigate)="onNavigate($event)">
                </mj-hierarchy-tree>
            }
        </mj-collapsible-panel>
    `,
    styles: [`:host { display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 640px; min-height: calc(100vh - 280px); flex: 1; margin-bottom: 20px; }`]
})
export class DashboardCategoryHierarchyPanel extends BaseHierarchyFormPanel<MJDashboardCategoryEntity> {
    protected buildTreeConfig(): HierarchyTreeConfig {
        return {
            EntityName: 'MJ: Dashboard Categories',
            ParentField: 'ParentID',
            SubtitleField: 'Description',
            DefaultIcon: 'fa-solid fa-chart-pie',
            DefaultColor: '#06b6d4',
            ActiveRecordID: this.Record?.ID || undefined,
            Height: '100%',
            MinHeight: '640px',
            ShowSearch: true,
            ShowToolbar: true,
            NavigateOnNodeClick: true
        };
    }
}

// ============================================================================
// 5. Query Categories
// ============================================================================
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:Query Categories:hierarchy',
    metadata: {
        entity: 'MJ: Query Categories',
        slot: 'after-related',
        sortKey: 50,
        relatedEntity: 'MJ: Query Categories',
        relatedJoinField: 'ParentID'
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
            SectionName="Hierarchy"
            Icon="fa-solid fa-sitemap"
            Variant="related-entity"
            [Form]="FormComponent"
            [FormContext]="FormContext"
            [DefaultExpanded]="true">
            @if (Record.IsSaved) {
                <mj-hierarchy-tree
                    [Config]="treeConfig"
                    [ZoomLevel]="persistedZoomLevel"
                    (ZoomChange)="onZoomChange($event)"
                    (Navigate)="onNavigate($event)">
                </mj-hierarchy-tree>
            }
        </mj-collapsible-panel>
    `,
    styles: [`:host { display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 640px; min-height: calc(100vh - 280px); flex: 1; margin-bottom: 20px; }`]
})
export class QueryCategoryHierarchyPanel extends BaseHierarchyFormPanel<MJQueryCategoryEntity> {
    protected buildTreeConfig(): HierarchyTreeConfig {
        return {
            EntityName: 'MJ: Query Categories',
            ParentField: 'ParentID',
            SubtitleField: 'Description',
            DefaultIcon: 'fa-solid fa-database',
            DefaultColor: '#10b981',
            ActiveRecordID: this.Record?.ID || undefined,
            Height: '100%',
            MinHeight: '640px',
            ShowSearch: true,
            ShowToolbar: true,
            NavigateOnNodeClick: true
        };
    }
}

// ============================================================================
// 6. Tags
// ============================================================================
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:Tags:hierarchy',
    metadata: {
        entity: 'MJ: Tags',
        slot: 'after-related',
        sortKey: 50,
        relatedEntity: 'MJ: Tags',
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
            SectionName="Hierarchy"
            Icon="fa-solid fa-sitemap"
            Variant="related-entity"
            [Form]="FormComponent"
            [FormContext]="FormContext"
            [DefaultExpanded]="true">
            @if (Record.IsSaved) {
                <mj-hierarchy-tree
                    [Config]="treeConfig"
                    [ZoomLevel]="persistedZoomLevel"
                    (ZoomChange)="onZoomChange($event)"
                    (Navigate)="onNavigate($event)">
                </mj-hierarchy-tree>
            }
        </mj-collapsible-panel>
    `,
    styles: [`:host { display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 640px; min-height: calc(100vh - 280px); flex: 1; margin-bottom: 20px; }`]
})
export class TagHierarchyPanel extends BaseHierarchyFormPanel<MJTagEntity> {
    protected buildTreeConfig(): HierarchyTreeConfig {
        return {
            EntityName: 'MJ: Tags',
            ParentField: 'ParentID',
            SubtitleField: 'Description',
            DefaultIcon: 'fa-solid fa-tag',
            DefaultColor: '#6366f1',
            ActiveRecordID: this.Record?.ID || undefined,
            Height: '100%',
            MinHeight: '640px',
            ShowSearch: true,
            ShowToolbar: true,
            NavigateOnNodeClick: true
        };
    }
}

// ============================================================================
// 7. Projects (WBS / Subprojects)
// ============================================================================
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:Projects:hierarchy',
    metadata: {
        entity: 'MJ: Projects',
        slot: 'after-related',
        sortKey: 50,
        relatedEntity: 'MJ: Projects',
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
            SectionName="Hierarchy"
            Icon="fa-solid fa-sitemap"
            Variant="related-entity"
            [Form]="FormComponent"
            [FormContext]="FormContext"
            [DefaultExpanded]="true">
            @if (Record.IsSaved) {
                <mj-hierarchy-tree
                    [Config]="treeConfig"
                    [ZoomLevel]="persistedZoomLevel"
                    (ZoomChange)="onZoomChange($event)"
                    (Navigate)="onNavigate($event)">
                </mj-hierarchy-tree>
            }
        </mj-collapsible-panel>
    `,
    styles: [`:host { display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 640px; min-height: calc(100vh - 280px); flex: 1; margin-bottom: 20px; }`]
})
export class ProjectHierarchyPanel extends BaseHierarchyFormPanel<MJProjectEntity> {
    protected buildTreeConfig(): HierarchyTreeConfig {
        return {
            EntityName: 'MJ: Projects',
            ParentField: 'ParentID',
            SubtitleField: 'Description',
            DefaultIcon: 'fa-solid fa-diagram-project',
            DefaultColor: '#3b82f6',
            ActiveRecordID: this.Record?.ID || undefined,
            Height: '100%',
            MinHeight: '640px',
            ShowSearch: true,
            ShowToolbar: true,
            NavigateOnNodeClick: true
        };
    }
}

// ============================================================================
// 8. Content Items
// ============================================================================
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:Content Items:hierarchy',
    metadata: {
        entity: 'MJ: Content Items',
        slot: 'after-related',
        sortKey: 50,
        relatedEntity: 'MJ: Content Items',
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
            SectionName="Hierarchy"
            Icon="fa-solid fa-sitemap"
            Variant="related-entity"
            [Form]="FormComponent"
            [FormContext]="FormContext"
            [DefaultExpanded]="true">
            @if (Record.IsSaved) {
                <mj-hierarchy-tree
                    [Config]="treeConfig"
                    [ZoomLevel]="persistedZoomLevel"
                    (ZoomChange)="onZoomChange($event)"
                    (Navigate)="onNavigate($event)">
                </mj-hierarchy-tree>
            }
        </mj-collapsible-panel>
    `,
    styles: [`:host { display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 640px; min-height: calc(100vh - 280px); flex: 1; margin-bottom: 20px; }`]
})
export class ContentItemHierarchyPanel extends BaseHierarchyFormPanel<MJContentItemEntity> {
    protected buildTreeConfig(): HierarchyTreeConfig {
        return {
            EntityName: 'MJ: Content Items',
            ParentField: 'ParentID',
            SubtitleField: 'Description',
            DefaultIcon: 'fa-solid fa-newspaper',
            DefaultColor: '#14b8a6',
            ActiveRecordID: this.Record?.ID || undefined,
            Height: '100%',
            MinHeight: '640px',
            ShowSearch: true,
            ShowToolbar: true,
            NavigateOnNodeClick: true
        };
    }
}

// ============================================================================
// 9. File Categories
// ============================================================================
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:File Categories:hierarchy',
    metadata: {
        entity: 'MJ: File Categories',
        slot: 'after-related',
        sortKey: 50,
        relatedEntity: 'MJ: File Categories',
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
            SectionName="Hierarchy"
            Icon="fa-solid fa-sitemap"
            Variant="related-entity"
            [Form]="FormComponent"
            [FormContext]="FormContext"
            [DefaultExpanded]="true">
            @if (Record.IsSaved) {
                <mj-hierarchy-tree
                    [Config]="treeConfig"
                    [ZoomLevel]="persistedZoomLevel"
                    (ZoomChange)="onZoomChange($event)"
                    (Navigate)="onNavigate($event)">
                </mj-hierarchy-tree>
            }
        </mj-collapsible-panel>
    `,
    styles: [`:host { display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 640px; min-height: calc(100vh - 280px); flex: 1; margin-bottom: 20px; }`]
})
export class FileCategoryHierarchyPanel extends BaseHierarchyFormPanel<MJFileCategoryEntity> {
    protected buildTreeConfig(): HierarchyTreeConfig {
        return {
            EntityName: 'MJ: File Categories',
            ParentField: 'ParentID',
            SubtitleField: 'Description',
            DefaultIcon: 'fa-solid fa-folder-tree',
            DefaultColor: '#0284c7',
            ActiveRecordID: this.Record?.ID || undefined,
            Height: '100%',
            MinHeight: '640px',
            ShowSearch: true,
            ShowToolbar: true,
            NavigateOnNodeClick: true
        };
    }
}

// ============================================================================
// 10. List Categories
// ============================================================================
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:List Categories:hierarchy',
    metadata: {
        entity: 'MJ: List Categories',
        slot: 'after-related',
        sortKey: 50,
        relatedEntity: 'MJ: List Categories',
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
            SectionName="Hierarchy"
            Icon="fa-solid fa-sitemap"
            Variant="related-entity"
            [Form]="FormComponent"
            [FormContext]="FormContext"
            [DefaultExpanded]="true">
            @if (Record.IsSaved) {
                <mj-hierarchy-tree
                    [Config]="treeConfig"
                    [ZoomLevel]="persistedZoomLevel"
                    (ZoomChange)="onZoomChange($event)"
                    (Navigate)="onNavigate($event)">
                </mj-hierarchy-tree>
            }
        </mj-collapsible-panel>
    `,
    styles: [`:host { display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 640px; min-height: calc(100vh - 280px); flex: 1; margin-bottom: 20px; }`]
})
export class ListCategoryHierarchyPanel extends BaseHierarchyFormPanel<MJListCategoryEntity> {
    protected buildTreeConfig(): HierarchyTreeConfig {
        return {
            EntityName: 'MJ: List Categories',
            ParentField: 'ParentID',
            SubtitleField: 'Description',
            DefaultIcon: 'fa-solid fa-list-check',
            DefaultColor: '#84cc16',
            ActiveRecordID: this.Record?.ID || undefined,
            Height: '100%',
            MinHeight: '640px',
            ShowSearch: true,
            ShowToolbar: true,
            NavigateOnNodeClick: true
        };
    }
}

// ============================================================================
// 11. Record Process Categories
// ============================================================================
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:Record Process Categories:hierarchy',
    metadata: {
        entity: 'MJ: Record Process Categories',
        slot: 'after-related',
        sortKey: 50,
        relatedEntity: 'MJ: Record Process Categories',
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
            SectionName="Hierarchy"
            Icon="fa-solid fa-sitemap"
            Variant="related-entity"
            [Form]="FormComponent"
            [FormContext]="FormContext"
            [DefaultExpanded]="true">
            @if (Record.IsSaved) {
                <mj-hierarchy-tree
                    [Config]="treeConfig"
                    [ZoomLevel]="persistedZoomLevel"
                    (ZoomChange)="onZoomChange($event)"
                    (Navigate)="onNavigate($event)">
                </mj-hierarchy-tree>
            }
        </mj-collapsible-panel>
    `,
    styles: [`:host { display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 640px; min-height: calc(100vh - 280px); flex: 1; margin-bottom: 20px; }`]
})
export class RecordProcessCategoryHierarchyPanel extends BaseHierarchyFormPanel<MJRecordProcessCategoryEntity> {
    protected buildTreeConfig(): HierarchyTreeConfig {
        return {
            EntityName: 'MJ: Record Process Categories',
            ParentField: 'ParentID',
            SubtitleField: 'Description',
            DefaultIcon: 'fa-solid fa-gears',
            DefaultColor: '#f97316',
            ActiveRecordID: this.Record?.ID || undefined,
            Height: '100%',
            MinHeight: '640px',
            ShowSearch: true,
            ShowToolbar: true,
            NavigateOnNodeClick: true
        };
    }
}

// ============================================================================
// 12. Skills
// ============================================================================
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:Skills:hierarchy',
    metadata: {
        entity: 'MJ: Skills',
        slot: 'after-related',
        sortKey: 50,
        relatedEntity: 'MJ: Skills',
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
            SectionName="Hierarchy"
            Icon="fa-solid fa-sitemap"
            Variant="related-entity"
            [Form]="FormComponent"
            [FormContext]="FormContext"
            [DefaultExpanded]="true">
            @if (Record.IsSaved) {
                <mj-hierarchy-tree
                    [Config]="treeConfig"
                    [ZoomLevel]="persistedZoomLevel"
                    (ZoomChange)="onZoomChange($event)"
                    (Navigate)="onNavigate($event)">
                </mj-hierarchy-tree>
            }
        </mj-collapsible-panel>
    `,
    styles: [`:host { display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 640px; min-height: calc(100vh - 280px); flex: 1; margin-bottom: 20px; }`]
})
export class SkillHierarchyPanel extends BaseHierarchyFormPanel<MJSkillEntity> {
    protected buildTreeConfig(): HierarchyTreeConfig {
        return {
            EntityName: 'MJ: Skills',
            ParentField: 'ParentID',
            SubtitleField: 'Description',
            DefaultIcon: 'fa-solid fa-brain',
            DefaultColor: '#a855f7',
            ActiveRecordID: this.Record?.ID || undefined,
            Height: '100%',
            MinHeight: '640px',
            ShowSearch: true,
            ShowToolbar: true,
            NavigateOnNodeClick: true
        };
    }
}

// ============================================================================
// 13. Template Categories
// ============================================================================
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:Template Categories:hierarchy',
    metadata: {
        entity: 'MJ: Template Categories',
        slot: 'after-related',
        sortKey: 50,
        relatedEntity: 'MJ: Template Categories',
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
            SectionName="Hierarchy"
            Icon="fa-solid fa-sitemap"
            Variant="related-entity"
            [Form]="FormComponent"
            [FormContext]="FormContext"
            [DefaultExpanded]="true">
            @if (Record.IsSaved) {
                <mj-hierarchy-tree
                    [Config]="treeConfig"
                    [ZoomLevel]="persistedZoomLevel"
                    (ZoomChange)="onZoomChange($event)"
                    (Navigate)="onNavigate($event)">
                </mj-hierarchy-tree>
            }
        </mj-collapsible-panel>
    `,
    styles: [`:host { display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 640px; min-height: calc(100vh - 280px); flex: 1; margin-bottom: 20px; }`]
})
export class TemplateCategoryHierarchyPanel extends BaseHierarchyFormPanel<MJTemplateCategoryEntity> {
    protected buildTreeConfig(): HierarchyTreeConfig {
        return {
            EntityName: 'MJ: Template Categories',
            ParentField: 'ParentID',
            SubtitleField: 'Description',
            DefaultIcon: 'fa-solid fa-file-code',
            DefaultColor: '#0ea5e9',
            ActiveRecordID: this.Record?.ID || undefined,
            Height: '100%',
            MinHeight: '640px',
            ShowSearch: true,
            ShowToolbar: true,
            NavigateOnNodeClick: true
        };
    }
}

// ============================================================================
// 14. Test Suites
// ============================================================================
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:Test Suites:hierarchy',
    metadata: {
        entity: 'MJ: Test Suites',
        slot: 'after-related',
        sortKey: 50,
        relatedEntity: 'MJ: Test Suites',
        relatedJoinField: 'ParentSuiteID'
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
            SectionName="Hierarchy"
            Icon="fa-solid fa-sitemap"
            Variant="related-entity"
            [Form]="FormComponent"
            [FormContext]="FormContext"
            [DefaultExpanded]="true">
            @if (Record.IsSaved) {
                <mj-hierarchy-tree
                    [Config]="treeConfig"
                    [ZoomLevel]="persistedZoomLevel"
                    (ZoomChange)="onZoomChange($event)"
                    (Navigate)="onNavigate($event)">
                </mj-hierarchy-tree>
            }
        </mj-collapsible-panel>
    `,
    styles: [`:host { display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 640px; min-height: calc(100vh - 280px); flex: 1; margin-bottom: 20px; }`]
})
export class TestSuiteHierarchyPanel extends BaseHierarchyFormPanel<MJTestSuiteEntity> {
    protected buildTreeConfig(): HierarchyTreeConfig {
        return {
            EntityName: 'MJ: Test Suites',
            ParentField: 'ParentSuiteID',
            SubtitleField: 'Description',
            DefaultIcon: 'fa-solid fa-vial-circle-check',
            DefaultColor: '#10b981',
            ActiveRecordID: this.Record?.ID || undefined,
            Height: '100%',
            MinHeight: '640px',
            ShowSearch: true,
            ShowToolbar: true,
            NavigateOnNodeClick: true
        };
    }
}

// ============================================================================
// 15. User View Categories
// ============================================================================
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:User View Categories:hierarchy',
    metadata: {
        entity: 'MJ: User View Categories',
        slot: 'after-related',
        sortKey: 50,
        relatedEntity: 'MJ: User View Categories',
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
            SectionName="Hierarchy"
            Icon="fa-solid fa-sitemap"
            Variant="related-entity"
            [Form]="FormComponent"
            [FormContext]="FormContext"
            [DefaultExpanded]="true">
            @if (Record.IsSaved) {
                <mj-hierarchy-tree
                    [Config]="treeConfig"
                    [ZoomLevel]="persistedZoomLevel"
                    (ZoomChange)="onZoomChange($event)"
                    (Navigate)="onNavigate($event)">
                </mj-hierarchy-tree>
            }
        </mj-collapsible-panel>
    `,
    styles: [`:host { display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 640px; min-height: calc(100vh - 280px); flex: 1; margin-bottom: 20px; }`]
})
export class UserViewCategoryHierarchyPanel extends BaseHierarchyFormPanel<MJUserViewCategoryEntity> {
    protected buildTreeConfig(): HierarchyTreeConfig {
        return {
            EntityName: 'MJ: User View Categories',
            ParentField: 'ParentID',
            SubtitleField: 'Description',
            DefaultIcon: 'fa-solid fa-table-list',
            DefaultColor: '#6366f1',
            ActiveRecordID: this.Record?.ID || undefined,
            Height: '100%',
            MinHeight: '640px',
            ShowSearch: true,
            ShowToolbar: true,
            NavigateOnNodeClick: true
        };
    }
}

/**
 * Array of all hierarchy form panel components for registration and module imports.
 */
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
