/**
 * @module @memberjunction/predictive-studio-forecast-sidecar
 *
 * Self-managing TypeScript wrapper for the Predictive Studio FORECAST sidecar — a second Python
 * service running Google's TimesFM. It is separate from the tabular sidecar on purpose: torch is
 * hundreds of megabytes and TimesFM needs Python >=3.10, while the tabular service targets 3.9+
 * with a numpy/pandas pin chosen for the xgboost/lightgbm wheels.
 *
 * The request/response types are owned by `@memberjunction/predictive-studio-core`; import them
 * from there rather than from here.
 */
export { ForecastSidecar } from './forecast-sidecar.js';
export type { ForecastSidecarOptions } from './forecast-sidecar.js';
