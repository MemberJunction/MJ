/**
 * @fileoverview Public API surface of `@memberjunction/tours-server`.
 * Zero re-exports between packages (`AGENTS.md` Rule #5).
 * @module @memberjunction/tours-server
 */

import './entities/MJTourVersionEntityServer.js';
import './entities/MJTourStepEntityServer.js';
import './entities/MJTourEntityServer.js';
import './predicates/standard-server-predicates.js';
import './operations/tour-remote-operations.js';
import './actions/tour-actions.js';

export * from './validation/config-schema-validator.js';
export * from './services/tour-publisher.service.js';
export * from './services/tour-actions.service.js';
export * from './entities/MJTourVersionEntityServer.js';
export * from './entities/MJTourStepEntityServer.js';
export * from './entities/MJTourEntityServer.js';
export * from './predicates/base-tour-server-predicate.js';
export * from './predicates/standard-server-predicates.js';
export * from './operations/tour-remote-operations.js';
export * from './actions/tour-actions.js';

let _toursServerLoaded = false;

/**
 * Tree-shaking anchor guaranteeing all `@RegisterClass` server entity subclasses,
 * Remote Operations, server predicates, and Actions in `@memberjunction/tours-server`
 * are retained and registered at server startup.
 */
export function LoadToursServer(): void {
    _toursServerLoaded = true;
}

export function IsToursServerLoaded(): boolean {
    return _toursServerLoaded;
}
