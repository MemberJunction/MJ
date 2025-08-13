import { Component, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CompositeKey, Metadata, RunView } from '@memberjunction/core';
import { ComponentRegistryEntity } from '@memberjunction/core-entities';

@Component({
  selector: 'mj-component-studio-settings',
  templateUrl: './component-studio-settings.component.html',
  styleUrls: ['./component-studio-settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ComponentStudioSettingsComponent {
  @Output() openEntityRecord = new EventEmitter<{ entityName: string; key: CompositeKey }>();
  
  public registries: ComponentRegistryEntity[] = [];
  public showDeprecated = false;
  public autoRefresh = false;
  public showDevComponents = true;
  
  constructor() {
    this.loadRegistries();
  }
  
  private async loadRegistries(): Promise<void> {
    try {
      const rv = new RunView();
      const result = await rv.RunView<ComponentRegistryEntity>({
        EntityName: 'Component Registries',
        ExtraFilter: '',
        OrderBy: 'Name',
        ResultType: 'entity_object'
      });
      
      if (result.Success) {
        this.registries = result.Results || [];
      }
    } catch (error) {
      console.error('Failed to load registries:', error);
    }
  }
  
  public addRegistry(): void {
    const key = new CompositeKey();
    this.openEntityRecord.emit({ entityName: 'Component Registries', key });
  }
  
  public toggleShowDeprecated(): void {
    this.showDeprecated = !this.showDeprecated;
    // TODO: Save preference
  }
  
  public toggleAutoRefresh(): void {
    this.autoRefresh = !this.autoRefresh;
    // TODO: Save preference and implement auto-refresh
  }
  
  public toggleShowDevComponents(): void {
    this.showDevComponents = !this.showDevComponents;
    // TODO: Save preference
  }
  
  public syncComponents(): void {
    // TODO: Implement registry sync
    console.log('Syncing with registries...');
  }
  
  public exportComponents(): void {
    // TODO: Implement export
    console.log('Exporting components...');
  }
  
  public importComponents(): void {
    // TODO: Implement import
    console.log('Importing components...');
  }
  
  public openComponentEditor(): void {
    // TODO: Open component editor
    console.log('Opening component editor...');
  }
  
  public openDebugConsole(): void {
    // TODO: Open debug console
    console.log('Opening debug console...');
  }
  
  public viewComponentSchema(): void {
    // TODO: View schema
    console.log('Viewing component schema...');
  }
}