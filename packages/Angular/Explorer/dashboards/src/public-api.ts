/*
 * Public API Surface of dashboards
 */

import { LoadHelloDashboard } from './public-api';

// Base Dashboard
export * from './generic/base-dashboard';

// Dashboards
export * from './demo/hello-dashboard.component';

// Module
export * from './module';

LoadHelloDashboard(); // call tree shaking function to prevent tree shaking