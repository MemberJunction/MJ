/**
 * @fileoverview Public API Surface of @memberjunction/ng-react
 * This file exports all public APIs from the Angular React integration library.
 * @module @memberjunction/ng-react
 */

// Module
export * from './lib/module';

// Components
export * from './lib/components/mj-react-component.component';

// Services
export * from './lib/services/script-loader.service';
export * from './lib/services/react-bridge.service';
export * from './lib/services/angular-adapter.service';

// Constants
export * from './lib/default-styles';

// Re-export useful types from react-runtime for convenience
export { 
  ComponentProps,
  ComponentCallbacks,
  ComponentStyles,
  ComponentError,
  CompileOptions,
  CompilationResult
} from '@memberjunction/react-runtime';