/**
 * @module monitoring
 *
 * Predictive Studio monitoring (M6): the per-model monitoring job driver and its steps (the outcome join, the period
 * evaluation, the challenger, the rollback), their production collaborators, and the hourly registry check.
 */
export * from './monitoring-seams';
export * from './monitoring-periods';
export * from './period-evaluation';
export * from './outcome-join';
export * from './challenger-step';
export * from './rollback-step';
export * from './monitoring-store';
export * from './monitoring-driver';

import { PredictiveStudioModelMonitoringJobDriver } from './monitoring-driver';

/**
 * Tree-shaking anchor — call from a server bootstrap to keep the `@RegisterClass(BaseScheduledJob, …)` registrations
 * of the monitoring drivers.
 */
export function LoadPredictiveStudioMonitoringDrivers(): void {
  void PredictiveStudioModelMonitoringJobDriver;
}
