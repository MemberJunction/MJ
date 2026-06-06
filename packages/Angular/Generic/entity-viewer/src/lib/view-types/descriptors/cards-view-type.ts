import { Type } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseViewTypeDescriptor } from '../view-type.contracts';
import { EntityCardsComponent } from '../../entity-cards/entity-cards.component';

/**
 * Cards view type — renders each record as a card in a responsive grid. Available for
 * every entity.
 *
 * Registration key (`DriverClass`) matches the `MJ: View Types` metadata seed:
 * `metadata/view-types/.view-types.json` → "CardsViewType".
 */
@RegisterClass(BaseViewTypeDescriptor, 'CardsViewType')
export class CardsViewType extends BaseViewTypeDescriptor {
  readonly Name = 'CardsViewType';
  readonly DisplayName = 'Cards';
  readonly Icon = 'fa-solid fa-grip';
  readonly RendererComponent: Type<unknown> = EntityCardsComponent;

  // IsAvailableFor inherits the base "always available" behavior.
}

/** Tree-shaking guard — call from a barrel/module to keep the registration alive. */
export function LoadCardsViewType(): void {
  // no-op
}
