# @memberjunction/scheduled-actions-server

A lightweight Express server application that executes scheduled actions in the MemberJunction framework. This server provides HTTP endpoints to trigger various scheduled actions including AI-powered content autotagging, vectorization, and data enrichment operations.

## Overview

The Scheduled Actions Server is designed to run as a standalone service that can be invoked via HTTP requests to execute scheduled actions defined in the MemberJunction system. It supports concurrent execution control, multiple action types, and integrates with various AI providers and vector databases.

## Features

- **HTTP API Interface**: Simple GET endpoint to trigger scheduled actions
- **Multiple Action Types**: Support for various action types including:
  - All scheduled actions execution
  - Apollo data enrichment (accounts and contacts)
  - Content autotagging and vectorization
- **Concurrent Execution Control**: Built-in concurrency limits to prevent resource overload
- **AI Integration**: Pre-configured with OpenAI, Mistral, and Pinecone vector database
- **Flexible Configuration**: Environment variable based configuration
- **TypeScript Support**: Fully typed with TypeScript

## Installation

```bash
npm install @memberjunction/scheduled-actions-server
```

## Configuration

The server requires the following environment variables to be set:

```bash
# Database Configuration
DB_HOST=your_database_host
DB_PORT=1433  # Optional, defaults to 1433
DB_USERNAME=your_db_username
DB_PASSWORD=your_db_password
DB_DATABASE=your_database_name

# MemberJunction Configuration
MJ_CORE_SCHEMA=__mj  # Your MJ schema name
CURRENT_USER_EMAIL=user@example.com  # Email of the user executing actions

# Server Configuration
PORT=8000  # Optional, defaults to 8000
METADATA_AUTO_REFRESH_INTERVAL=3600000  # Optional, in milliseconds
```

## Usage

### Starting the Server

```bash
# Development mode with hot reload
npm run dev

# Development with debugging
npm run dev:debug

# Production mode
npm run start
```

### API Endpoints

#### Execute Actions

**GET** `/`

Execute scheduled actions based on the provided options.

Query Parameters:
- `options` (string): Comma-separated list of actions to run

Examples:

```bash
# Run all scheduled actions
curl http://localhost:8000/?options=all

# Run specific actions
curl http://localhost:8000/?options=ScheduledActions

# Run multiple actions
curl http://localhost:8000/?options=enrichaccounts,enrichcontacts

# Run content autotagging and vectorization
curl http://localhost:8000/?options=autoTagAndVectorize
```

### Available Action Options

| Option | Description |
|--------|-------------|
| `all` | Run all configured processes |
| `ScheduledActions` | Run all scheduled actions defined in the system |
| `enrichaccounts` | Run Apollo enrichment for accounts |
| `enrichcontacts` | Run Apollo enrichment for contacts |
| `autoTagAndVectorize` | Run content autotagging and vectorization |

## Code Examples

### Extending with Custom Actions

You can add custom actions by modifying the `runOptions` array:

```typescript
import { runOption } from './index';

const customAction: runOption = {
    name: "customAction",
    description: "My custom scheduled action",
    run: async (initServer: boolean) => {
        // Your custom logic here
        return true; // Return success status
    },
    maxConcurrency: 1  // Limit concurrent executions
};

// Add to runOptions array
runOptions.push(customAction);
```

### Programmatic Execution

You can also use the exported functions directly:

```typescript
import { 
    runAll, 
    runScheduledActions, 
    enrichAccounts,
    enrichContacts,
    autotagAndVectorize 
} from '@memberjunction/scheduled-actions-server';

// Execute all actions
const success = await runAll();

// Execute specific scheduled action
const actionSuccess = await runScheduledActions();

// Run enrichment
const accountsEnriched = await enrichAccounts();
const contactsEnriched = await enrichContacts();

// Run autotagging
const autotagSuccess = await autotagAndVectorize();
```

## Dependencies

### Core Dependencies
- `@memberjunction/core`: Core MemberJunction functionality
- `@memberjunction/core-entities`: Entity definitions
- `@memberjunction/actions`: Action framework
- `@memberjunction/scheduled-actions`: Scheduled actions engine
- `@memberjunction/ai`: AI integration framework
- `express`: Web server framework
- `typescript`: TypeScript support

### AI and Vector Database Integrations
- `@memberjunction/ai-mistral`: Mistral AI integration
- `@memberjunction/ai-openai`: OpenAI integration
- `@memberjunction/ai-vectors-pinecone`: Pinecone vector database
- `@memberjunction/ai-vector-sync`: Vector synchronization
- `@memberjunction/actions-content-autotag`: Content autotagging action

## Integration with MemberJunction

This server integrates seamlessly with the MemberJunction ecosystem:

1. **Metadata System**: Uses MJ metadata for entity and action definitions
2. **User Context**: Executes actions in the context of a specific user
3. **Action Framework**: Leverages the MJ actions framework for extensibility
4. **Database Access**: Uses MJ's SQL Server data provider for database operations

## Build and Development

```bash
# Build the project
npm run build

# Watch mode for development
npm run watch

# Run linting
npm run lint

# Clean build artifacts
npm run clean

# Create deployment package
npm run zip
```

## Deployment Notes

### Production Deployment

1. Build the project: `npm run build`
2. Set all required environment variables
3. Run using a process manager like PM2:
   ```bash
   pm2 start dist/index.js --name scheduled-actions-server
   ```

### Docker Deployment

Create a Dockerfile:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 8000
CMD ["node", "dist/index.js"]
```

### Security Considerations

- Always use HTTPS in production
- Implement authentication/authorization for the endpoints
- Restrict database permissions to minimum required
- Use environment-specific configurations
- Monitor and log all action executions

## Error Handling

The server includes comprehensive error handling:
- All actions return success/failure status
- Errors are logged using MJ's logging system
- HTTP responses include status indicators
- Graceful handling of missing or invalid options

## Performance Considerations

- Actions respect concurrency limits to prevent resource exhaustion
- Long-running actions have extended timeouts (5 minutes default)
- Server initialization is optimized to run once per session
- Metadata caching reduces database load

## Troubleshooting

Common issues and solutions:

1. **Database Connection Errors**: Verify database credentials and network connectivity
2. **Missing User Error**: Ensure CURRENT_USER_EMAIL exists in the system
3. **Action Not Found**: Check action names are correctly defined in the database
4. **Timeout Errors**: Adjust request timeout in db.ts for long-running operations

## License

ISC

## Support

For issues and questions, please refer to the MemberJunction documentation or create an issue in the repository.