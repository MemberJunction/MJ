import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { ResourceData, CredentialCategoryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { RunView } from '@memberjunction/core';

export function LoadCredentialsCategoriesResource() {
    // Prevents tree-shaking
}

interface CategoryNode {
    category: CredentialCategoryEntity;
    children: CategoryNode[];
    expanded: boolean;
    level: number;
}

@RegisterClass(BaseResourceComponent, 'CredentialsCategoriesResource')
@Component({
    selector: 'mj-credentials-categories-resource',
    templateUrl: './credentials-categories-resource.component.html',
    styleUrls: ['./credentials-categories-resource.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CredentialsCategoriesResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
    public isLoading = true;
    public categories: CredentialCategoryEntity[] = [];
    public categoryTree: CategoryNode[] = [];

    constructor(private cdr: ChangeDetectorRef) {
        super();
    }

    ngOnInit(): void {
        this.loadData();
    }

    ngOnDestroy(): void {
        // Cleanup if needed
    }

    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        return 'Categories';
    }

    async GetResourceIconClass(data: ResourceData): Promise<string> {
        return 'fa-solid fa-folder-tree';
    }

    private async loadData(): Promise<void> {
        try {
            this.isLoading = true;
            this.cdr.markForCheck();

            const rv = new RunView();
            const result = await rv.RunView<CredentialCategoryEntity>({
                EntityName: 'MJ: Credential Categories',
                OrderBy: 'Name',
                ResultType: 'entity_object'
            });

            if (result.Success) {
                this.categories = result.Results;
                this.buildTree();
            }

        } catch (error) {
            console.error('Error loading credential categories:', error);
        } finally {
            this.isLoading = false;
            this.NotifyLoadComplete();
            this.cdr.markForCheck();
        }
    }

    private buildTree(): void {
        const categoryMap = new Map<string, CategoryNode>();

        // Create nodes for all categories
        for (const category of this.categories) {
            categoryMap.set(category.ID, {
                category,
                children: [],
                expanded: true,
                level: 0
            });
        }

        // Build tree structure
        const roots: CategoryNode[] = [];
        for (const category of this.categories) {
            const node = categoryMap.get(category.ID)!;
            if (category.ParentID) {
                const parent = categoryMap.get(category.ParentID);
                if (parent) {
                    node.level = parent.level + 1;
                    parent.children.push(node);
                } else {
                    roots.push(node);
                }
            } else {
                roots.push(node);
            }
        }

        // Sort children recursively
        const sortNodes = (nodes: CategoryNode[]): void => {
            nodes.sort((a, b) => a.category.Name.localeCompare(b.category.Name));
            for (const node of nodes) {
                sortNodes(node.children);
            }
        };
        sortNodes(roots);

        this.categoryTree = roots;
    }

    public toggleExpand(node: CategoryNode): void {
        node.expanded = !node.expanded;
        this.cdr.markForCheck();
    }

    public getFlattenedNodes(): CategoryNode[] {
        const result: CategoryNode[] = [];

        const flatten = (nodes: CategoryNode[]): void => {
            for (const node of nodes) {
                result.push(node);
                if (node.expanded && node.children.length > 0) {
                    flatten(node.children);
                }
            }
        };

        flatten(this.categoryTree);
        return result;
    }
}
