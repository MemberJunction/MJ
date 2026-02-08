/**
 * @memberjunction/ng-forms
 *
 * Modern form components for rendering and editing MemberJunction entity records.
 * Provides configurable toolbar, inline-editing fields, collapsible panels with
 * IS-A inheritance support, and event-driven navigation.
 *
 * Zero Explorer dependencies - usable in any Angular application.
 *
 * **PrimeNG dependency**: This package uses PrimeNG in unstyled mode for advanced
 * widgets (AutoComplete, Select, DatePicker). Add `primeng: 21.1.1` to your
 * project's dependencies and configure unstyled mode in your app config.
 */

// Module
export * from './module';

// Types and interfaces
export * from './lib/types/form-types';
export * from './lib/types/navigation-events';
export * from './lib/types/toolbar-config';
export * from './lib/types/form-events';

// Components
export * from './lib/toolbar/form-toolbar.component';
export * from './lib/field/form-field.component';
export * from './lib/panel/collapsible-panel.component';
export * from './lib/container/record-form-container.component';
