# Pending Entity Custom Forms Documentation

## Overview

This document outlines specifications for custom forms that should be created for significant MemberJunction entities. These forms follow the modern design patterns established in the AI Prompts and AI Agents custom forms, emphasizing clean layouts, intuitive organization, and enhanced user experience.

## Design Principles

1. **Single-Pane Layout**: Use Kendo PanelBar for organizing sections
2. **Gradient Headers**: Subtle gradients with entity-specific icons
3. **Card-Based Related Entities**: Modern card interface for relationships
4. **Consistent Color Palette**: Follow established status colors
5. **Responsive Design**: Mobile-friendly with proper breakpoints
6. **Real-Time Updates**: Include refresh capabilities where appropriate
7. **Empty States**: Clear messaging with actionable buttons

## High Priority Custom Forms

### 1. Users Form

**Purpose**: Comprehensive user management interface for administrators and user self-service.

**Header Section**:
- User avatar/icon (fa-user-circle)
- Full name prominently displayed
- Email and status badges
- Last login timestamp
- Active/Inactive toggle

**Main Panels**:

1. **Account Information** (fa-id-card)
   - Basic fields: First Name, Last Name, Email, Title, Company
   - Password management section with strength indicator
   - Two-factor authentication setup
   - Login history preview (last 5 logins)

2. **Roles & Permissions** (fa-shield-halved)
   - Role assignment with drag-drop between Available/Assigned lists
   - Permission matrix visualization
   - Effective permissions calculator
   - Copy permissions from another user button

3. **Applications Access** (fa-grid)
   - Grid of application cards showing access status
   - Quick toggle for app access
   - Default application selector
   - Application-specific settings

4. **Preferences & Settings** (fa-cog)
   - Theme selection
   - Notification preferences
   - Default dashboard selection
   - Language/locale settings

5. **Activity & Audit** (fa-history)
   - Recent actions timeline
   - Login history with locations
   - Permission change history
   - Data access audit trail

**Special Features**:
- Impersonate user button (admin only)
- Send password reset email
- Export user data (GDPR compliance)
- Bulk operations for admins

**Related Entities Display**:
- User Roles (with role descriptions)
- User Application Access
- User Preferences
- Recent User Notifications
- Owned Dashboards/Reports

---

### 2. Dashboards Form

**Purpose**: Visual dashboard designer with live preview and widget management.

**Header Section**:
- Dashboard icon (fa-chart-line)
- Name with inline editing
- Category badge
- Owner information
- Published/Draft status

**Main Panels**:

1. **Dashboard Configuration** (fa-sliders)
   - Name, Description, Category
   - Refresh interval settings
   - Cache configuration
   - Access permissions
   - Parameters definition

2. **Layout Designer** (fa-th)
   - Visual grid layout editor
   - Drag-drop widget placement
   - Responsive breakpoint preview
   - Layout templates gallery
   - Undo/redo functionality

3. **Widgets** (fa-puzzle-piece)
   - Available widgets library (searchable)
   - Widget configuration panel
   - Data source mapping
   - Widget-specific settings
   - Custom widget code editor

4. **Data Sources** (fa-database)
   - Connected entities/views
   - API endpoints configuration
   - Real-time data connections
   - Data refresh policies
   - Query builder interface

5. **Preview & Testing** (fa-eye)
   - Live preview panel
   - Device size simulator
   - Parameter testing inputs
   - Performance metrics
   - Share preview link

**Special Features**:
- Split view (configuration/preview)
- Widget library with categories
- Import/export dashboard definitions
- Version history with rollback
- Collaboration features (comments)

**Related Entities Display**:
- Dashboard Categories (hierarchical)
- Dashboard Widgets (sortable list)
- Dashboard Runs (execution history)
- User Dashboard States
- Dashboard Snapshots

---

### 3. Reports Form

**Purpose**: Comprehensive report builder with parameter management and scheduling.

**Header Section**:
- Report icon (fa-file-lines)
- Report name and type badge
- Category breadcrumb
- Run status indicator
- Last run timestamp

**Main Panels**:

1. **Report Definition** (fa-code)
   - Report type selector (SQL, Entity-based, Custom)
   - Query builder/SQL editor with syntax highlighting
   - Entity relationship mapper
   - Calculated fields designer
   - Filters and sorting configuration

2. **Parameters** (fa-list-check)
   - Parameter definition grid
   - Parameter types and validation
   - Default values configuration
   - Dynamic parameter sources
   - Parameter dependencies

3. **Output Configuration** (fa-file-export)
   - Output formats (PDF, Excel, CSV, JSON)
   - Template selection/upload
   - Formatting rules
   - Headers/footers configuration
   - Branding options

4. **Scheduling & Distribution** (fa-clock)
   - Schedule configuration (cron-style)
   - Email distribution lists
   - Conditional execution rules
   - Retention policies
   - Notification settings

5. **Execution History** (fa-history)
   - Recent runs timeline
   - Success/failure metrics
   - Average execution time
   - Output file browser
   - Error log viewer

**Special Features**:
- SQL query validator
- Sample data preview
- Parameter test panel
- Report comparison tool
- Subscription management

**Related Entities Display**:
- Report Categories (tree view)
- Report Snapshots (version history)
- Report Executions (with status)
- Report Subscriptions
- Related Dashboards

---

### 4. Applications Form

**Purpose**: Central hub for application configuration and entity management.

**Header Section**:
- App icon selector
- Application name and version
- Status indicator (Active/Maintenance/Disabled)
- User count badge
- API endpoint display

**Main Panels**:

1. **Application Settings** (fa-gear)
   - Basic info: Name, Description, Icon
   - Version management
   - Environment configuration
   - Feature flags/toggles
   - API keys management

2. **Entity Management** (fa-database)
   - Entity assignment interface
   - Drag-drop between Available/Assigned
   - Entity group management
   - Custom entity creation
   - Entity permissions matrix

3. **Navigation & Menus** (fa-bars)
   - Menu structure builder
   - Drag-drop menu items
   - Icon selection
   - Permission-based visibility
   - Custom menu actions

4. **Security & Access** (fa-lock)
   - Authentication methods
   - SSO configuration
   - Role mappings
   - IP restrictions
   - Session policies

5. **Deployment & Monitoring** (fa-rocket)
   - Deployment status
   - Health checks configuration
   - Performance metrics
   - Error tracking
   - Usage analytics

**Special Features**:
- Application preview launcher
- Bulk entity operations
- Configuration export/import
- Multi-environment management
- Application cloning

**Related Entities Display**:
- Application Entities (grouped)
- Application Settings
- User Application Access
- Application Features
- Integration Configurations

---

### 5. Workflows Form

**Purpose**: Visual workflow designer with node-based editing and execution monitoring.

**Header Section**:
- Workflow type icon
- Name with version badge
- Status indicator (Active/Draft/Disabled)
- Execution count
- Average duration

**Main Panels**:

1. **Workflow Designer** (fa-project-diagram)
   - Visual node editor (flowchart style)
   - Drag-drop workflow blocks
   - Connection drawing tools
   - Zoom/pan controls
   - Mini-map navigation
   - Property inspector panel

2. **Workflow Blocks** (fa-cubes)
   - Block library (categorized)
   - Custom block creator
   - Block configuration panel
   - Input/output mapping
   - Error handling settings

3. **Parameters & Variables** (fa-variable)
   - Workflow parameters definition
   - Global variables management
   - Data type configuration
   - Variable scope visualization
   - Expression builder

4. **Triggers & Schedule** (fa-bolt)
   - Trigger type selection
   - Event-based triggers
   - Schedule configuration
   - Manual execution options
   - Trigger conditions

5. **Execution Monitor** (fa-chart-simple)
   - Real-time execution view
   - Step-by-step debugger
   - Variable inspector
   - Error diagnostics
   - Performance profiler

**Special Features**:
- Workflow versioning
- A/B testing capabilities
- Workflow templates library
- Import from BPMN/other formats
- Collaborative editing

**Related Entities Display**:
- Workflow Engine configuration
- Workflow Runs (with status)
- Workflow Run Details (drill-down)
- Error Logs
- Related Automations

---

### 6. AI Models Form

**Purpose**: Comprehensive AI model configuration with provider management and cost tracking.

**Header Section**:
- Model icon based on type
- Model name with provider badge
- Status indicator
- Token limits display
- Cost per token badges

**Main Panels**:

1. **Model Configuration** (fa-brain)
   - Model selection dropdown
   - Provider configuration
   - API key management (encrypted)
   - Endpoint URLs
   - Model-specific parameters

2. **Capabilities & Limits** (fa-gauge)
   - Token limits (input/output)
   - Supported features toggles
   - Response format options
   - Streaming capability
   - Function calling support
   - Context window size

3. **Cost Management** (fa-dollar-sign)
   - Cost per token display
   - Usage tracking charts
   - Budget alerts configuration
   - Cost projection calculator
   - Department/project allocation

4. **Performance Tuning** (fa-sliders)
   - Temperature controls
   - Top-p/Top-k settings
   - Frequency/presence penalties
   - Max tokens configuration
   - Stop sequences
   - Custom parameters

5. **Testing Console** (fa-terminal)
   - Interactive prompt tester
   - Response preview
   - Token counter
   - Latency measurements
   - A/B testing interface

**Special Features**:
- Model comparison tool
- Fallback model configuration
- Load balancing settings
- Rate limit monitoring
- Model deprecation warnings

**Related Entities Display**:
- AI Vendors (with status)
- AI Model Types
- AI Configurations
- Usage Statistics
- Cost History

---

### 7. Roles & Authorizations Form

**Purpose**: Intuitive role-based access control with visual permission management.

**Header Section**:
- Shield icon (fa-shield)
- Role name with type badge
- User count indicator
- Inheritance display
- Active/inactive status

**Main Panels**:

1. **Role Definition** (fa-id-badge)
   - Name, description, type
   - Parent role selection
   - Priority/precedence setting
   - Activation conditions
   - Expiration policies

2. **Permission Matrix** (fa-table-cells)
   - Entity/action grid interface
   - Bulk permission toggle
   - Permission inheritance view
   - Override indicators
   - Search/filter capabilities

3. **Authorization Rules** (fa-gavel)
   - Rule builder interface
   - Conditional permissions
   - Time-based restrictions
   - Location-based rules
   - Custom SQL conditions

4. **Users & Groups** (fa-users)
   - Assigned users list
   - Group assignments
   - Bulk user operations
   - Effective permissions preview
   - Assignment history

5. **Audit & Compliance** (fa-clipboard-check)
   - Permission change log
   - Compliance reports
   - Access reviews scheduler
   - Certification tracking
   - Anomaly detection

**Special Features**:
- Permission simulator
- Role comparison tool
- Bulk permission copy
- Template roles library
- Visual permission tree

**Related Entities Display**:
- Authorizations (grouped by type)
- User Roles (with users)
- Role Applications
- Audit Logs
- Related Policies

---

### 8. Companies Form

**Purpose**: Multi-tenant company management with integration configuration.

**Header Section**:
- Company logo upload
- Company name and domain
- Status badges
- User count
- Storage usage meter

**Main Panels**:

1. **Company Profile** (fa-building)
   - Basic information fields
   - Logo/branding upload
   - Address management
   - Contact information
   - Industry classification

2. **Configuration** (fa-cogs)
   - Feature toggles grid
   - Custom settings JSON editor
   - Theme customization
   - Email templates
   - Localization settings

3. **Integrations Hub** (fa-plug)
   - Available integrations grid
   - Connection status dashboard
   - OAuth configurations
   - Webhook management
   - API usage metrics

4. **Data Management** (fa-database)
   - Storage allocation
   - Data retention policies
   - Backup configuration
   - Export/import tools
   - GDPR compliance tools

5. **Billing & Licensing** (fa-credit-card)
   - Subscription details
   - License allocation
   - Usage metrics
   - Invoice history
   - Payment methods

**Special Features**:
- Company switcher (for admins)
- Sandbox environment toggle
- White-label configuration
- Custom domain setup
- Company cloning tool

**Related Entities Display**:
- Company Users (with roles)
- Company Integrations
- Storage Providers
- Activity Logs
- Billing History

---

### 9. Communication Providers Form

**Purpose**: Unified communication channel configuration with testing capabilities.

**Header Section**:
- Provider type icon
- Provider name and type
- Connection status LED
- Message count badges
- Last activity timestamp

**Main Panels**:

1. **Provider Configuration** (fa-gear)
   - Provider type selection
   - Authentication setup
   - API credentials (encrypted)
   - Endpoint configuration
   - Rate limit settings

2. **Message Templates** (fa-envelope)
   - Template library
   - Rich text editor
   - Variable insertion
   - Preview renderer
   - A/B test variants

3. **Delivery Settings** (fa-paper-plane)
   - Send policies
   - Retry configuration
   - Bounce handling
   - Unsubscribe management
   - Delivery tracking

4. **Testing Console** (fa-vial)
   - Test message sender
   - Delivery simulator
   - Error injection
   - Performance testing
   - Webhook tester

5. **Analytics Dashboard** (fa-chart-line)
   - Delivery metrics
   - Open/click rates
   - Bounce analysis
   - Provider comparison
   - Cost tracking

**Special Features**:
- Provider health monitor
- Failover configuration
- Template preview (multi-device)
- Bulk testing tools
- Provider migration wizard

**Related Entities Display**:
- Message Templates
- Delivery Logs
- Bounce Records
- Provider Costs
- Campaign Statistics

---

### 10. Queues Form

**Purpose**: Advanced queue management with real-time monitoring and task control.

**Header Section**:
- Queue type icon
- Queue name and status
- Task count badges (pending/processing/completed)
- Processing rate gauge
- Health indicator

**Main Panels**:

1. **Queue Configuration** (fa-cog)
   - Queue type and settings
   - Concurrency limits
   - Retry policies
   - Timeout configuration
   - Priority settings

2. **Task Monitor** (fa-tasks)
   - Real-time task list
   - Status filters
   - Task detail viewer
   - Bulk task operations
   - Error task management

3. **Performance Metrics** (fa-tachometer-alt)
   - Processing rate charts
   - Queue depth graph
   - Success/failure rates
   - Average processing time
   - Resource utilization

4. **Workers & Scaling** (fa-server)
   - Worker status grid
   - Auto-scaling rules
   - Resource allocation
   - Load balancing config
   - Health checks

5. **Dead Letter Queue** (fa-exclamation-triangle)
   - Failed task browser
   - Error analysis
   - Retry interface
   - Task editor
   - Purge controls

**Special Features**:
- Task dependency viewer
- Queue pause/resume
- Priority boost controls
- Task replay functionality
- Queue migration tools

**Related Entities Display**:
- Queue Tasks (filtered views)
- Queue Types
- Worker Logs
- Performance History
- Related Workflows

---

### 11. Actions Form

**Purpose**: Code automation interface with AI-powered generation and approval workflows.

**Header Section**:
- Action type icon (fa-bolt)
- Action name with category badge
- Status indicator (Draft/Pending/Approved/Rejected)
- Code type badge (SQL/JavaScript/TypeScript)
- Last modified timestamp

**Main Panels**:

1. **Action Definition** (fa-code)
   - Name, Description, Category
   - Type selection (Create/Update/Delete/Custom)
   - Entity association
   - Filter configuration
   - User prompt for AI generation

2. **Code Editor** (fa-file-code)
   - Syntax-highlighted code editor
   - Language selector
   - AI code generation interface
   - Code validation/linting
   - Diff viewer for changes

3. **Parameters & Context** (fa-list)
   - Parameter definition grid
   - Data context configuration
   - Variable mapping
   - Test data inputs
   - Context preview

4. **Approval Workflow** (fa-check-circle)
   - Approval status timeline
   - Reviewer assignments
   - Comments thread
   - Approval/rejection buttons
   - Version comparison

5. **Execution & Testing** (fa-play)
   - Test execution panel
   - Result preview
   - Performance metrics
   - Error console
   - Execution history

**Special Features**:
- AI prompt interface for code generation
- Side-by-side code comparison
- Integrated debugger
- Library import management
- Rollback capabilities

**Related Entities Display**:
- Action Categories (tree view)
- Action Libraries
- Action Authorizations
- Execution History
- Related Filters

---

### 12. Entity Permissions Form

**Purpose**: Granular security configuration with visual permission matrix and RLS management.

**Header Section**:
- Security icon (fa-lock)
- Entity name display
- Permission summary badges
- Inheritance indicator
- Last audit timestamp

**Main Panels**:

1. **Permission Matrix** (fa-table)
   - Role x Permission grid
   - Create/Read/Update/Delete toggles
   - Bulk permission operations
   - Permission inheritance view
   - Quick templates

2. **Row Level Security** (fa-filter)
   - RLS filter builder
   - SQL condition editor
   - Filter testing interface
   - Performance impact analysis
   - Filter templates

3. **API Access Control** (fa-key)
   - API endpoint permissions
   - Rate limiting configuration
   - IP restrictions
   - API key management
   - OAuth scopes

4. **Audit Configuration** (fa-history)
   - Audit level settings
   - Field-level auditing
   - Retention policies
   - Audit triggers
   - Compliance settings

5. **Security Testing** (fa-shield-halved)
   - Permission simulator
   - User impersonation test
   - Access path analyzer
   - Vulnerability scanner
   - Compliance checker

**Special Features**:
- Visual permission inheritance tree
- Bulk copy permissions tool
- Security recommendation engine
- Permission conflict detector
- Role comparison matrix

**Related Entities Display**:
- Roles (with user counts)
- Entity Fields (for field-level security)
- Audit Logs
- API Access Logs
- Security Violations

---

### 13. Templates Form

**Purpose**: Dynamic content management with version control and AI-powered generation.

**Header Section**:
- Template icon (fa-file-lines)
- Template name with type
- Active/Inactive status
- Version badge
- Usage count

**Main Panels**:

1. **Template Configuration** (fa-cog)
   - Name, Description, Category
   - Type selection
   - Active date range
   - Priority settings
   - User prompt configuration

2. **Content Editor** (fa-edit)
   - Multi-tab editor for content blocks
   - Markdown/HTML/Text modes
   - Variable insertion toolbar
   - Preview pane
   - Template syntax highlighting

3. **Content Blocks** (fa-layer-group)
   - Block management grid
   - Drag-drop reordering
   - Block-specific settings
   - Conditional logic
   - Reusable components

4. **Variables & Data** (fa-database)
   - Variable definition
   - Data source mapping
   - Sample data editor
   - Variable validation
   - Expression builder

5. **Preview & Testing** (fa-eye)
   - Live preview renderer
   - Multiple format preview
   - Test data scenarios
   - Output validation
   - Performance metrics

**Special Features**:
- AI content generation interface
- Version control with diff viewer
- Template inheritance
- Multi-language support
- Export/import functionality

**Related Entities Display**:
- Template Categories
- Template Contents (all blocks)
- Template Variables
- Usage History
- Related Actions

---

### 14. Data Contexts Form

**Purpose**: Query collection management for AI agents and system integrations.

**Header Section**:
- Context icon (fa-database)
- Context name and purpose
- Usage frequency badge
- Cache status indicator
- Last refresh timestamp

**Main Panels**:

1. **Context Definition** (fa-info-circle)
   - Name, Description, Purpose
   - Scope configuration
   - Access permissions
   - Cache policies
   - Refresh settings

2. **Query Builder** (fa-search)
   - Visual query designer
   - Entity relationship mapper
   - Filter configuration
   - Join builder
   - SQL preview

3. **Context Items** (fa-list)
   - Item management grid
   - Query/view selector
   - Parameter mapping
   - Execution order
   - Dependencies

4. **Testing Console** (fa-terminal)
   - Query execution interface
   - Result preview
   - Performance profiler
   - Parameter testing
   - Cache behavior

5. **Usage Analytics** (fa-chart-bar)
   - Usage frequency charts
   - Performance metrics
   - Consumer breakdown
   - Query optimization tips
   - Cost analysis

**Special Features**:
- AI agent integration wizard
- Query optimization assistant
- Batch testing tools
- Context cloning
- Version management

**Related Entities Display**:
- Data Context Items
- Related Queries/Views
- Consumer Entities (AI Agents, etc.)
- Execution History
- Cache Statistics

---

## Implementation Guidelines

### Component Reusability

1. **Entity Card Component**: Reusable card for displaying related entities
2. **Status Badge Component**: Consistent status indicators
3. **Metric Display Component**: Standardized metric visualization
4. **Permission Grid Component**: Reusable permission matrix
5. **Timeline Component**: Activity/history display

### Common Patterns

1. **Header Gradients**: Use entity-specific color gradients
2. **Icon Consistency**: FontAwesome icons throughout
3. **Loading States**: Spinner with contextual messages
4. **Error Handling**: Toast notifications with retry options
5. **Empty States**: Informative with action buttons

### Performance Considerations

1. **Lazy Loading**: Load panels on demand
2. **Virtual Scrolling**: For large lists
3. **Debounced Inputs**: For search/filter fields
4. **Caching Strategy**: Use shareReplay for static data
5. **Batch Operations**: Group related API calls

### Accessibility

1. **Keyboard Navigation**: Full keyboard support
2. **Screen Reader**: Proper ARIA labels
3. **Color Contrast**: WCAG AA compliance
4. **Focus Management**: Clear focus indicators
5. **Error Announcements**: Screen reader friendly

## Priority Order

### Phase 1 (Immediate)
1. Users Form
2. Dashboards Form
3. AI Models Form
4. Applications Form

### Phase 2 (Next Sprint)
5. Reports Form
6. Workflows Form
7. Roles & Authorizations Form
8. Actions Form
9. Entity Permissions Form

### Phase 3 (Following Sprint)
10. Companies Form
11. Communication Providers Form
12. Queues Form
13. Templates Form
14. Data Contexts Form

## Testing Requirements

Each form should include:
1. Unit tests for component logic
2. Integration tests for data operations
3. E2E tests for critical workflows
4. Accessibility tests
5. Performance benchmarks

## Conclusion

These 14 custom forms represent the most critical entities in MemberJunction that would benefit from enhanced user interfaces beyond the auto-generated forms. Each form specification follows the modern design patterns established in the AI Prompts and AI Agents forms, ensuring consistency across the platform.

The phased implementation approach prioritizes the most frequently used and business-critical entities first, while the detailed specifications provide clear guidance for developers to create these forms efficiently. The emphasis on reusable components and consistent patterns will accelerate development and ensure a cohesive user experience throughout MemberJunction.

By implementing these custom forms, MemberJunction will provide users with intuitive, powerful interfaces for managing complex system configurations, improving productivity and reducing errors in critical operations.