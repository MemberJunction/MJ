import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { ComponentEntity } from '@memberjunction/core-entities';
import { ComponentSpec } from '@memberjunction/interactive-component-types';
import { CompositeKey } from '@memberjunction/core';

@Component({
  selector: 'mj-component-preview',
  templateUrl: './component-preview.component.html',
  styleUrls: ['./component-preview.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ComponentPreviewComponent {
  @Input() component!: ComponentEntity;
  @Input() componentSpec: ComponentSpec | null = null;
  @Output() openEntityRecord = new EventEmitter<{ entityName: string; key: CompositeKey }>();
  
  public showCode = false;
  
  public runComponent(): void {
    // TODO: Implement component execution logic
    console.log('Running component:', this.component.Name);
  }
}