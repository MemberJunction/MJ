# MemberJunction API Server

The MemberJunction API (MJAPI) is the core server component that exposes MemberJunction's functionality through GraphQL and REST interfaces. This server provides a comprehensive API for accessing and manipulating data within the MemberJunction ecosystem.

## Overview

MJAPI serves as the primary interface between client applications and the MemberJunction data layer. It provides:

- A GraphQL API for entity operations, view execution, and report generation
- Support for executing entity actions and workflows
- Authentication and authorization mechanisms
- Real-time data updates via WebSocket subscriptions
- Integration with MemberJunction's AI capabilities

## Key Features

- **GraphQL API**: Comprehensive GraphQL schema for all MemberJunction entities
- **Entity Operations**: CRUD operations for all entities
- **View Execution**: Run database views with filtering, sorting, and pagination
- **Report Generation**: Execute reports with parameters and formatting options
- **Transaction Support**: Group multiple operations into atomic transactions
- **Subscriptions**: Real-time data updates via WebSocket
- **Authentication**: JWT-based authentication with role-based access control
- **AI Integration**: Built-in support for MemberJunction's AI capabilities
- **Docker Support**: Easy deployment with Docker containers

## Prerequisites

- Node.js 16+ (18+ recommended)
- SQL Server database with MemberJunction schema installed
- Access to required services (email, storage, etc.)

## Installation

### Local Development

1. Clone the repository (if not already part of your project)

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your specific configuration
```

4. Build the project:
```bash
npm run build
```

5. Start the server:
```bash
npm start
```

### Docker Deployment

1. Build the Docker image:
```bash
docker build -t memberjunction/api -f Dockerfile .
```

2. Run the container:
```bash
docker run -p 4000:4000 --env-file .env memberjunction/api
```

## Configuration

The API server is configured through environment variables and/or a `config.json` file. Key configuration options include:

- `MJ_DBDRIVER`: Database driver (default: 'SQLServerDataProvider')
- `MJ_HOST`: Database host
- `MJ_PORT`: Database port
- `MJ_USER`: Database username
- `MJ_PASSWORD`: Database password
- `MJ_DATABASE`: Database name
- `MJ_APIPORT`: API server port (default: 4000)
- `MJ_APIHOST`: API server host (default: 'localhost')
- `MJ_JWT_SECRET`: Secret for JWT token generation
- `MJ_STORAGE_PROVIDER`: Storage provider for file operations
- `MJ_EMAIL_PROVIDER`: Email provider for sending notifications

## Usage

### GraphQL API

The GraphQL API is accessible at `http://localhost:4000/graphql` by default (or your configured host/port).

#### Example Queries

**Fetch User Data:**
```graphql
query {
  entity_User(ID: 1) {
    ID
    FirstName
    LastName
    Email
    Roles {
      ID
      Name
      Description
    }
  }
}
```

**Run a View:**
```graphql
query {
  runView(
    options: {
      EntityName: "vwUsers",
      ExtraFilter: "Status = 'Active'",
      OrderBy: "LastName, FirstName",
      PageSize: 10,
      PageNumber: 1
    }
  ) {
    Success
    RowCount
    TotalRowCount
    Results
  }
}
```

**Execute a Report:**
```graphql
query {
  runReport(
    reportName: "UserActivityReport",
    parameters: {
      StartDate: "2023-01-01",
      EndDate: "2023-12-31"
    }
  ) {
    Success
    Results
    ErrorMessage
  }
}
```

#### Example Mutations

**Create a User:**
```graphql
mutation {
  saveEntity_User(
    entity: {
      ID: 0,
      FirstName: "John",
      LastName: "Doe",
      Email: "john.doe@example.com",
      Status: "Active"
    }
  ) {
    Success
    Entity {
      ID
      FirstName
      LastName
    }
    ErrorMessage
  }
}
```

**Execute an Entity Action:**
```graphql
mutation {
  executeAction(
    entityName: "User",
    actionName: "SendWelcomeEmail",
    entityID: 1,
    parameters: {
      templateID: 123,
      includeAttachments: true
    }
  ) {
    Success
    Results
    ErrorMessage
  }
}
```

### REST API

The API also provides REST endpoints for specific operations:

- `GET /api/entity/:entityName/:id` - Get entity by ID
- `POST /api/entity/:entityName` - Create or update entity
- `DELETE /api/entity/:entityName/:id` - Delete entity
- `POST /api/view` - Execute a view
- `POST /api/report/:reportName` - Run a report
- `POST /api/action/:entityName/:actionName/:id?` - Execute an action

## Extending the API

### Adding Custom Resolvers

Create a new resolver file in the `src/resolvers` directory:

```typescript
// src/resolvers/CustomResolver.ts
import { Resolver, Query, Arg } from 'type-graphql';

@Resolver()
export class CustomResolver {
  @Query(() => String)
  async customQuery(@Arg('input') input: string): Promise<string> {
    // Implement your custom logic
    return `Processed: ${input}`;
  }
}
```

Register your resolver in `src/server.ts`:

```typescript
import { CustomResolver } from './resolvers/CustomResolver';

// Add to the resolvers array in buildSchema()
const schema = await buildSchema({
  resolvers: [
    // ... existing resolvers
    CustomResolver
  ],
  // ...
});
```

### Adding Custom Middleware

Create your middleware in the `src/middleware` directory:

```typescript
// src/middleware/customMiddleware.ts
import { NextFunction, Request, Response } from 'express';

export const customMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Implement your middleware logic
  console.log('Custom middleware executed');
  next();
};
```

Apply the middleware in `src/server.ts`:

```typescript
import { customMiddleware } from './middleware/customMiddleware';

// Apply middleware
app.use(customMiddleware);
```

## Docker Support

The API server includes Docker support for easy deployment. The included Dockerfile sets up a production-ready container with all dependencies.

### Environment Variables for Docker

When running in Docker, you can pass environment variables using the `--env-file` flag or setting them directly:

```bash
docker run -p 4000:4000 \
  -e MJ_HOST=db.example.com \
  -e MJ_DATABASE=MemberJunction \
  -e MJ_USER=dbuser \
  -e MJ_PASSWORD=dbpassword \
  -e MJ_JWT_SECRET=your-secret-key \
  memberjunction/api
```

## API Documentation

The API includes built-in GraphQL documentation accessible through the GraphQL playground at `http://localhost:4000/graphql`.

## Related Packages

- `@memberjunction/core`: Core functionality and entity definitions
- `@memberjunction/global`: Shared utilities and constants
- `@memberjunction/sqlserver-dataprovider`: SQL Server data provider
- `@memberjunction/ai`: AI capabilities integration
- `@memberjunction/server`: Base server functionality
- `mj_generatedentities`: Generated entity classes
- `mj_generatedactions`: Generated action classes

## License

ISC