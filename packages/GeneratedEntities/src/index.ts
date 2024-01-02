export * from './generated/entity_subclasses'

/**
 * This function is used to force the generated entities to be loaded. This is necessary because of the way that tree shaking works in webpack.
 * If you don't import this function and execute it, then the generated entities will not be included in the build. This is because the entities are not directly
 * referenced in this file, so webpack doesn't know that they are needed. By importing this function and calling it, webpack will include the generated entities
 * in the build.
 * 
 * @export
 * @returns {void}
 * @example
 * import { LoadGeneratedEntities } from 'mj_core'
 * LoadGeneratedEntities()
 */
export function LoadGeneratedEntities() {
} 