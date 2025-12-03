/**
 * @fileoverview Public API surface for @memberjunction/ng-timeline
 *
 * This module exports all public types, classes, and components for the
 * MJ Timeline component. The component works with both MemberJunction
 * BaseEntity objects and plain JavaScript objects.
 *
 * @packageDocumentation
 */

// Core types and interfaces
export * from './lib/types';

// Event interfaces (BeforeX/AfterX pattern)
export * from './lib/events';

// TimelineGroup class
export * from './lib/timeline-group';

// Component and Module
export * from './lib/component/timeline.component';
export * from './lib/module';
