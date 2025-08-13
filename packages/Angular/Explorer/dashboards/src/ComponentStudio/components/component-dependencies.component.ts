import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, OnChanges } from '@angular/core';
import { ComponentEntity, ComponentDependencyEntity, ComponentLibraryEntity } from '@memberjunction/core-entities';
import { CompositeKey, RunView } from '@memberjunction/core';

interface DependencyNode {
  id: string;
  name: string;
  type: 'component' | 'library';
  children?: DependencyNode[];
}

@Component({
  selector: 'mj-component-dependencies',
  templateUrl: './component-dependencies.component.html',
  styleUrls: ['./component-dependencies.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ComponentDependenciesComponent implements OnChanges {
  @Input() component!: ComponentEntity;
  @Output() openEntityRecord = new EventEmitter<{ entityName: string; key: CompositeKey }>();
  
  public componentDependencies: ComponentDependencyEntity[] = [];
  public libraryDependencies: ComponentLibraryEntity[] = [];
  
  async ngOnChanges(): Promise<void> {
    if (this.component) {
      await this.loadDependencies();
    }
  }
  
  private async loadDependencies(): Promise<void> {
    try {
      const rv = new RunView();
      
      // Load component dependencies
      const depResult = await rv.RunView<ComponentDependencyEntity>({
        EntityName: 'Component Dependencies',
        ExtraFilter: `ComponentID='${this.component.ID}'`,
        ResultType: 'entity_object'
      });
      
      if (depResult.Success) {
        this.componentDependencies = depResult.Results || [];
      }
      
      // TODO: Load library dependencies through ComponentLibraryLink
      
    } catch (error) {
      console.error('Failed to load dependencies:', error);
    }
  }
  
  public viewComponent(componentId: string): void {
    const key = new CompositeKey();
    key.KeyValuePairs.push({ FieldName: 'ID', Value: componentId });
    this.openEntityRecord.emit({ entityName: 'Components', key });
  }
}