/**
 * @module @memberjunction/predictive-studio-sidecar
 *
 * Self-managing TypeScript wrapper for the Predictive Studio Python ML sidecar.
 * Spawns the bundled FastAPI microservice as a child process (managed mode) or
 * connects to a remote/containerized instance (remote mode), then exchanges the
 * `/train` + `/predict` + `/health` contract over HTTP.
 *
 * The request/response types are owned by `@memberjunction/predictive-studio-core`
 * and are re-exported by consumers from there — not from this package.
 */
export { MLSidecar, SidecarError } from './ml-sidecar.js';
export type { MLSidecarOptions, SidecarHealthResponse } from './ml-sidecar.js';
