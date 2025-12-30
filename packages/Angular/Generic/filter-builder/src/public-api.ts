/**
 * @memberjunction/ng-filter-builder
 *
 * A modern, intuitive filter builder component for Angular applications.
 * Creates complex boolean filter expressions with Kendo-compatible JSON output.
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
  FilterOperator,
  FilterLogic,
  FilterFieldType,
  FilterDescriptor,
  CompositeFilterDescriptor,
  FilterFieldInfo,
  FilterValueOption,
  FilterBuilderConfig,
  isCompositeFilter,
  isSimpleFilter,
  createEmptyFilter,
  createFilterRule
} from './lib/types/filter.types';

// Operators
export {
  OperatorInfo,
  STRING_OPERATORS,
  NUMBER_OPERATORS,
  BOOLEAN_OPERATORS,
  DATE_OPERATORS,
  LOOKUP_OPERATORS,
  getOperatorsForType,
  getOperatorInfo,
  operatorRequiresValue
} from './lib/types/operators';
