/*
 * Public API Surface of dashboards
 */

import { LoadEntityAdminDashboard } from './EntityAdmin/entity-admin-dashboard.component';
import { LoadAIDashboard } from './AI/ai-dashboard.component';
import { LoadActionsManagementDashboard } from './Actions';
import { LoadComponentStudioDashboard } from './ComponentStudio/component-studio-dashboard.component';
import { LoadSchedulingDashboard } from './Scheduling/scheduling-dashboard.component';

// Base Dashboard
export * from './generic/base-dashboard';
export * from './generic/interactive-dashboard.component';

// Dashboards
export * from './EntityAdmin/entity-admin-dashboard.component';
export * from './AI/ai-dashboard.component';
export * from './Actions';
export * from './ComponentStudio';
export * from './Scheduling/scheduling-dashboard.component';

export * from './Actions/index';

// Module
export * from './module';

LoadEntityAdminDashboard(); // call tree shaking function to prevent tree shaking
LoadAIDashboard(); // call tree shaking function to prevent tree shaking
LoadActionsManagementDashboard(); // call tree shaking function to prevent tree shaking
LoadComponentStudioDashboard(); // call tree shaking function to prevent tree shaking
LoadSchedulingDashboard(); // call tree shaking function to prevent tree shaking