/**
 * @fileoverview Entity Detail component for displaying details of a MemberJunction entity.
 * 
 * This component demonstrates:
 * 1. Creating a simple display component that can be converted to a web component
 * 2. Using @Input() properties that can be set from outside Angular
 * 3. Displaying detailed information about a selected entity
 */
import { Component, Input } from '@angular/core';
import { EntityInfo } from '@memberjunction/core'

/**
 * A component that displays detailed information about a MemberJunction entity.
 * 
 * Features:
 * - Accepts an EntityInfo object as an input property
 * - Displays various properties of the entity in a grid layout
 * - Automatically updates when the input changes
 * 
 * When used as a web component, it's registered as <mj-entity-detail-demo>.
 * The entity property can be set directly on the element in JavaScript.
 */
@Component({
  standalone: false,
  selector: 'app-entity-detail-demo',
  templateUrl: './entity-detail-demo.component.html',
  styleUrls: ['./entity-detail-demo.component.css']
})
export class EntityDetailDemoComponent {
  /**
   * The entity to display details for.
   * 
   * When used as a web component, this property can be set directly
   * on the element in JavaScript:
   * document.querySelector('mj-entity-detail-demo').entity = myEntityData;
   */
  @Input() entity: EntityInfo;
}