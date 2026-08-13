export * from './PlaySessionRules.js';
export * from './GameNightIndexes.js';
export * from './GameNightMetadataEngine.js';
export * from './GameNightPlaySessionEntity.js';

/**
 * Tree-shaking guard.
 *
 * `GameNightPlaySessionEntity` is only ever reached through `ClassFactory`, so no bundler can see a
 * reference to it. Without a static import that survives, the module is eliminated, the
 * `@RegisterClass` decorator never executes, and every `GetEntityObject('Play Sessions')` silently
 * returns the *generated* class with none of the business rules. Call this once from your app's
 * bootstrap to force the module to load.
 */
export function LoadGameNightEntities(): void {
    // intentionally empty — importing this module is the point
}
