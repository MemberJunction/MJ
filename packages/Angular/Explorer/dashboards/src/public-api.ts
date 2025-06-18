/*
 * Public API Surface of dashboards
 */

import { LoadEntityAdminDashboard } from './EntityAdmin/entity-admin-dashboard.component';
import { LoadAIDashboard } from './AI/ai-dashboard.component';
import { LoadActionsManagementDashboard } from './Actions';

// Base Dashboard
export * from './generic/base-dashboard';

// Dashboards
export * from './EntityAdmin/entity-admin-dashboard.component';
export * from './AI/ai-dashboard.component';
export * from './Actions';

export * from './Actions/index';

// Module
export * from './module';

LoadEntityAdminDashboard(); // call tree shaking function to prevent tree shaking
LoadAIDashboard(); // call tree shaking function to prevent tree shaking
LoadActionsManagementDashboard(); // call tree shaking function to prevent tree shaking