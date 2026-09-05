/**
 * @memberjunction/ng-filter-builder
 *
 * A modern, intuitive filter builder component for Angular applications.
 * Creates complex boolean filter expressions. The filter payload shapes
 * (`CompositeFilterDescriptor` et al.) come from `@memberjunction/core` — import them
 * from there; this package exports only the builder and its UI-facing types.
 *
 * @packageDocumentation
 */

// Module
export { FilterBuilderModule } from './lib/filter-builder.module';

// Components
export { FilterBuilderComponent } from './lib/filter-builder/filter-builder.component';
export { FilterGroupComponent } from './lib/filter-group/filter-group.component';
export { FilterRuleComponent } from './lib/filter-rule/filter-rule.component';

// Types
export {
  FilterFieldType,
  FilterFieldInfo,
  FilterValueOption,
  FilterBuilderConfig,
  FilterSource,
  CreateEmptyFilter,
  CreateFilterRule
} from './lib/types/filter.types';

// Operators
export {
  OperatorInfo,
  STRING_OPERATORS,
  NUMBER_OPERATORS,
  BOOLEAN_OPERATORS,
  DATE_OPERATORS,
  LOOKUP_OPERATORS,
  GetOperatorsForType,
  GetOperatorInfo,
  OperatorRequiresValue
} from './lib/types/operators';
