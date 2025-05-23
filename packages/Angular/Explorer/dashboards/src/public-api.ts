/*
 * Public API Surface of dashboards
 */

import { LoadHelloDashboard } from './demo/hello-dashboard.component';
import { LoadEntityAdminDashboard } from './EntityAdmin/entity-admin-dashboard.component';

// Base Dashboard
export * from './generic/base-dashboard';

// Dashboards
export * from './demo/hello-dashboard.component';
export * from './EntityAdmin/entity-admin-dashboard.component';

// Module
export * from './module';

LoadHelloDashboard(); // call tree shaking function to prevent tree shaking
LoadEntityAdminDashboard(); // call tree shaking function to prevent tree shaking