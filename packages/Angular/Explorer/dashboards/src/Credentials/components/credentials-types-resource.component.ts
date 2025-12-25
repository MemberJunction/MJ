import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { ResourceData, CredentialTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { RunView } from '@memberjunction/core';

export function LoadCredentialsTypesResource() {
    // Prevents tree-shaking
}

interface FieldSchemaProperty {
    name: string;
    type: string;
    title: string;
    description: string;
    isSecret: boolean;
    required: boolean;
}

@RegisterClass(BaseResourceComponent, 'CredentialsTypesResource')
@Component({
    selector: 'mj-credentials-types-resource',
    templateUrl: './credentials-types-resource.component.html',
    styleUrls: ['./credentials-types-resource.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CredentialsTypesResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
    public isLoading = true;
    public types: CredentialTypeEntity[] = [];
    public selectedType: CredentialTypeEntity | null = null;
    public schemaProperties: FieldSchemaProperty[] = [];

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
        return 'Credential Types';
    }

    async GetResourceIconClass(data: ResourceData): Promise<string> {
        return 'fa-solid fa-cubes';
    }

    private async loadData(): Promise<void> {
        try {
            this.isLoading = true;
            this.cdr.markForCheck();

            const rv = new RunView();
            const result = await rv.RunView<CredentialTypeEntity>({
                EntityName: 'MJ: Credential Types',
                OrderBy: 'Category, Name',
                ResultType: 'entity_object'
            });

            if (result.Success) {
                this.types = result.Results;
            }

        } catch (error) {
            console.error('Error loading credential types:', error);
        } finally {
            this.isLoading = false;
            this.NotifyLoadComplete();
            this.cdr.markForCheck();
        }
    }

    public selectType(type: CredentialTypeEntity): void {
        this.selectedType = type;
        this.parseFieldSchema(type.FieldSchema);
        this.cdr.markForCheck();
    }

    public closeDetail(): void {
        this.selectedType = null;
        this.schemaProperties = [];
        this.cdr.markForCheck();
    }

    private parseFieldSchema(schemaJson: string): void {
        try {
            const schema = JSON.parse(schemaJson) as { properties?: Record<string, Record<string, unknown>>; required?: string[] };
            const properties = schema.properties || {};
            const required = schema.required || [];

            this.schemaProperties = Object.entries(properties).map(([name, prop]) => ({
                name,
                type: (prop.type as string) || 'string',
                title: (prop.title as string) || name,
                description: (prop.description as string) || '',
                isSecret: prop.isSecret === true,
                required: required.includes(name)
            }));

            // Sort by order if available, otherwise by name
            this.schemaProperties.sort((a, b) => {
                const propA = properties[a.name];
                const propB = properties[b.name];
                const orderA = typeof propA.order === 'number' ? propA.order : 999;
                const orderB = typeof propB.order === 'number' ? propB.order : 999;
                return orderA - orderB;
            });

        } catch (e) {
            console.error('Failed to parse field schema:', e);
            this.schemaProperties = [];
        }
    }

    public getCategoryIcon(category: string): string {
        const iconMap: Record<string, string> = {
            'AI': 'fa-solid fa-brain',
            'Communication': 'fa-solid fa-envelope',
            'Storage': 'fa-solid fa-cloud',
            'Database': 'fa-solid fa-database',
            'Authentication': 'fa-solid fa-shield-halved',
            'Integration': 'fa-solid fa-plug'
        };
        return iconMap[category] || 'fa-solid fa-key';
    }

    public getTypesByCategory(): Map<string, CredentialTypeEntity[]> {
        const grouped = new Map<string, CredentialTypeEntity[]>();
        for (const type of this.types) {
            const category = type.Category;
            if (!grouped.has(category)) {
                grouped.set(category, []);
            }
            grouped.get(category)!.push(type);
        }
        return grouped;
    }
}
