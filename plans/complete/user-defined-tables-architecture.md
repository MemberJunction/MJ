# User-Defined Tables Architecture

## Executive Summary

This document outlines the architecture for adding "user-defined tables" functionality to MemberJunction - a lightweight, Airtable-like capability that allows business users to create database tables through a conversational UI without manual DBA intervention.

**Key Decision**: Use the **full MemberJunction workflow** (SQL → CodeGen → Compile → Deploy → Restart) but make it **fully automated** and **agent-orchestrated**. This preserves architectural integrity while providing a great user experience.

**Timeline**: User creates table → 1-2 minutes → Table fully operational with all MJ features

---

## Problem Statement

Business users need lightweight tables for:
- Attendee lists from events
- Data from SaaS integrations (Typeform, surveys, etc.)
- Quick data tracking and collaboration
- Experimental schemas before formal entity design

**Current State**: Creating new entities requires:
1. Developer writes SQL migration
2. Manual CodeGen execution
3. Manual build/compile
4. Manual deployment
5. Manual server restart
6. Days/weeks of lead time

**Desired State**: User describes table in natural language → System creates it automatically → Ready in 1-2 minutes

---

## Architecture Overview

### High-Level Flow

```
User Conversation (Skip Agent)
    ↓
Table Definition Extraction
    ↓
DDL Generation
    ↓
MJCodeGenAPI: Execute DDL (elevated permissions)
    ↓
MJCodeGenAPI: Run CodeGen (full mode)
    ↓
Build System: Compile Affected Packages
    ↓
Deployment: Push to Azure Instances
    ↓
API Server: Graceful Restart
    ↓
Angular UI: Auto-detect & Refresh
    ↓
User: Table Ready with Full Features
```

### Key Principle

**No compromises on architecture.** User-defined tables are **first-class MJ entities** that:
- Have real SQL Server tables
- Have full Entity/EntityField metadata
- Have generated TypeScript classes
- Have generated GraphQL resolvers
- Have generated Angular components
- Support all MJ features (permissions, audit, relationships)

The only difference: **Creation is automated, not manual**.

---

## Detailed Component Design

### 1. Conversational Table Designer (Agent-Based)

**Location**: Skip Brain / MJ Explorer UI

**User Experience**:
```
User: "I need to track attendees for our monthly meetups"

Agent: "I'll help you create an attendee tracking table. Let me ask a few questions:

What information do you want to track for each attendee?
- Name (required)
- Email (required)
- Company
- Attendance Date
- RSVP Status
- Notes

Does this look right? I'll create a table called 'Meetup Attendees'
with these fields."

User: "Yes, and add a field for dietary restrictions"

Agent: "Great! Creating your table now. This will take about 1-2 minutes.
I'll notify you when it's ready.

[Progress UI appears]"
```

**Agent Responsibilities**:
- Extract table structure from natural language
- Ask clarifying questions (field types, required fields, relationships)
- Validate table/field names (SQL-safe, not conflicting)
- Generate `UserTableDefinition` object
- Invoke `UserTablePipeline` API
- Monitor progress and update user

**Implementation**: Use existing MJ Agent Framework (`@memberjunction/ai`)
- New agent type: `TableDesignerAgent`
- Long-running task support (already exists)
- Progress streaming via WebSocket/SSE

### 2. User Table Definition Schema

**TypeScript Interface**:
```typescript
interface UserTableDefinition {
    Name: string;                    // Table name (e.g., "MeetupAttendees")
    Description: string;             // User-friendly description
    OwnerUserID: string;            // Creator
    Fields: UserFieldDefinition[];
    Icon?: string;                   // Font Awesome icon
    Category?: string;               // Grouping/organization
}

interface UserFieldDefinition {
    Name: string;                    // Field name (SQL-safe)
    DisplayName: string;             // UI label
    Description?: string;            // Help text
    DataType: UserFieldType;         // See enum below
    Length?: number;                 // For strings
    Precision?: number;              // For decimals
    Scale?: number;                  // For decimals
    IsRequired: boolean;
    DefaultValue?: string;
    RelatedTable?: string;           // For foreign keys
    RelatedField?: string;           // Usually 'ID'
    Sequence: number;                // Display order
}

enum UserFieldType {
    String = 'String',
    Integer = 'Integer',
    Decimal = 'Decimal',
    Date = 'Date',
    DateTime = 'DateTime',
    Boolean = 'Boolean',
    Reference = 'Reference',         // Foreign key
    Text = 'Text',                   // Long text (NVARCHAR(MAX))
    UniqueIdentifier = 'UniqueIdentifier'
}
```

### 3. User Table Pipeline (Core Orchestrator)

**Location**: New package `@memberjunction/user-tables`

**Class Structure**:
```typescript
class UserTablePipeline {
    private codeGenAPI: CodeGenAPIClient;
    private buildService: BuildService;
    private deploymentService: DeploymentService;
    private progressTracker: ProgressTracker;

    async createTable(
        definition: UserTableDefinition,
        contextUser: UserInfo
    ): Promise<UserTableResult> {

        const taskId = uuid();

        try {
            // Stage 1: Generate DDL
            this.progressTracker.emit(taskId, 'ddl', 'Generating database schema...');
            const ddl = await this.generateDDL(definition);

            // Stage 2: Execute DDL
            this.progressTracker.emit(taskId, 'execute', 'Creating database table...');
            await this.codeGenAPI.executeDDL(ddl, contextUser);

            // Stage 3: Run CodeGen
            this.progressTracker.emit(taskId, 'codegen', 'Generating metadata and code...');
            await this.codeGenAPI.runCodeGen({
                targetSchemas: ['custom'],
                mode: 'full'
            });

            // Stage 4: Build affected packages
            this.progressTracker.emit(taskId, 'build', 'Compiling TypeScript packages...');
            await this.buildService.buildPackages([
                '@memberjunction/core-entities',
                '@memberjunction/server',
                '@memberjunction/graphql-server'
            ]);

            // Stage 5: Deploy to Azure
            this.progressTracker.emit(taskId, 'deploy', 'Deploying to API servers...');
            await this.deploymentService.deploy({
                strategy: 'rolling',
                packages: ['core-entities', 'server', 'graphql-server']
            });

            // Stage 6: Wait for health
            this.progressTracker.emit(taskId, 'restart', 'Restarting API servers...');
            await this.waitForHealthy();

            // Stage 7: Complete
            this.progressTracker.emit(taskId, 'complete', 'Table ready!');

            return {
                success: true,
                entityName: `User: ${definition.Name}`,
                tableName: `custom.UD_${definition.Name}`
            };

        } catch (error) {
            this.progressTracker.emit(taskId, 'error', error.message);
            throw error;
        }
    }

    private async generateDDL(def: UserTableDefinition): Promise<string> {
        const tableName = `UD_${def.Name}`;
        let sql = `-- User-Defined Table: ${def.Name}\n`;
        sql += `-- Created by pipeline\n\n`;
        sql += `CREATE TABLE custom.${tableName} (\n`;
        sql += `    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),\n`;

        for (const field of def.Fields) {
            const sqlType = this.getSQLType(field);
            const nullable = field.IsRequired ? 'NOT NULL' : 'NULL';
            const defaultValue = field.DefaultValue ?
                `DEFAULT ${this.formatDefaultValue(field)}` : '';

            sql += `    ${field.Name} ${sqlType} ${nullable} ${defaultValue},\n`;
        }

        // Standard MJ fields
        sql += `    __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),\n`;
        sql += `    __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),\n`;
        sql += `    __mj_DeletedAt DATETIMEOFFSET NULL\n`;
        sql += `);\n\n`;

        // Add extended properties for descriptions
        if (def.Description) {
            sql += `EXEC sp_addextendedproperty `;
            sql += `@name = N'MS_Description', `;
            sql += `@value = N'${def.Description}', `;
            sql += `@level0type = N'SCHEMA', @level0name = N'custom', `;
            sql += `@level1type = N'TABLE', @level1name = N'${tableName}';\n`;
        }

        // Add field descriptions
        for (const field of def.Fields) {
            if (field.Description) {
                sql += `EXEC sp_addextendedproperty `;
                sql += `@name = N'MS_Description', `;
                sql += `@value = N'${field.Description}', `;
                sql += `@level0type = N'SCHEMA', @level0name = N'custom', `;
                sql += `@level1type = N'TABLE', @level1name = N'${tableName}', `;
                sql += `@level2type = N'COLUMN', @level2name = N'${field.Name}';\n`;
            }
        }

        return sql;
    }

    private getSQLType(field: UserFieldDefinition): string {
        switch (field.DataType) {
            case UserFieldType.String:
                return `NVARCHAR(${field.Length || 255})`;
            case UserFieldType.Text:
                return 'NVARCHAR(MAX)';
            case UserFieldType.Integer:
                return 'INT';
            case UserFieldType.Decimal:
                return `DECIMAL(${field.Precision || 18}, ${field.Scale || 2})`;
            case UserFieldType.Date:
                return 'DATE';
            case UserFieldType.DateTime:
                return 'DATETIMEOFFSET';
            case UserFieldType.Boolean:
                return 'BIT';
            case UserFieldType.UniqueIdentifier:
                return 'UNIQUEIDENTIFIER';
            case UserFieldType.Reference:
                return 'UNIQUEIDENTIFIER'; // Foreign key
            default:
                throw new Error(`Unsupported data type: ${field.DataType}`);
        }
    }
}
```

### 4. MJCodeGenAPI Enhancements

**Current State**: Package exists for running CodeGen with elevated permissions

**Enhancements Needed**:

```typescript
// New API endpoints
POST /api/codegen/execute-ddl
POST /api/codegen/run
GET  /api/codegen/status/:taskId

// Enhanced security
interface CodeGenRequest {
    operation: 'execute-ddl' | 'run-codegen';
    ddl?: string;
    options?: CodeGenOptions;
    requestingUserID: string;
    authorization: string; // JWT or API key
}

// Validation
class CodeGenAPIValidator {
    validateDDL(ddl: string): ValidationResult {
        // Ensure only CREATE TABLE/ALTER TABLE
        // Ensure only 'custom' schema
        // Ensure no DROP/TRUNCATE/DELETE
        // Ensure no CREATE USER/GRANT
        // Check for SQL injection patterns
        return { valid: true };
    }
}
```

### 5. Build Service

**Location**: New package `@memberjunction/build-service` or integrate into MJCodeGenAPI

**Purpose**: Fast incremental builds using Turbo cache

```typescript
class BuildService {
    async buildPackages(packages: string[]): Promise<BuildResult> {
        // Use Turbo for cached builds
        const filterArg = packages.map(p => `--filter=${p}`).join(' ');

        const result = await exec(
            `turbo build ${filterArg} --force=false`,
            { cwd: this.repoRoot }
        );

        // With Turbo cache, only changed packages rebuild
        // Typical time: 10-30 seconds for incremental

        return {
            success: result.exitCode === 0,
            duration: result.duration,
            packagesBuilt: this.parsePackages(result.stdout)
        };
    }
}
```

### 6. Deployment Service

**Location**: New package `@memberjunction/deployment-service`

**Purpose**: Deploy compiled code to Azure instances

**Implementation Options**:

**Option A: Azure DevOps API**
```typescript
class AzureDeploymentService {
    async deploy(options: DeployOptions): Promise<void> {
        // Trigger Azure DevOps pipeline
        // Pass parameters: packages, instances, strategy
        // Wait for completion
    }
}
```

**Option B: Direct File Sync**
```typescript
class DirectDeploymentService {
    async deploy(options: DeployOptions): Promise<void> {
        // Use Azure Storage or SCP
        // Copy dist/ folders to instances
        // Signal instances to restart
    }
}
```

**Option C: Docker/Container Refresh**
```typescript
class ContainerDeploymentService {
    async deploy(options: DeployOptions): Promise<void> {
        // Build new container image
        // Push to registry
        // Update Azure Container Instances
        // Rolling restart
    }
}
```

**Recommendation**: Start with Option A (Azure DevOps) for enterprise-grade deployment

### 7. Graceful Restart Strategy

**API Server (Node.js/Express)**:

```typescript
// In MJAPI server
class GracefulRestartHandler {
    async restart(): Promise<void> {
        // 1. Stop accepting new connections
        server.close();

        // 2. Wait for existing requests to complete (max 30s)
        await this.drainConnections(30000);

        // 3. Reload metadata
        await Metadata.Provider.Refresh();

        // 4. Clear require cache for generated modules
        this.clearRequireCache([
            '@memberjunction/core-entities',
            '@memberjunction/server',
            '@memberjunction/graphql-server'
        ]);

        // 5. Restart server
        server.listen(port);

        // 6. Health check endpoint returns 200
    }
}

// Deployment triggers restart via:
POST /admin/restart
Authorization: Bearer {admin-token}
```

**Multiple Instance Strategy**:
```typescript
// Rolling restart across instances
async rollingRestart(instances: string[]): Promise<void> {
    for (const instance of instances) {
        // Take out of load balancer
        await loadBalancer.remove(instance);

        // Wait for draining
        await delay(5000);

        // Restart instance
        await this.restartInstance(instance);

        // Wait for health check
        await this.waitHealthy(instance);

        // Add back to load balancer
        await loadBalancer.add(instance);

        // Brief pause before next
        await delay(2000);
    }
}
```

### 8. Angular Auto-Refresh

**Location**: `@memberjunction/ng-user-tables` (new package)

```typescript
@Injectable()
export class UserTableService {
    private socket: WebSocket;

    async createTable(definition: UserTableDefinition): Promise<void> {
        // Show modal with progress
        const dialogRef = this.dialog.open(TableCreationProgressComponent, {
            data: { definition },
            disableClose: true
        });

        // Start pipeline
        const taskId = await this.http.post('/api/user-tables/create', definition)
            .toPromise();

        // Subscribe to progress events
        this.subscribeToProgress(taskId, dialogRef);
    }

    private subscribeToProgress(taskId: string, dialogRef: MatDialogRef): void {
        this.socket = new WebSocket(`wss://api/progress/${taskId}`);

        this.socket.onmessage = (event) => {
            const progress = JSON.parse(event.data);

            // Update dialog
            dialogRef.componentInstance.updateProgress(progress);

            if (progress.stage === 'complete') {
                // Refresh Angular metadata
                this.metadata.refresh();

                // Close dialog and navigate
                dialogRef.close();
                this.router.navigate(['/tables', progress.entityName]);
            }

            if (progress.stage === 'error') {
                dialogRef.componentInstance.showError(progress.message);
            }
        };
    }
}
```

**Progress UI Component**:
```typescript
@Component({
    selector: 'table-creation-progress',
    template: `
        <h2>Creating "{{ data.definition.Name }}"</h2>

        <div class="progress-stages">
            <div class="stage" [class.active]="currentStage === 'ddl'"
                 [class.complete]="completedStages.includes('ddl')">
                <i class="fa fa-check-circle"></i>
                <span>Database schema created</span>
            </div>

            <div class="stage" [class.active]="currentStage === 'codegen'"
                 [class.complete]="completedStages.includes('codegen')">
                <i class="fa fa-spin fa-spinner"></i>
                <span>Generating metadata...</span>
            </div>

            <div class="stage" [class.active]="currentStage === 'build'"
                 [class.complete]="completedStages.includes('build')">
                <i class="fa fa-cog"></i>
                <span>Compiling code...</span>
            </div>

            <div class="stage" [class.active]="currentStage === 'deploy'"
                 [class.complete]="completedStages.includes('deploy')">
                <i class="fa fa-cloud-upload"></i>
                <span>Deploying...</span>
            </div>

            <div class="stage" [class.active]="currentStage === 'restart'"
                 [class.complete]="completedStages.includes('restart')">
                <i class="fa fa-sync"></i>
                <span>Restarting API...</span>
            </div>
        </div>

        <p class="help-text">This usually takes 1-2 minutes</p>

        <mat-progress-bar mode="indeterminate"></mat-progress-bar>
    `
})
export class TableCreationProgressComponent {
    @Input() data: { definition: UserTableDefinition };
    currentStage: string;
    completedStages: string[] = [];

    updateProgress(progress: ProgressEvent) {
        this.currentStage = progress.stage;
        if (!this.completedStages.includes(progress.stage)) {
            this.completedStages.push(progress.stage);
        }
    }
}
```

---

## Database Schema for User Tables

### Metadata Tables

```sql
-- Tracks user-defined tables
CREATE TABLE [__mj].[UserDefinedTable] (
    [ID] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [EntityID] UNIQUEIDENTIFIER NOT NULL, -- Links to generated Entity
    [Name] NVARCHAR(255) NOT NULL,
    [Description] NVARCHAR(MAX),
    [OwnerUserID] UNIQUEIDENTIFIER NOT NULL,
    [SchemaName] NVARCHAR(50) NOT NULL DEFAULT 'custom',
    [TableName] NVARCHAR(255) NOT NULL, -- e.g., 'UD_MeetupAttendees'
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Active', -- Draft/Active/Archived
    [Icon] NVARCHAR(50),
    [Category] NVARCHAR(100),
    [__mj_CreatedAt] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    FOREIGN KEY ([EntityID]) REFERENCES [__mj].[Entity]([ID]),
    FOREIGN KEY ([OwnerUserID]) REFERENCES [__mj].[User]([ID])
);

-- Tracks user-defined fields (for reference/history)
CREATE TABLE [__mj].[UserDefinedField] (
    [ID] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [UserDefinedTableID] UNIQUEIDENTIFIER NOT NULL,
    [EntityFieldID] UNIQUEIDENTIFIER NOT NULL, -- Links to generated EntityField
    [Name] NVARCHAR(255) NOT NULL,
    [DisplayName] NVARCHAR(255),
    [Description] NVARCHAR(MAX),
    [DataType] NVARCHAR(50) NOT NULL,
    [Length] INT,
    [Precision] INT,
    [Scale] INT,
    [IsRequired] BIT NOT NULL DEFAULT 0,
    [DefaultValue] NVARCHAR(MAX),
    [Sequence] INT NOT NULL,
    [RelatedTableID] UNIQUEIDENTIFIER, -- For foreign keys
    [__mj_CreatedAt] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    FOREIGN KEY ([UserDefinedTableID]) REFERENCES [__mj].[UserDefinedTable]([ID]),
    FOREIGN KEY ([EntityFieldID]) REFERENCES [__mj].[EntityField]([ID])
);
```

### Naming Conventions

**Database Tables**: `custom.UD_{TableName}`
- Example: `custom.UD_MeetupAttendees`
- Prefix `UD_` indicates user-defined
- Schema `custom` separates from core MJ tables

**Entity Names**: `User: {TableName}`
- Example: `User: Meetup Attendees`
- Prefix `User:` indicates user-created
- Matches MJ's existing `MJ:` prefix pattern

**Generated TypeScript Classes**: `UD{TableName}Entity`
- Example: `UDMeetupAttendeesEntity`
- Generated by CodeGen like any entity

---

## Security Considerations

### 1. DDL Execution Permissions

**Problem**: User-defined tables require `CREATE TABLE` permissions

**Solution**: MJCodeGenAPI runs with elevated database account
- Separate SQL account with DDL permissions
- Only accessible from MJCodeGenAPI service
- API validates all DDL before execution
- Audit log of all DDL operations

### 2. SQL Injection Prevention

**Validation Rules**:
```typescript
class DDLValidator {
    validateTableDefinition(def: UserTableDefinition): void {
        // 1. Table name: alphanumeric + underscore only
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(def.Name)) {
            throw new Error('Invalid table name');
        }

        // 2. Field names: same rules
        for (const field of def.Fields) {
            if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(field.Name)) {
                throw new Error(`Invalid field name: ${field.Name}`);
            }
        }

        // 3. Schema: must be 'custom'
        if (def.Schema !== 'custom') {
            throw new Error('User tables must use custom schema');
        }

        // 4. Data types: must be from allowed enum
        // (prevents injection via type)

        // 5. Default values: sanitize and validate
        for (const field of def.Fields) {
            if (field.DefaultValue) {
                this.validateDefaultValue(field);
            }
        }
    }
}
```

### 3. User Permissions

**Entity-Level Permissions**: Leverage existing `EntityPermission` system
- Creator gets full CRUD by default
- Can grant permissions to roles/users
- Row-level security supported

**Table Creation Permissions**: New permission flag
```sql
-- New permission in User or Role
ALTER TABLE [__mj].[User]
ADD [CanCreateUserTables] BIT NOT NULL DEFAULT 0;
```

### 4. Resource Limits

**Rate Limiting**:
```typescript
class UserTableRateLimiter {
    // Max 10 tables per user per day
    // Max 50 fields per table
    // Max 100 MB data per table (monitored)
}
```

---

## Deployment Requirements

### Infrastructure Components

**Required for User-Defined Tables**:

1. **MJCodeGenAPI Server**
   - Node.js service with elevated DB permissions
   - Secure endpoint (API key or JWT)
   - Rate limiting and audit logging
   - Can be co-hosted with MJAPI or separate

2. **Build Server**
   - Node.js environment with repo access
   - Turbo build system configured
   - SSH/Git access to pull latest
   - Can be same server as MJCodeGenAPI

3. **Deployment Service**
   - Azure DevOps integration OR
   - Direct file sync capability
   - Access to target API instances
   - Ability to trigger restarts

4. **WebSocket/SSE Support**
   - For progress streaming to UI
   - Can use existing MJAPI WebSocket support
   - Or dedicated progress service

### Azure Deployment Topology

**Option A: Single Tenant (Simple)**
```
┌─────────────────────────────────────────┐
│           Azure Resource Group          │
│                                         │
│  ┌─────────────┐    ┌──────────────┐   │
│  │   MJAPI     │    │ MJCodeGenAPI │   │
│  │  (Primary)  │    │   (Secure)   │   │
│  │             │    │              │   │
│  │ - Serves UI │    │ - DDL Exec   │   │
│  │ - GraphQL   │    │ - CodeGen    │   │
│  │ - REST      │    │ - Build      │   │
│  └─────────────┘    │ - Deploy     │   │
│                     └──────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │   SQL Server (Azure SQL)        │   │
│  │   - Standard account (MJAPI)    │   │
│  │   - Elevated account (CodeGen)  │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

**Option B: Multi-Instance (Production)**
```
┌──────────────────────────────────────────────────┐
│              Azure Load Balancer                 │
└─────────────────┬────────────────────────────────┘
                  │
        ┌─────────┴─────────┐
        │                   │
   ┌────▼──────┐      ┌────▼──────┐
   │  MJAPI-1  │      │  MJAPI-2  │
   │           │      │           │
   │ (Active)  │      │ (Active)  │
   └───────────┘      └───────────┘

   ┌──────────────────────────┐
   │   MJCodeGenAPI (Single)  │
   │   - Not load balanced    │
   │   - Handles all DDL/Build│
   └──────────────────────────┘

   ┌──────────────────────────┐
   │   Azure SQL Database     │
   └──────────────────────────┘
```

### Configuration

**Environment Variables**:
```bash
# MJAPI
MJAPI_PORT=4000
MJAPI_CODEGEN_API_URL=https://codegen.internal/api
MJAPI_CODEGEN_API_KEY=<secret>

# MJCodeGenAPI
CODEGEN_DB_USER=mjcodegen_elevated
CODEGEN_DB_PASSWORD=<secret>
CODEGEN_REPO_PATH=/app/MJ
CODEGEN_BUILD_CACHE_PATH=/cache
CODEGEN_DEPLOYMENT_TARGET=azure-devops
CODEGEN_AZURE_DEVOPS_ORG=<org>
CODEGEN_AZURE_DEVOPS_PROJECT=<project>
CODEGEN_AZURE_DEVOPS_PAT=<token>
```

---

## Table Lifecycle

### 1. Creation
- User describes table via agent conversation
- Agent extracts `UserTableDefinition`
- Pipeline executes (1-2 minutes)
- User notified when ready
- Table appears in UI immediately

### 2. Modification
**Field Addition** (Supported):
```sql
-- Generate ALTER TABLE script
ALTER TABLE custom.UD_MeetupAttendees
ADD DietaryRestrictions NVARCHAR(500) NULL;

-- Run through same pipeline
-- CodeGen picks up new field
-- Rebuild + deploy
```

**Field Type Changes** (Complex):
- Requires data migration
- Generate migration script
- User reviews/approves
- Execute through pipeline

**Field Removal** (Supported):
- Soft delete: Don't actually drop column
- Hide from metadata (EntityField.IncludeInAPI = 0)
- Or hard delete via ALTER TABLE DROP COLUMN

### 3. Promotion (Future Feature)

**Scenario**: User table proves valuable, needs to become official entity

**Process**:
1. Developer reviews table structure
2. Creates migration to move table:
   - `custom.UD_ProjectTracker` → `dbo.ProjectTracker`
3. Updates Entity metadata:
   - Remove `User:` prefix
   - Change schema to `dbo`
   - Add relationships, computed fields, etc.
4. Run full CodeGen
5. Table now part of core schema

### 4. Archival
- Set `UserDefinedTable.Status = 'Archived'`
- Hide from UI
- Don't delete data (preserve for audit)
- Optionally: Move to archive schema

---

## Performance Considerations

### 1. Build Optimization

**Turbo Cache**:
- First build: 60-90 seconds
- Cached rebuild: 10-20 seconds
- Only affected packages rebuild

**Incremental Compilation**:
- TypeScript incremental mode
- Only changed files recompile

### 2. Deployment Speed

**File Sync**:
- Only copy changed `dist/` folders
- ~5-10 MB for typical change
- Fast on Azure internal network

**Rolling Restart**:
- Instance restart: ~5 seconds
- Total with rolling: ~20 seconds for 4 instances

### 3. Database Performance

**User Tables**:
- Real SQL Server tables (not EAV)
- Proper indexes (added by CodeGen)
- Same performance as core entities

---

## Error Handling

### Common Failure Scenarios

**1. DDL Execution Failure**
```
Cause: SQL syntax error, permission issue, conflicting name
Action: Show error to user, don't proceed to build
Recovery: User fixes definition, retries
```

**2. CodeGen Failure**
```
Cause: Bug in CodeGen, unexpected schema
Action: Alert admin, roll back DDL
Recovery: Fix CodeGen, manual cleanup
```

**3. Build Failure**
```
Cause: TypeScript compilation error
Action: Alert admin, table exists but not usable
Recovery: Fix compilation issue, rebuild
```

**4. Deployment Failure**
```
Cause: Azure connection issue, permission problem
Action: Retry with exponential backoff
Recovery: Manual deployment if automated fails
```

**5. Restart Failure**
```
Cause: Instance won't start, config error
Action: Roll back deployment
Recovery: Investigate instance health, redeploy
```

### User-Facing Error Messages

```typescript
class UserTableErrorHandler {
    getUserMessage(error: PipelineError): string {
        switch (error.stage) {
            case 'ddl':
                return `We couldn't create the database table.
                        ${error.details}. Please try a different table name.`;

            case 'codegen':
                return `The table was created but there was a problem
                        generating code. Our team has been notified.`;

            case 'build':
                return `The table was created but there was a build error.
                        Our team has been notified and will fix this shortly.`;

            case 'deploy':
                return `The table was created but deployment failed.
                        Retrying automatically...`;

            default:
                return `Something went wrong. Our team has been notified.
                        Error ID: ${error.taskId}`;
        }
    }
}
```

---

## Testing Strategy

### 1. Unit Tests
- DDL generation with various field types
- SQL injection prevention
- Field name validation
- Default value sanitization

### 2. Integration Tests
- End-to-end table creation
- CodeGen execution
- Build process
- Deployment simulation

### 3. Load Tests
- Multiple concurrent table creations
- Large tables (50+ fields)
- Rapid field modifications

### 4. Security Tests
- SQL injection attempts
- Permission bypass attempts
- Rate limiting verification

---

## Rollout Plan

### Phase 1: Infrastructure (Weeks 1-2)
- [ ] Set up MJCodeGenAPI server
- [ ] Create `@memberjunction/user-tables` package
- [ ] Implement DDL generation
- [ ] Implement validation and security
- [ ] Test DDL execution in isolated environment

### Phase 2: Pipeline (Weeks 3-4)
- [ ] Implement `UserTablePipeline` orchestrator
- [ ] Integrate build service (Turbo)
- [ ] Implement deployment service (Azure DevOps)
- [ ] Add progress tracking (WebSocket)
- [ ] Test end-to-end pipeline

### Phase 3: UI & Agent (Weeks 5-6)
- [ ] Create `TableDesignerAgent`
- [ ] Build Angular table creation UI
- [ ] Implement progress dialog
- [ ] Add table management UI (list, edit, delete)
- [ ] User testing with beta users

### Phase 4: Production (Week 7-8)
- [ ] Deploy to production Azure environment
- [ ] Monitor performance and errors
- [ ] Gather user feedback
- [ ] Iterate on UX and performance

---

## Success Metrics

**Performance**:
- Table creation time: < 2 minutes (target: 90 seconds)
- Success rate: > 95%
- Build time: < 30 seconds (cached)
- Deployment time: < 20 seconds

**User Experience**:
- Tables created per week (adoption)
- User satisfaction score
- Errors encountered (minimize)
- Time saved vs manual process

**Technical**:
- Zero security incidents
- Zero data loss incidents
- System uptime during deployments: > 99.9%

---

## Open Questions for Team Review

1. **Deployment Strategy**: Azure DevOps pipeline or direct file sync?
2. **WebSocket Infrastructure**: Use existing or build dedicated service?
3. **Multi-Tenant**: How do user tables work in multi-tenant scenarios?
4. **Cost**: Azure SQL cost implications for many small tables?
5. **Limits**: What limits on table/field count per user?
6. **Rollback**: Should we support automatic rollback on failure?
7. **Agent Integration**: Which agent framework (Skip or MJ native)?
8. **Permissions**: Should table creation be admin-only initially?

---

## Conclusion

User-defined tables in MemberJunction will provide Airtable-like flexibility while maintaining the platform's architectural integrity. By automating the existing workflow rather than building workarounds, we ensure:

- **Full feature compatibility**: User tables are first-class entities
- **Type safety**: Generated TypeScript classes and GraphQL resolvers
- **Performance**: Real SQL tables with proper indexes
- **Security**: Leverages existing permission system
- **Maintainability**: No special-case code paths

The 1-2 minute creation time is acceptable for the use case, and the agent-based UX makes the process feel natural and guided. This positions MemberJunction as a platform that combines enterprise-grade data management with user-friendly, rapid table creation.

---

**Document Version**: 1.0
**Date**: 2025-01-29
**Author**: Architecture Team
**Status**: Draft for Review





# COMPLETE ALTERNATIVE from GPT 5
Understanding the MJ foundation
MemberJunction is already designed as a metadata-driven platform that unifies data management, logic, and UI, making it well suited to orchestrate schema definition and runtime behavior from metadata descriptions rather than hard-coded structures.

The modular monorepo and the central @memberjunction/core package provide the metadata engine, entity management, and provider abstractions you can extend to support additional storage strategies.

Strongly-typed entity classes in @memberjunction/core-entities, including the resource-permission subsystem, already offer a sophisticated model for validating data and enforcing access rules, which you can repurpose for any “mini Airtable” experience to keep it aligned with the rest of the platform.

Problem framing
Business users need lightweight, ad-hoc tables for small data collections (event attendee lists, SaaS imports, experiments) without waiting for full SQL entities to be modeled. The solution must:

Give non-technical users quick self-service schema creation.

Provide usable CRUD UX in Explorer and through APIs.

Offer a path to “promote” a table into the hardened SQL/metadata stack.

Respect security, governance, and integration expectations of MJ.

Proposed architecture
1. Metadata tier for “flex tables”
Define new metadata entities (e.g., FlexTableDefinition, FlexTableField, FlexTableView) stored in the core database. Each definition would include schema metadata, ownership, sharing flags, and lifecycle state. Because Metadata.Entities is the canonical access point, you can extend Metadata to expose these flex definitions alongside classic entities, possibly in a dedicated collection to keep discovery clean.

Maintain compatibility with promotion workflows by storing additional fields like “origin entity” or “promotion target” so you can track relationships between ad-hoc and formal models.

2. Storage strategies
Initial approach: keep flex table data inside MJ tables using a generic row/cell model (FlexTableRow, FlexTableCell). This avoids on-the-fly SQL schema changes and keeps data in one place. Rows would reference their table definition; cells reference both row and field definition. Use JSON or polymorphic columns for data value storage; apply minimal type enforcement at this layer to keep it flexible.

Optional advanced path: allow dedicated SQL tables in a separate schema for performance-sensitive flex tables. The data provider layer can use the provider architecture from @memberjunction/core to route reads/writes through either the generic storage or a table-specific provider.

3. Runtime services
Extend the core metadata refresh pipeline to pull flex table definitions so Explorer can auto-generate forms, grids, and validations exactly like it does for classic entities. Because Metadata.GetEntityObject() already builds entity instances dynamically, you can produce lightweight proxy entities for flex tables that implement a subset of BaseEntity (e.g., load, save, validation, auditing) using the generic storage backend.

Provide a versioned schema history so you can roll back breaking changes and facilitate promotion (e.g., track column additions/removals with timestamps, store migration scripts when applicable).

4. UI/UX layer
In Explorer, introduce a “Flex Tables” workspace with wizards for table creation. Lean on existing Angular grid and form components to render rows and forms once the metadata is in place, minimizing new front-end work.

Offer templates (pre-defined column sets) and quick import flows (CSV, JSON) to capture spreadsheet replacements.

Expose inline formula fields or computed columns later by integrating small script snippets stored in field metadata. These can run server-side via the action framework for consistency.

Promotion workflow
User marks a flex table as “ready for promotion.”

System analyzes the definition, runs validations (check for unsupported types, missing relationships).

Generate SQL migration scripts and metadata entries for the target entity; optionally require admin approval.

Execute migration (create SQL table, copy data from flex storage, generate entity metadata, produce TypeScript entity class through existing codegen). Because the repository already auto-generates entity classes during installation, the promotion path can reuse those codegen facilities with minimal additional tooling.

Update metadata so Explorer routes future interactions to the newly created formal entity while preserving historical flex table records for audit.

Security and governance
Use the existing resource-permission engine to guard flex tables. Store permission assignments per table/field so you can reuse the same checks in Explorer and APIs.

Audit log entries should record schema edits and data mutations. Because BaseEntity handles dirty tracking and field metadata, you can reuse it for audit metadata even if the backing store is generic.

Support ownership, sharing (individual, team, organization), and potentially workspace-level grouping.

Integration touchpoints
Actions framework: allow triggers on flex tables for automation (e.g., when a row is added, push to CRM). Build a simplified rule editor referencing the table metadata.

API/GraphQL: generate simple endpoints using the server package’s provider architecture, mapping flex table metadata to GraphQL types on demand.

AI/Automation: leverage the platform’s metadata-driven nature so AI features can analyze flex tables just like formal entities once they’re surfaced through metadata collections.

Implementation roadmap (high level)
Metadata modeling – Create entities for table definitions, fields, rows, cells, with permissions support.

Backend services – Extend Metadata and provider layers to load/save flex data using a generic repository.

Explorer UI – Build creation wizard, grid/form experience using existing components.

Automation & API – Expose GraphQL endpoints and action triggers.

Promotion tooling – Add scripts/UI to convert flex tables into formal SQL entities, reusing codegen.

This approach leverages MJ’s existing metadata-first architecture, keeps user-defined tables governed inside the platform, and provides a structured path from quick experimentation to production-grade entities.