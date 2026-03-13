import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { MJQueryCategoryEntity } from '@memberjunction/core-entities';
import { Metadata, RunView } from '@memberjunction/core';
import { MJNotificationService } from '@memberjunction/ng-notifications';

interface CategoryNode {
    id: string;
    name: string;
    fullPath: string;
    children: CategoryNode[];
    level: number;
}

@Component({
  standalone: false,
    selector: 'mj-query-category-dialog',
    templateUrl: './query-category-dialog.component.html',
    styleUrls: ['./query-category-dialog.component.css']
})
export class QueryCategoryDialogComponent implements OnInit {
    @Input() isVisible = false;
    @Output() isVisibleChange = new EventEmitter<boolean>();
    @Output() onCategoryCreated = new EventEmitter<MJQueryCategoryEntity>();
    
    public categoryName = '';
    public selectedParentId: string | null = null;
    public categories: MJQueryCategoryEntity[] = [];
    public categoryTree: CategoryNode[] = [];
    public flattenedCategories: CategoryNode[] = [];
    public isCreating = false;
    
    async ngOnInit() {
        await this.loadCategories();
    }
    
    async loadCategories() {
        try {
            const rv = new RunView();
            const result = await rv.RunView<MJQueryCategoryEntity>({
                EntityName: 'MJ: Query Categories',
                OrderBy: 'Name',
                ResultType: 'entity_object'
            });
            
            if (result.Success && result.Results) {
                this.categories = result.Results;
                this.categoryTree = this.buildCategoryTree(this.categories);
                this.flattenedCategories = this.flattenCategories(this.categoryTree, 0);
            }
        } catch (error) {
            console.error('Error loading categories:', error);
        }
    }
    
    private buildCategoryTree(categories: MJQueryCategoryEntity[]): CategoryNode[] {
        const categoryMap = new Map<string, CategoryNode>();
        const rootCategories: CategoryNode[] = [];
        
        // Create nodes for all categories
        categories.forEach(cat => {
            categoryMap.set(cat.ID, {
                id: cat.ID,
                name: cat.Name,
                fullPath: cat.Name,
                children: [],
                level: 0
            });
        });
        
        // Build the tree structure
        categories.forEach(cat => {
            const node = categoryMap.get(cat.ID)!;
            if (cat.ParentID && categoryMap.has(cat.ParentID)) {
                const parent = categoryMap.get(cat.ParentID)!;
                parent.children.push(node);
                node.fullPath = `${parent.fullPath} / ${node.name}`;
            } else {
                rootCategories.push(node);
            }
        });
        
        // Sort children alphabetically
        const sortNodes = (nodes: CategoryNode[]) => {
            nodes.sort((a, b) => a.name.localeCompare(b.name));
            nodes.forEach(node => sortNodes(node.children));
        };
        sortNodes(rootCategories);
        
        return rootCategories;
    }
    
    private flattenCategories(nodes: CategoryNode[], level: number): CategoryNode[] {
        const result: CategoryNode[] = [];
        nodes.forEach(node => {
            node.level = level;
            result.push(node);
            if (node.children.length > 0) {
                result.push(...this.flattenCategories(node.children, level + 1));
            }
        });
        return result;
    }
    
    async createCategory() {
        if (!this.categoryName.trim()) {
            MJNotificationService.Instance.CreateSimpleNotification(
                'Please enter a category name',
                'warning'
            );
            return;
        }
        
        this.isCreating = true;
        
        try {
            const md = new Metadata();
            const newCategory = await md.GetEntityObject<MJQueryCategoryEntity>('MJ: Query Categories');
            newCategory.Name = this.categoryName.trim();
            newCategory.ParentID = this.selectedParentId;
            newCategory.UserID = md.CurrentUser.ID;
            
            const saved = await newCategory.Save();
            
            if (saved) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    'Category created successfully',
                    'success'
                );
                this.onCategoryCreated.emit(newCategory);
                this.close();
            } else {
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Failed to create category: ${newCategory.LatestResult?.Message || 'Unknown error'}`,
                    'error'
                );
            }
        } catch (error) {
            console.error('Error creating category:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Error creating category',
                'error'
            );
        } finally {
            this.isCreating = false;
        }
    }
    
    close() {
        this.categoryName = '';
        this.selectedParentId = null;
        this.isVisible = false;
        this.isVisibleChange.emit(false);
    }
    
    getCategoryIndent(category: CategoryNode): string {
        return `${category.level * 20}px`;
    }
    
    getFullPath(): string {
        const parent = this.flattenedCategories.find(c => c.id === this.selectedParentId);
        const name = this.categoryName || 'New Category';
        return parent ? `${parent.fullPath} / ${name}` : name;
    }
}