# @memberjunction/core-actions

The `@memberjunction/core-actions` library provides a collection of pre-built actions that are essential to the MemberJunction framework. These actions handle common operations like sending messages, detecting external changes, and vectorizing entities for AI processing.

## Overview

This package contains both custom-built and generated actions that extend the MemberJunction Actions framework. It provides ready-to-use implementations for core functionality that many MemberJunction applications require.

## Important Note

**This library should only be imported on the server side.** It contains server-specific dependencies and functionality that are not suitable for client-side applications.

## Installation

```

### 5. Data Transformation Actions

#### CSV Parser Action

Parses CSV data with configurable options for headers, delimiters, and data types.

**Class:** `CSVParserAction`  
**Registration Name:** `"CSV Parser"`

**Parameters:**
- `CSVData` (string, required): The CSV data to parse
- `HasHeaders` (boolean, optional): Whether the first row contains headers (default: true)
- `Delimiter` (string, optional): Field delimiter (default: ',')
- `QuoteCharacter` (string, optional): Quote character for escaping (default: '"')
- `SkipEmptyRows` (boolean, optional): Skip empty rows (default: true)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'CSV Parser',
    Params: [
        { Name: 'CSVData', Value: 'Name,Age,City\nJohn,30,NYC\nJane,25,LA' },
        { Name: 'HasHeaders', Value: true }
    ],
    ContextUser: currentUser
});
```

#### JSON Transform Action

Transforms JSON data using JSONPath-style queries with multiple operations support.

**Class:** `JSONTransformAction`  
**Registration Name:** `"JSON Transform"`

**Parameters:**
- `InputData` (object/string, required): JSON data to transform (supports both JSON object and string)
- `Transformations` (string/array, required): JSONPath queries for transformation
- `OutputFormat` (string, optional): 'object' or 'array' (default: 'object')
- `DefaultValue` (any, optional): Default value for missing paths

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'JSON Transform',
    Params: [
        { Name: 'InputData', Value: { users: [{ name: 'John', age: 30 }] } },
        { Name: 'Transformations', Value: ['name:$.users[0].name', 'age:$.users[0].age'] }
    ],
    ContextUser: currentUser
});
```

#### XML Parser Action

Parses XML data into JSON format with namespace support.

**Class:** `XMLParserAction`  
**Registration Name:** `"XML Parser"`

**Parameters:**
- `XMLData` (string, required): The XML data to parse
- `RemoveNamespaces` (boolean, optional): Strip namespace prefixes (default: false)
- `ParseNumbers` (boolean, optional): Convert numeric strings to numbers (default: true)
- `ParseBooleans` (boolean, optional): Convert boolean strings to booleans (default: true)
- `AttributePrefix` (string, optional): Prefix for attributes (default: '@')

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'XML Parser',
    Params: [
        { Name: 'XMLData', Value: '<root><user id="1"><name>John</name></user></root>' },
        { Name: 'ParseNumbers', Value: true }
    ],
    ContextUser: currentUser
});
```

#### Aggregate Data Action

Performs aggregation operations on arrays of data with support for multiple aggregation functions.

**Class:** `AggregateDataAction`  
**Registration Name:** `"Aggregate Data"`

**Parameters:**
- `Data` (array, required): Array of objects to aggregate
- `GroupBy` (string/array, optional): Field(s) to group by
- `Aggregations` (object/string, required): Aggregation operations (sum, avg, count, min, max)
- `Having` (object, optional): Filter conditions on aggregated results

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Aggregate Data',
    Params: [
        { Name: 'Data', Value: [{ category: 'A', value: 10 }, { category: 'A', value: 20 }] },
        { Name: 'GroupBy', Value: 'category' },
        { Name: 'Aggregations', Value: { totalValue: 'sum:value', avgValue: 'avg:value' } }
    ],
    ContextUser: currentUser
});
```

#### Data Mapper Action

Maps data from one structure to another using field mappings and transformations.

**Class:** `DataMapperAction`  
**Registration Name:** `"Data Mapper"`

**Parameters:**
- `SourceData` (object/array, required): Data to map
- `Mappings` (object/string, required): Field mapping configuration
- `DefaultValues` (object, optional): Default values for missing fields
- `RemoveUnmapped` (boolean, optional): Remove fields not in mapping (default: false)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Data Mapper',
    Params: [
        { Name: 'SourceData', Value: { firstName: 'John', lastName: 'Doe' } },
        { Name: 'Mappings', Value: { fullName: '{{firstName}} {{lastName}}' } }
    ],
    ContextUser: currentUser
});
```

### 6. File Operations Actions

#### PDF Generator Action

Generates PDF documents from HTML or markdown content.

**Class:** `PDFGeneratorAction`  
**Registration Name:** `"PDF Generator"`

**Parameters:**
- `Content` (string, required): HTML or markdown content
- `ContentType` (string, optional): 'html' or 'markdown' (default: 'html')
- `Options` (object/string, optional): PDF options (margins, orientation, etc.)
- `FileName` (string, optional): Output filename

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'PDF Generator',
    Params: [
        { Name: 'Content', Value: '<h1>Report</h1><p>Content here</p>' },
        { Name: 'Options', Value: { margin: { top: '1in' }, orientation: 'portrait' } }
    ],
    ContextUser: currentUser
});
```

#### PDF Extractor Action

Extracts text and metadata from PDF files.

**Class:** `PDFExtractorAction`  
**Registration Name:** `"PDF Extractor"`

**Parameters:**
- `PDFData` (Buffer/string, required): PDF file data or base64 string
- `ExtractText` (boolean, optional): Extract text content (default: true)
- `ExtractMetadata` (boolean, optional): Extract document metadata (default: true)
- `PageRange` (string, optional): Pages to extract (e.g., '1-5,7,9-10')

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'PDF Extractor',
    Params: [
        { Name: 'PDFData', Value: pdfBuffer },
        { Name: 'PageRange', Value: '1-10' }
    ],
    ContextUser: currentUser
});
```

#### Excel Reader Action

Reads data from Excel files with support for multiple sheets.

**Class:** `ExcelReaderAction`  
**Registration Name:** `"Excel Reader"`

**Parameters:**
- `ExcelData` (Buffer/string, required): Excel file data or base64 string
- `SheetName` (string, optional): Specific sheet to read
- `Range` (string, optional): Cell range to read (e.g., 'A1:D10')
- `ParseDates` (boolean, optional): Convert Excel dates (default: true)
- `IncludeEmptyRows` (boolean, optional): Include empty rows (default: false)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Excel Reader',
    Params: [
        { Name: 'ExcelData', Value: excelBuffer },
        { Name: 'SheetName', Value: 'Sales Data' }
    ],
    ContextUser: currentUser
});
```

#### Excel Writer Action

Creates Excel files from data with formatting options.

**Class:** `ExcelWriterAction`  
**Registration Name:** `"Excel Writer"`

**Parameters:**
- `Data` (array/object, required): Data to write (array of objects or sheets config)
- `SheetName` (string, optional): Sheet name (default: 'Sheet1')
- `IncludeHeaders` (boolean, optional): Include column headers (default: true)
- `ColumnWidths` (object, optional): Custom column widths
- `Formatting` (object/string, optional): Cell formatting rules

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Excel Writer',
    Params: [
        { Name: 'Data', Value: [{ name: 'John', sales: 1000 }, { name: 'Jane', sales: 1500 }] },
        { Name: 'SheetName', Value: 'Sales Report' }
    ],
    ContextUser: currentUser
});
```

#### File Compress Action

Compresses files into ZIP archives.

**Class:** `FileCompressAction`  
**Registration Name:** `"File Compress"`

**Parameters:**
- `Files` (array, required): Array of file objects with name and content
- `CompressionLevel` (number, optional): Compression level 0-9 (default: 6)
- `ArchiveName` (string, optional): Output archive name
- `Password` (string, optional): Password protection for archive

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'File Compress',
    Params: [
        { Name: 'Files', Value: [
            { name: 'report.txt', content: 'Report content' },
            { name: 'data.json', content: JSON.stringify(data) }
        ]},
        { Name: 'ArchiveName', Value: 'backup.zip' }
    ],
    ContextUser: currentUser
});
```

### 7. Integration Actions

#### HTTP Request Action

Makes HTTP requests with full control over headers, body, and authentication.

**Class:** `HTTPRequestAction`  
**Registration Name:** `"HTTP Request"`

**Parameters:**
- `URL` (string, required): Request URL
- `Method` (string, optional): HTTP method (default: 'GET')
- `Headers` (object/string, optional): Request headers
- `Body` (any, optional): Request body
- `Timeout` (number, optional): Request timeout in ms (default: 30000)
- `RetryCount` (number, optional): Number of retries (default: 0)
- `BasicAuth` (object, optional): Basic authentication credentials

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'HTTP Request',
    Params: [
        { Name: 'URL', Value: 'https://api.example.com/data' },
        { Name: 'Method', Value: 'POST' },
        { Name: 'Headers', Value: { 'Content-Type': 'application/json' } },
        { Name: 'Body', Value: { query: 'test' } }
    ],
    ContextUser: currentUser
});
```

#### GraphQL Query Action

Executes GraphQL queries and mutations with variable support.

**Class:** `GraphQLQueryAction`  
**Registration Name:** `"GraphQL Query"`

**Parameters:**
- `Endpoint` (string, required): GraphQL endpoint URL
- `Query` (string, required): GraphQL query or mutation
- `Variables` (object/string, optional): Query variables
- `Headers` (object/string, optional): Request headers
- `OperationName` (string, optional): Operation name for multi-operation documents

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'GraphQL Query',
    Params: [
        { Name: 'Endpoint', Value: 'https://api.example.com/graphql' },
        { Name: 'Query', Value: 'query GetUser($id: ID!) { user(id: $id) { name email } }' },
        { Name: 'Variables', Value: { id: '123' } }
    ],
    ContextUser: currentUser
});
```

#### OAuth Flow Action

Handles OAuth 2.0 authentication flows.

**Class:** `OAuthFlowAction`  
**Registration Name:** `"OAuth Flow"`

**Parameters:**
- `Provider` (string, required): OAuth provider name
- `ClientID` (string, required): OAuth client ID
- `ClientSecret` (string, required): OAuth client secret
- `RedirectURI` (string, required): Redirect URI
- `Scopes` (string/array, optional): Required scopes
- `State` (string, optional): State parameter for security

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'OAuth Flow',
    Params: [
        { Name: 'Provider', Value: 'google' },
        { Name: 'ClientID', Value: 'your-client-id' },
        { Name: 'ClientSecret', Value: 'your-client-secret' },
        { Name: 'RedirectURI', Value: 'https://app.example.com/callback' },
        { Name: 'Scopes', Value: ['email', 'profile'] }
    ],
    ContextUser: currentUser
});
```

#### API Rate Limiter Action

Manages API rate limiting with queuing and backoff strategies.

**Class:** `APIRateLimiterAction`  
**Registration Name:** `"API Rate Limiter"`

**Parameters:**
- `APIName` (string, required): API identifier
- `RequestsPerWindow` (number, required): Max requests per time window
- `WindowSizeMs` (number, optional): Time window in ms (default: 60000)
- `QueueRequests` (boolean, optional): Queue excess requests (default: true)
- `MaxQueueSize` (number, optional): Maximum queue size (default: 100)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'API Rate Limiter',
    Params: [
        { Name: 'APIName', Value: 'external-api' },
        { Name: 'RequestsPerWindow', Value: 100 },
        { Name: 'WindowSizeMs', Value: 60000 }
    ],
    ContextUser: currentUser
});
```

### 8. Security Actions

#### Password Strength Action

Evaluates password strength and provides improvement suggestions.

**Class:** `PasswordStrengthAction`  
**Registration Name:** `"Password Strength"`

**Parameters:**
- `Password` (string, required): Password to evaluate
- `MinLength` (number, optional): Minimum required length (default: 8)
- `RequireUppercase` (boolean, optional): Require uppercase letters (default: true)
- `RequireLowercase` (boolean, optional): Require lowercase letters (default: true)
- `RequireNumbers` (boolean, optional): Require numbers (default: true)
- `RequireSpecial` (boolean, optional): Require special characters (default: true)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Password Strength',
    Params: [
        { Name: 'Password', Value: 'MyP@ssw0rd' },
        { Name: 'MinLength', Value: 12 }
    ],
    ContextUser: currentUser
});
```

### 9. Workflow Control Actions

#### Conditional Action

Executes actions based on conditional logic.

**Class:** `ConditionalAction`  
**Registration Name:** `"Conditional"`

**Parameters:**
- `Condition` (string, required): JavaScript expression to evaluate
- `ThenAction` (object, required): Action to run if condition is true
- `ElseAction` (object, optional): Action to run if condition is false
- `Context` (object, optional): Variables available in condition

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Conditional',
    Params: [
        { Name: 'Condition', Value: 'value > 100' },
        { Name: 'Context', Value: { value: 150 } },
        { Name: 'ThenAction', Value: { name: 'Send Email', params: {...} } }
    ],
    ContextUser: currentUser
});
```

#### Loop Action

Executes actions repeatedly with iteration support.

**Class:** `LoopAction`  
**Registration Name:** `"Loop"`

**Parameters:**
- `Items` (array, optional): Array to iterate over
- `Count` (number, optional): Number of iterations (if no items)
- `Action` (object, required): Action to execute for each iteration
- `Parallel` (boolean, optional): Run iterations in parallel (default: false)
- `MaxConcurrency` (number, optional): Max parallel executions (default: 10)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Loop',
    Params: [
        { Name: 'Items', Value: [1, 2, 3, 4, 5] },
        { Name: 'Action', Value: { name: 'Process Item', params: {...} } },
        { Name: 'Parallel', Value: true }
    ],
    ContextUser: currentUser
});
```

#### Parallel Execute Action

Runs multiple actions concurrently with result aggregation.

**Class:** `ParallelExecuteAction`  
**Registration Name:** `"Parallel Execute"`

**Parameters:**
- `Actions` (array, required): Array of actions to execute
- `MaxConcurrency` (number, optional): Maximum concurrent executions (default: 10)
- `StopOnError` (boolean, optional): Stop all if one fails (default: false)
- `Timeout` (number, optional): Overall timeout in ms

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Parallel Execute',
    Params: [
        { Name: 'Actions', Value: [
            { name: 'Web Search', params: { SearchTerms: 'AI' } },
            { name: 'HTTP Request', params: { URL: 'https://api.example.com' } }
        ]},
        { Name: 'MaxConcurrency', Value: 2 }
    ],
    ContextUser: currentUser
});
```

#### Retry Action

Retries failed actions with configurable backoff strategies.

**Class:** `RetryAction`  
**Registration Name:** `"Retry"`

**Parameters:**
- `Action` (object, required): Action to retry
- `MaxRetries` (number, optional): Maximum retry attempts (default: 3)
- `InitialDelay` (number, optional): Initial delay in ms (default: 1000)
- `BackoffMultiplier` (number, optional): Delay multiplier (default: 2)
- `MaxDelay` (number, optional): Maximum delay in ms (default: 30000)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Retry',
    Params: [
        { Name: 'Action', Value: { name: 'HTTP Request', params: {...} } },
        { Name: 'MaxRetries', Value: 5 },
        { Name: 'InitialDelay', Value: 2000 }
    ],
    ContextUser: currentUser
});
```

#### Delay Action

Introduces delays in workflow execution.

**Class:** `DelayAction`  
**Registration Name:** `"Delay"`

**Parameters:**
- `DelayMs` (number, required): Delay duration in milliseconds
- `Jitter` (number, optional): Random jitter to add (0-1, percentage of delay)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Delay',
    Params: [
        { Name: 'DelayMs', Value: 5000 },
        { Name: 'Jitter', Value: 0.1 } // 10% jitter
    ],
    ContextUser: currentUser
});
```

### 10. Communication Actions

#### Slack Webhook Action

Sends messages to Slack channels via webhooks.

**Class:** `SlackWebhookAction`  
**Registration Name:** `"Slack Webhook"`

**Parameters:**
- `WebhookURL` (string, required): Slack webhook URL
- `Message` (string, required): Message text
- `Channel` (string, optional): Override default channel
- `Username` (string, optional): Override default username
- `IconEmoji` (string, optional): Override default icon
- `Attachments` (array/string, optional): Rich message attachments

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Slack Webhook',
    Params: [
        { Name: 'WebhookURL', Value: 'https://hooks.slack.com/services/...' },
        { Name: 'Message', Value: 'Deployment completed successfully!' },
        { Name: 'IconEmoji', Value: ':rocket:' }
    ],
    ContextUser: currentUser
});
```

#### Teams Webhook Action

Sends messages to Microsoft Teams channels via webhooks.

**Class:** `TeamsWebhookAction`  
**Registration Name:** `"Teams Webhook"`

**Parameters:**
- `WebhookURL` (string, required): Teams webhook URL
- `Title` (string, optional): Message title
- `Text` (string, required): Message text
- `ThemeColor` (string, optional): Message accent color
- `Sections` (array/string, optional): Message sections
- `Actions` (array/string, optional): Interactive actions

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Teams Webhook',
    Params: [
        { Name: 'WebhookURL', Value: 'https://outlook.office.com/webhook/...' },
        { Name: 'Title', Value: 'Build Status' },
        { Name: 'Text', Value: 'Build #123 completed successfully' },
        { Name: 'ThemeColor', Value: '00FF00' }
    ],
    ContextUser: currentUser
});
```

### 11. AI Actions

#### Execute AI Prompt Action

Executes AI prompts using MemberJunction's AI framework with model selection and parameter control.

**Class:** `ExecuteAIPromptAction`  
**Registration Name:** `"Execute AI Prompt"`

**Parameters:**
- `PromptID` (string, optional): ID of saved prompt template
- `PromptName` (string, optional): Name of saved prompt template
- `PromptText` (string, optional): Direct prompt text (if not using template)
- `ModelID` (string, optional): Specific AI model ID to use
- `ModelName` (string, optional): Specific AI model name to use
- `Temperature` (number, optional): Model temperature (0-2)
- `MaxTokens` (number, optional): Maximum response tokens
- `Variables` (object/string, optional): Variables to inject into prompt template

**Example Usage:**

```typescript
// Using a saved prompt template
const templateResult = await ActionEngine.RunAction({
    ActionName: 'Execute AI Prompt',
    Params: [
        { Name: 'PromptName', Value: 'Summarize Text' },
        { Name: 'Variables', Value: { text: 'Long article text here...' } },
        { Name: 'Temperature', Value: 0.7 }
    ],
    ContextUser: currentUser
});

// Using direct prompt text
const directResult = await ActionEngine.RunAction({
    ActionName: 'Execute AI Prompt',
    Params: [
        { Name: 'PromptText', Value: 'Explain quantum computing in simple terms' },
        { Name: 'ModelName', Value: 'gpt-4' },
        { Name: 'MaxTokens', Value: 500 }
    ],
    ContextUser: currentUser
});
```

## Special Features

### Dual JSON Parameter Support

Many actions support both JSON object and string inputs for flexibility:
- **JSON Object**: Pass JavaScript objects directly
- **JSON String**: Pass stringified JSON for dynamic content

This applies to actions like JSON Transform, HTTP Request, GraphQL Query, and others with object parameters.

### Error Handling and Recovery

Actions implement various error handling strategies:
- **Graceful Degradation**: Actions continue with partial results when possible
- **Detailed Error Messages**: Clear explanations of what went wrong
- **Retry Logic**: Built-in retry mechanisms for transient failures
- **Validation**: Input validation with helpful error messages

### Performance Considerations

- **Streaming Support**: Large file operations use streaming when possible
- **Batch Processing**: Actions process data in chunks for memory efficiency
- **Parallel Execution**: Workflow actions support concurrent processing
- **Resource Management**: Proper cleanup of resources after execution

```bash
npm install @memberjunction/core-actions
```

### 5. Data Transformation Actions

#### CSV Parser Action

Parses CSV data with configurable options for headers, delimiters, and data types.

**Class:** `CSVParserAction`  
**Registration Name:** `"CSV Parser"`

**Parameters:**
- `CSVData` (string, required): The CSV data to parse
- `HasHeaders` (boolean, optional): Whether the first row contains headers (default: true)
- `Delimiter` (string, optional): Field delimiter (default: ',')
- `QuoteCharacter` (string, optional): Quote character for escaping (default: '"')
- `SkipEmptyRows` (boolean, optional): Skip empty rows (default: true)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'CSV Parser',
    Params: [
        { Name: 'CSVData', Value: 'Name,Age,City\nJohn,30,NYC\nJane,25,LA' },
        { Name: 'HasHeaders', Value: true }
    ],
    ContextUser: currentUser
});
```

#### JSON Transform Action

Transforms JSON data using JSONPath-style queries with multiple operations support.

**Class:** `JSONTransformAction`  
**Registration Name:** `"JSON Transform"`

**Parameters:**
- `InputData` (object/string, required): JSON data to transform (supports both JSON object and string)
- `Transformations` (string/array, required): JSONPath queries for transformation
- `OutputFormat` (string, optional): 'object' or 'array' (default: 'object')
- `DefaultValue` (any, optional): Default value for missing paths

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'JSON Transform',
    Params: [
        { Name: 'InputData', Value: { users: [{ name: 'John', age: 30 }] } },
        { Name: 'Transformations', Value: ['name:$.users[0].name', 'age:$.users[0].age'] }
    ],
    ContextUser: currentUser
});
```

#### XML Parser Action

Parses XML data into JSON format with namespace support.

**Class:** `XMLParserAction`  
**Registration Name:** `"XML Parser"`

**Parameters:**
- `XMLData` (string, required): The XML data to parse
- `RemoveNamespaces` (boolean, optional): Strip namespace prefixes (default: false)
- `ParseNumbers` (boolean, optional): Convert numeric strings to numbers (default: true)
- `ParseBooleans` (boolean, optional): Convert boolean strings to booleans (default: true)
- `AttributePrefix` (string, optional): Prefix for attributes (default: '@')

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'XML Parser',
    Params: [
        { Name: 'XMLData', Value: '<root><user id="1"><name>John</name></user></root>' },
        { Name: 'ParseNumbers', Value: true }
    ],
    ContextUser: currentUser
});
```

#### Aggregate Data Action

Performs aggregation operations on arrays of data with support for multiple aggregation functions.

**Class:** `AggregateDataAction`  
**Registration Name:** `"Aggregate Data"`

**Parameters:**
- `Data` (array, required): Array of objects to aggregate
- `GroupBy` (string/array, optional): Field(s) to group by
- `Aggregations` (object/string, required): Aggregation operations (sum, avg, count, min, max)
- `Having` (object, optional): Filter conditions on aggregated results

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Aggregate Data',
    Params: [
        { Name: 'Data', Value: [{ category: 'A', value: 10 }, { category: 'A', value: 20 }] },
        { Name: 'GroupBy', Value: 'category' },
        { Name: 'Aggregations', Value: { totalValue: 'sum:value', avgValue: 'avg:value' } }
    ],
    ContextUser: currentUser
});
```

#### Data Mapper Action

Maps data from one structure to another using field mappings and transformations.

**Class:** `DataMapperAction`  
**Registration Name:** `"Data Mapper"`

**Parameters:**
- `SourceData` (object/array, required): Data to map
- `Mappings` (object/string, required): Field mapping configuration
- `DefaultValues` (object, optional): Default values for missing fields
- `RemoveUnmapped` (boolean, optional): Remove fields not in mapping (default: false)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Data Mapper',
    Params: [
        { Name: 'SourceData', Value: { firstName: 'John', lastName: 'Doe' } },
        { Name: 'Mappings', Value: { fullName: '{{firstName}} {{lastName}}' } }
    ],
    ContextUser: currentUser
});
```

### 6. File Operations Actions

#### PDF Generator Action

Generates PDF documents from HTML or markdown content.

**Class:** `PDFGeneratorAction`  
**Registration Name:** `"PDF Generator"`

**Parameters:**
- `Content` (string, required): HTML or markdown content
- `ContentType` (string, optional): 'html' or 'markdown' (default: 'html')
- `Options` (object/string, optional): PDF options (margins, orientation, etc.)
- `FileName` (string, optional): Output filename

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'PDF Generator',
    Params: [
        { Name: 'Content', Value: '<h1>Report</h1><p>Content here</p>' },
        { Name: 'Options', Value: { margin: { top: '1in' }, orientation: 'portrait' } }
    ],
    ContextUser: currentUser
});
```

#### PDF Extractor Action

Extracts text and metadata from PDF files.

**Class:** `PDFExtractorAction`  
**Registration Name:** `"PDF Extractor"`

**Parameters:**
- `PDFData` (Buffer/string, required): PDF file data or base64 string
- `ExtractText` (boolean, optional): Extract text content (default: true)
- `ExtractMetadata` (boolean, optional): Extract document metadata (default: true)
- `PageRange` (string, optional): Pages to extract (e.g., '1-5,7,9-10')

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'PDF Extractor',
    Params: [
        { Name: 'PDFData', Value: pdfBuffer },
        { Name: 'PageRange', Value: '1-10' }
    ],
    ContextUser: currentUser
});
```

#### Excel Reader Action

Reads data from Excel files with support for multiple sheets.

**Class:** `ExcelReaderAction`  
**Registration Name:** `"Excel Reader"`

**Parameters:**
- `ExcelData` (Buffer/string, required): Excel file data or base64 string
- `SheetName` (string, optional): Specific sheet to read
- `Range` (string, optional): Cell range to read (e.g., 'A1:D10')
- `ParseDates` (boolean, optional): Convert Excel dates (default: true)
- `IncludeEmptyRows` (boolean, optional): Include empty rows (default: false)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Excel Reader',
    Params: [
        { Name: 'ExcelData', Value: excelBuffer },
        { Name: 'SheetName', Value: 'Sales Data' }
    ],
    ContextUser: currentUser
});
```

#### Excel Writer Action

Creates Excel files from data with formatting options.

**Class:** `ExcelWriterAction`  
**Registration Name:** `"Excel Writer"`

**Parameters:**
- `Data` (array/object, required): Data to write (array of objects or sheets config)
- `SheetName` (string, optional): Sheet name (default: 'Sheet1')
- `IncludeHeaders` (boolean, optional): Include column headers (default: true)
- `ColumnWidths` (object, optional): Custom column widths
- `Formatting` (object/string, optional): Cell formatting rules

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Excel Writer',
    Params: [
        { Name: 'Data', Value: [{ name: 'John', sales: 1000 }, { name: 'Jane', sales: 1500 }] },
        { Name: 'SheetName', Value: 'Sales Report' }
    ],
    ContextUser: currentUser
});
```

#### File Compress Action

Compresses files into ZIP archives.

**Class:** `FileCompressAction`  
**Registration Name:** `"File Compress"`

**Parameters:**
- `Files` (array, required): Array of file objects with name and content
- `CompressionLevel` (number, optional): Compression level 0-9 (default: 6)
- `ArchiveName` (string, optional): Output archive name
- `Password` (string, optional): Password protection for archive

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'File Compress',
    Params: [
        { Name: 'Files', Value: [
            { name: 'report.txt', content: 'Report content' },
            { name: 'data.json', content: JSON.stringify(data) }
        ]},
        { Name: 'ArchiveName', Value: 'backup.zip' }
    ],
    ContextUser: currentUser
});
```

### 7. Integration Actions

#### HTTP Request Action

Makes HTTP requests with full control over headers, body, and authentication.

**Class:** `HTTPRequestAction`  
**Registration Name:** `"HTTP Request"`

**Parameters:**
- `URL` (string, required): Request URL
- `Method` (string, optional): HTTP method (default: 'GET')
- `Headers` (object/string, optional): Request headers
- `Body` (any, optional): Request body
- `Timeout` (number, optional): Request timeout in ms (default: 30000)
- `RetryCount` (number, optional): Number of retries (default: 0)
- `BasicAuth` (object, optional): Basic authentication credentials

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'HTTP Request',
    Params: [
        { Name: 'URL', Value: 'https://api.example.com/data' },
        { Name: 'Method', Value: 'POST' },
        { Name: 'Headers', Value: { 'Content-Type': 'application/json' } },
        { Name: 'Body', Value: { query: 'test' } }
    ],
    ContextUser: currentUser
});
```

#### GraphQL Query Action

Executes GraphQL queries and mutations with variable support.

**Class:** `GraphQLQueryAction`  
**Registration Name:** `"GraphQL Query"`

**Parameters:**
- `Endpoint` (string, required): GraphQL endpoint URL
- `Query` (string, required): GraphQL query or mutation
- `Variables` (object/string, optional): Query variables
- `Headers` (object/string, optional): Request headers
- `OperationName` (string, optional): Operation name for multi-operation documents

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'GraphQL Query',
    Params: [
        { Name: 'Endpoint', Value: 'https://api.example.com/graphql' },
        { Name: 'Query', Value: 'query GetUser($id: ID!) { user(id: $id) { name email } }' },
        { Name: 'Variables', Value: { id: '123' } }
    ],
    ContextUser: currentUser
});
```

#### OAuth Flow Action

Handles OAuth 2.0 authentication flows.

**Class:** `OAuthFlowAction`  
**Registration Name:** `"OAuth Flow"`

**Parameters:**
- `Provider` (string, required): OAuth provider name
- `ClientID` (string, required): OAuth client ID
- `ClientSecret` (string, required): OAuth client secret
- `RedirectURI` (string, required): Redirect URI
- `Scopes` (string/array, optional): Required scopes
- `State` (string, optional): State parameter for security

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'OAuth Flow',
    Params: [
        { Name: 'Provider', Value: 'google' },
        { Name: 'ClientID', Value: 'your-client-id' },
        { Name: 'ClientSecret', Value: 'your-client-secret' },
        { Name: 'RedirectURI', Value: 'https://app.example.com/callback' },
        { Name: 'Scopes', Value: ['email', 'profile'] }
    ],
    ContextUser: currentUser
});
```

#### API Rate Limiter Action

Manages API rate limiting with queuing and backoff strategies.

**Class:** `APIRateLimiterAction`  
**Registration Name:** `"API Rate Limiter"`

**Parameters:**
- `APIName` (string, required): API identifier
- `RequestsPerWindow` (number, required): Max requests per time window
- `WindowSizeMs` (number, optional): Time window in ms (default: 60000)
- `QueueRequests` (boolean, optional): Queue excess requests (default: true)
- `MaxQueueSize` (number, optional): Maximum queue size (default: 100)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'API Rate Limiter',
    Params: [
        { Name: 'APIName', Value: 'external-api' },
        { Name: 'RequestsPerWindow', Value: 100 },
        { Name: 'WindowSizeMs', Value: 60000 }
    ],
    ContextUser: currentUser
});
```

### 8. Security Actions

#### Password Strength Action

Evaluates password strength and provides improvement suggestions.

**Class:** `PasswordStrengthAction`  
**Registration Name:** `"Password Strength"`

**Parameters:**
- `Password` (string, required): Password to evaluate
- `MinLength` (number, optional): Minimum required length (default: 8)
- `RequireUppercase` (boolean, optional): Require uppercase letters (default: true)
- `RequireLowercase` (boolean, optional): Require lowercase letters (default: true)
- `RequireNumbers` (boolean, optional): Require numbers (default: true)
- `RequireSpecial` (boolean, optional): Require special characters (default: true)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Password Strength',
    Params: [
        { Name: 'Password', Value: 'MyP@ssw0rd' },
        { Name: 'MinLength', Value: 12 }
    ],
    ContextUser: currentUser
});
```

### 9. Workflow Control Actions

#### Conditional Action

Executes actions based on conditional logic.

**Class:** `ConditionalAction`  
**Registration Name:** `"Conditional"`

**Parameters:**
- `Condition` (string, required): JavaScript expression to evaluate
- `ThenAction` (object, required): Action to run if condition is true
- `ElseAction` (object, optional): Action to run if condition is false
- `Context` (object, optional): Variables available in condition

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Conditional',
    Params: [
        { Name: 'Condition', Value: 'value > 100' },
        { Name: 'Context', Value: { value: 150 } },
        { Name: 'ThenAction', Value: { name: 'Send Email', params: {...} } }
    ],
    ContextUser: currentUser
});
```

#### Loop Action

Executes actions repeatedly with iteration support.

**Class:** `LoopAction`  
**Registration Name:** `"Loop"`

**Parameters:**
- `Items` (array, optional): Array to iterate over
- `Count` (number, optional): Number of iterations (if no items)
- `Action` (object, required): Action to execute for each iteration
- `Parallel` (boolean, optional): Run iterations in parallel (default: false)
- `MaxConcurrency` (number, optional): Max parallel executions (default: 10)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Loop',
    Params: [
        { Name: 'Items', Value: [1, 2, 3, 4, 5] },
        { Name: 'Action', Value: { name: 'Process Item', params: {...} } },
        { Name: 'Parallel', Value: true }
    ],
    ContextUser: currentUser
});
```

#### Parallel Execute Action

Runs multiple actions concurrently with result aggregation.

**Class:** `ParallelExecuteAction`  
**Registration Name:** `"Parallel Execute"`

**Parameters:**
- `Actions` (array, required): Array of actions to execute
- `MaxConcurrency` (number, optional): Maximum concurrent executions (default: 10)
- `StopOnError` (boolean, optional): Stop all if one fails (default: false)
- `Timeout` (number, optional): Overall timeout in ms

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Parallel Execute',
    Params: [
        { Name: 'Actions', Value: [
            { name: 'Web Search', params: { SearchTerms: 'AI' } },
            { name: 'HTTP Request', params: { URL: 'https://api.example.com' } }
        ]},
        { Name: 'MaxConcurrency', Value: 2 }
    ],
    ContextUser: currentUser
});
```

#### Retry Action

Retries failed actions with configurable backoff strategies.

**Class:** `RetryAction`  
**Registration Name:** `"Retry"`

**Parameters:**
- `Action` (object, required): Action to retry
- `MaxRetries` (number, optional): Maximum retry attempts (default: 3)
- `InitialDelay` (number, optional): Initial delay in ms (default: 1000)
- `BackoffMultiplier` (number, optional): Delay multiplier (default: 2)
- `MaxDelay` (number, optional): Maximum delay in ms (default: 30000)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Retry',
    Params: [
        { Name: 'Action', Value: { name: 'HTTP Request', params: {...} } },
        { Name: 'MaxRetries', Value: 5 },
        { Name: 'InitialDelay', Value: 2000 }
    ],
    ContextUser: currentUser
});
```

#### Delay Action

Introduces delays in workflow execution.

**Class:** `DelayAction`  
**Registration Name:** `"Delay"`

**Parameters:**
- `DelayMs` (number, required): Delay duration in milliseconds
- `Jitter` (number, optional): Random jitter to add (0-1, percentage of delay)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Delay',
    Params: [
        { Name: 'DelayMs', Value: 5000 },
        { Name: 'Jitter', Value: 0.1 } // 10% jitter
    ],
    ContextUser: currentUser
});
```

### 10. Communication Actions

#### Slack Webhook Action

Sends messages to Slack channels via webhooks.

**Class:** `SlackWebhookAction`  
**Registration Name:** `"Slack Webhook"`

**Parameters:**
- `WebhookURL` (string, required): Slack webhook URL
- `Message` (string, required): Message text
- `Channel` (string, optional): Override default channel
- `Username` (string, optional): Override default username
- `IconEmoji` (string, optional): Override default icon
- `Attachments` (array/string, optional): Rich message attachments

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Slack Webhook',
    Params: [
        { Name: 'WebhookURL', Value: 'https://hooks.slack.com/services/...' },
        { Name: 'Message', Value: 'Deployment completed successfully!' },
        { Name: 'IconEmoji', Value: ':rocket:' }
    ],
    ContextUser: currentUser
});
```

#### Teams Webhook Action

Sends messages to Microsoft Teams channels via webhooks.

**Class:** `TeamsWebhookAction`  
**Registration Name:** `"Teams Webhook"`

**Parameters:**
- `WebhookURL` (string, required): Teams webhook URL
- `Title` (string, optional): Message title
- `Text` (string, required): Message text
- `ThemeColor` (string, optional): Message accent color
- `Sections` (array/string, optional): Message sections
- `Actions` (array/string, optional): Interactive actions

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Teams Webhook',
    Params: [
        { Name: 'WebhookURL', Value: 'https://outlook.office.com/webhook/...' },
        { Name: 'Title', Value: 'Build Status' },
        { Name: 'Text', Value: 'Build #123 completed successfully' },
        { Name: 'ThemeColor', Value: '00FF00' }
    ],
    ContextUser: currentUser
});
```

### 11. AI Actions

#### Execute AI Prompt Action

Executes AI prompts using MemberJunction's AI framework with model selection and parameter control.

**Class:** `ExecuteAIPromptAction`  
**Registration Name:** `"Execute AI Prompt"`

**Parameters:**
- `PromptID` (string, optional): ID of saved prompt template
- `PromptName` (string, optional): Name of saved prompt template
- `PromptText` (string, optional): Direct prompt text (if not using template)
- `ModelID` (string, optional): Specific AI model ID to use
- `ModelName` (string, optional): Specific AI model name to use
- `Temperature` (number, optional): Model temperature (0-2)
- `MaxTokens` (number, optional): Maximum response tokens
- `Variables` (object/string, optional): Variables to inject into prompt template

**Example Usage:**

```typescript
// Using a saved prompt template
const templateResult = await ActionEngine.RunAction({
    ActionName: 'Execute AI Prompt',
    Params: [
        { Name: 'PromptName', Value: 'Summarize Text' },
        { Name: 'Variables', Value: { text: 'Long article text here...' } },
        { Name: 'Temperature', Value: 0.7 }
    ],
    ContextUser: currentUser
});

// Using direct prompt text
const directResult = await ActionEngine.RunAction({
    ActionName: 'Execute AI Prompt',
    Params: [
        { Name: 'PromptText', Value: 'Explain quantum computing in simple terms' },
        { Name: 'ModelName', Value: 'gpt-4' },
        { Name: 'MaxTokens', Value: 500 }
    ],
    ContextUser: currentUser
});
```

## Special Features

### Dual JSON Parameter Support

Many actions support both JSON object and string inputs for flexibility:
- **JSON Object**: Pass JavaScript objects directly
- **JSON String**: Pass stringified JSON for dynamic content

This applies to actions like JSON Transform, HTTP Request, GraphQL Query, and others with object parameters.

### Error Handling and Recovery

Actions implement various error handling strategies:
- **Graceful Degradation**: Actions continue with partial results when possible
- **Detailed Error Messages**: Clear explanations of what went wrong
- **Retry Logic**: Built-in retry mechanisms for transient failures
- **Validation**: Input validation with helpful error messages

### Performance Considerations

- **Streaming Support**: Large file operations use streaming when possible
- **Batch Processing**: Actions process data in chunks for memory efficiency
- **Parallel Execution**: Workflow actions support concurrent processing
- **Resource Management**: Proper cleanup of resources after execution

```

## Available Actions

### 1. Send Single Message Action

Provides a simple wrapper around the MemberJunction Communication Framework to send single messages through various communication providers.

**Class:** `SendSingleMessageAction`  
**Registration Name:** `"Send Single Message"`

**Parameters:**
- `Subject` (string): The subject of the message
- `Body` (string): The body content of the message
- `To` (string): The recipient's address
- `From` (string): The sender's address
- `Provider` (string): The name of the Communication Provider to use
- `MessageType` (string): The name of the Message Type within the provider

**Example Usage:**

```

### 5. Data Transformation Actions

#### CSV Parser Action

Parses CSV data with configurable options for headers, delimiters, and data types.

**Class:** `CSVParserAction`  
**Registration Name:** `"CSV Parser"`

**Parameters:**
- `CSVData` (string, required): The CSV data to parse
- `HasHeaders` (boolean, optional): Whether the first row contains headers (default: true)
- `Delimiter` (string, optional): Field delimiter (default: ',')
- `QuoteCharacter` (string, optional): Quote character for escaping (default: '"')
- `SkipEmptyRows` (boolean, optional): Skip empty rows (default: true)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'CSV Parser',
    Params: [
        { Name: 'CSVData', Value: 'Name,Age,City\nJohn,30,NYC\nJane,25,LA' },
        { Name: 'HasHeaders', Value: true }
    ],
    ContextUser: currentUser
});
```

#### JSON Transform Action

Transforms JSON data using JSONPath-style queries with multiple operations support.

**Class:** `JSONTransformAction`  
**Registration Name:** `"JSON Transform"`

**Parameters:**
- `InputData` (object/string, required): JSON data to transform (supports both JSON object and string)
- `Transformations` (string/array, required): JSONPath queries for transformation
- `OutputFormat` (string, optional): 'object' or 'array' (default: 'object')
- `DefaultValue` (any, optional): Default value for missing paths

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'JSON Transform',
    Params: [
        { Name: 'InputData', Value: { users: [{ name: 'John', age: 30 }] } },
        { Name: 'Transformations', Value: ['name:$.users[0].name', 'age:$.users[0].age'] }
    ],
    ContextUser: currentUser
});
```

#### XML Parser Action

Parses XML data into JSON format with namespace support.

**Class:** `XMLParserAction`  
**Registration Name:** `"XML Parser"`

**Parameters:**
- `XMLData` (string, required): The XML data to parse
- `RemoveNamespaces` (boolean, optional): Strip namespace prefixes (default: false)
- `ParseNumbers` (boolean, optional): Convert numeric strings to numbers (default: true)
- `ParseBooleans` (boolean, optional): Convert boolean strings to booleans (default: true)
- `AttributePrefix` (string, optional): Prefix for attributes (default: '@')

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'XML Parser',
    Params: [
        { Name: 'XMLData', Value: '<root><user id="1"><name>John</name></user></root>' },
        { Name: 'ParseNumbers', Value: true }
    ],
    ContextUser: currentUser
});
```

#### Aggregate Data Action

Performs aggregation operations on arrays of data with support for multiple aggregation functions.

**Class:** `AggregateDataAction`  
**Registration Name:** `"Aggregate Data"`

**Parameters:**
- `Data` (array, required): Array of objects to aggregate
- `GroupBy` (string/array, optional): Field(s) to group by
- `Aggregations` (object/string, required): Aggregation operations (sum, avg, count, min, max)
- `Having` (object, optional): Filter conditions on aggregated results

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Aggregate Data',
    Params: [
        { Name: 'Data', Value: [{ category: 'A', value: 10 }, { category: 'A', value: 20 }] },
        { Name: 'GroupBy', Value: 'category' },
        { Name: 'Aggregations', Value: { totalValue: 'sum:value', avgValue: 'avg:value' } }
    ],
    ContextUser: currentUser
});
```

#### Data Mapper Action

Maps data from one structure to another using field mappings and transformations.

**Class:** `DataMapperAction`  
**Registration Name:** `"Data Mapper"`

**Parameters:**
- `SourceData` (object/array, required): Data to map
- `Mappings` (object/string, required): Field mapping configuration
- `DefaultValues` (object, optional): Default values for missing fields
- `RemoveUnmapped` (boolean, optional): Remove fields not in mapping (default: false)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Data Mapper',
    Params: [
        { Name: 'SourceData', Value: { firstName: 'John', lastName: 'Doe' } },
        { Name: 'Mappings', Value: { fullName: '{{firstName}} {{lastName}}' } }
    ],
    ContextUser: currentUser
});
```

### 6. File Operations Actions

#### PDF Generator Action

Generates PDF documents from HTML or markdown content.

**Class:** `PDFGeneratorAction`  
**Registration Name:** `"PDF Generator"`

**Parameters:**
- `Content` (string, required): HTML or markdown content
- `ContentType` (string, optional): 'html' or 'markdown' (default: 'html')
- `Options` (object/string, optional): PDF options (margins, orientation, etc.)
- `FileName` (string, optional): Output filename

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'PDF Generator',
    Params: [
        { Name: 'Content', Value: '<h1>Report</h1><p>Content here</p>' },
        { Name: 'Options', Value: { margin: { top: '1in' }, orientation: 'portrait' } }
    ],
    ContextUser: currentUser
});
```

#### PDF Extractor Action

Extracts text and metadata from PDF files.

**Class:** `PDFExtractorAction`  
**Registration Name:** `"PDF Extractor"`

**Parameters:**
- `PDFData` (Buffer/string, required): PDF file data or base64 string
- `ExtractText` (boolean, optional): Extract text content (default: true)
- `ExtractMetadata` (boolean, optional): Extract document metadata (default: true)
- `PageRange` (string, optional): Pages to extract (e.g., '1-5,7,9-10')

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'PDF Extractor',
    Params: [
        { Name: 'PDFData', Value: pdfBuffer },
        { Name: 'PageRange', Value: '1-10' }
    ],
    ContextUser: currentUser
});
```

#### Excel Reader Action

Reads data from Excel files with support for multiple sheets.

**Class:** `ExcelReaderAction`  
**Registration Name:** `"Excel Reader"`

**Parameters:**
- `ExcelData` (Buffer/string, required): Excel file data or base64 string
- `SheetName` (string, optional): Specific sheet to read
- `Range` (string, optional): Cell range to read (e.g., 'A1:D10')
- `ParseDates` (boolean, optional): Convert Excel dates (default: true)
- `IncludeEmptyRows` (boolean, optional): Include empty rows (default: false)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Excel Reader',
    Params: [
        { Name: 'ExcelData', Value: excelBuffer },
        { Name: 'SheetName', Value: 'Sales Data' }
    ],
    ContextUser: currentUser
});
```

#### Excel Writer Action

Creates Excel files from data with formatting options.

**Class:** `ExcelWriterAction`  
**Registration Name:** `"Excel Writer"`

**Parameters:**
- `Data` (array/object, required): Data to write (array of objects or sheets config)
- `SheetName` (string, optional): Sheet name (default: 'Sheet1')
- `IncludeHeaders` (boolean, optional): Include column headers (default: true)
- `ColumnWidths` (object, optional): Custom column widths
- `Formatting` (object/string, optional): Cell formatting rules

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Excel Writer',
    Params: [
        { Name: 'Data', Value: [{ name: 'John', sales: 1000 }, { name: 'Jane', sales: 1500 }] },
        { Name: 'SheetName', Value: 'Sales Report' }
    ],
    ContextUser: currentUser
});
```

#### File Compress Action

Compresses files into ZIP archives.

**Class:** `FileCompressAction`  
**Registration Name:** `"File Compress"`

**Parameters:**
- `Files` (array, required): Array of file objects with name and content
- `CompressionLevel` (number, optional): Compression level 0-9 (default: 6)
- `ArchiveName` (string, optional): Output archive name
- `Password` (string, optional): Password protection for archive

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'File Compress',
    Params: [
        { Name: 'Files', Value: [
            { name: 'report.txt', content: 'Report content' },
            { name: 'data.json', content: JSON.stringify(data) }
        ]},
        { Name: 'ArchiveName', Value: 'backup.zip' }
    ],
    ContextUser: currentUser
});
```

### 7. Integration Actions

#### HTTP Request Action

Makes HTTP requests with full control over headers, body, and authentication.

**Class:** `HTTPRequestAction`  
**Registration Name:** `"HTTP Request"`

**Parameters:**
- `URL` (string, required): Request URL
- `Method` (string, optional): HTTP method (default: 'GET')
- `Headers` (object/string, optional): Request headers
- `Body` (any, optional): Request body
- `Timeout` (number, optional): Request timeout in ms (default: 30000)
- `RetryCount` (number, optional): Number of retries (default: 0)
- `BasicAuth` (object, optional): Basic authentication credentials

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'HTTP Request',
    Params: [
        { Name: 'URL', Value: 'https://api.example.com/data' },
        { Name: 'Method', Value: 'POST' },
        { Name: 'Headers', Value: { 'Content-Type': 'application/json' } },
        { Name: 'Body', Value: { query: 'test' } }
    ],
    ContextUser: currentUser
});
```

#### GraphQL Query Action

Executes GraphQL queries and mutations with variable support.

**Class:** `GraphQLQueryAction`  
**Registration Name:** `"GraphQL Query"`

**Parameters:**
- `Endpoint` (string, required): GraphQL endpoint URL
- `Query` (string, required): GraphQL query or mutation
- `Variables` (object/string, optional): Query variables
- `Headers` (object/string, optional): Request headers
- `OperationName` (string, optional): Operation name for multi-operation documents

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'GraphQL Query',
    Params: [
        { Name: 'Endpoint', Value: 'https://api.example.com/graphql' },
        { Name: 'Query', Value: 'query GetUser($id: ID!) { user(id: $id) { name email } }' },
        { Name: 'Variables', Value: { id: '123' } }
    ],
    ContextUser: currentUser
});
```

#### OAuth Flow Action

Handles OAuth 2.0 authentication flows.

**Class:** `OAuthFlowAction`  
**Registration Name:** `"OAuth Flow"`

**Parameters:**
- `Provider` (string, required): OAuth provider name
- `ClientID` (string, required): OAuth client ID
- `ClientSecret` (string, required): OAuth client secret
- `RedirectURI` (string, required): Redirect URI
- `Scopes` (string/array, optional): Required scopes
- `State` (string, optional): State parameter for security

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'OAuth Flow',
    Params: [
        { Name: 'Provider', Value: 'google' },
        { Name: 'ClientID', Value: 'your-client-id' },
        { Name: 'ClientSecret', Value: 'your-client-secret' },
        { Name: 'RedirectURI', Value: 'https://app.example.com/callback' },
        { Name: 'Scopes', Value: ['email', 'profile'] }
    ],
    ContextUser: currentUser
});
```

#### API Rate Limiter Action

Manages API rate limiting with queuing and backoff strategies.

**Class:** `APIRateLimiterAction`  
**Registration Name:** `"API Rate Limiter"`

**Parameters:**
- `APIName` (string, required): API identifier
- `RequestsPerWindow` (number, required): Max requests per time window
- `WindowSizeMs` (number, optional): Time window in ms (default: 60000)
- `QueueRequests` (boolean, optional): Queue excess requests (default: true)
- `MaxQueueSize` (number, optional): Maximum queue size (default: 100)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'API Rate Limiter',
    Params: [
        { Name: 'APIName', Value: 'external-api' },
        { Name: 'RequestsPerWindow', Value: 100 },
        { Name: 'WindowSizeMs', Value: 60000 }
    ],
    ContextUser: currentUser
});
```

### 8. Security Actions

#### Password Strength Action

Evaluates password strength and provides improvement suggestions.

**Class:** `PasswordStrengthAction`  
**Registration Name:** `"Password Strength"`

**Parameters:**
- `Password` (string, required): Password to evaluate
- `MinLength` (number, optional): Minimum required length (default: 8)
- `RequireUppercase` (boolean, optional): Require uppercase letters (default: true)
- `RequireLowercase` (boolean, optional): Require lowercase letters (default: true)
- `RequireNumbers` (boolean, optional): Require numbers (default: true)
- `RequireSpecial` (boolean, optional): Require special characters (default: true)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Password Strength',
    Params: [
        { Name: 'Password', Value: 'MyP@ssw0rd' },
        { Name: 'MinLength', Value: 12 }
    ],
    ContextUser: currentUser
});
```

### 9. Workflow Control Actions

#### Conditional Action

Executes actions based on conditional logic.

**Class:** `ConditionalAction`  
**Registration Name:** `"Conditional"`

**Parameters:**
- `Condition` (string, required): JavaScript expression to evaluate
- `ThenAction` (object, required): Action to run if condition is true
- `ElseAction` (object, optional): Action to run if condition is false
- `Context` (object, optional): Variables available in condition

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Conditional',
    Params: [
        { Name: 'Condition', Value: 'value > 100' },
        { Name: 'Context', Value: { value: 150 } },
        { Name: 'ThenAction', Value: { name: 'Send Email', params: {...} } }
    ],
    ContextUser: currentUser
});
```

#### Loop Action

Executes actions repeatedly with iteration support.

**Class:** `LoopAction`  
**Registration Name:** `"Loop"`

**Parameters:**
- `Items` (array, optional): Array to iterate over
- `Count` (number, optional): Number of iterations (if no items)
- `Action` (object, required): Action to execute for each iteration
- `Parallel` (boolean, optional): Run iterations in parallel (default: false)
- `MaxConcurrency` (number, optional): Max parallel executions (default: 10)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Loop',
    Params: [
        { Name: 'Items', Value: [1, 2, 3, 4, 5] },
        { Name: 'Action', Value: { name: 'Process Item', params: {...} } },
        { Name: 'Parallel', Value: true }
    ],
    ContextUser: currentUser
});
```

#### Parallel Execute Action

Runs multiple actions concurrently with result aggregation.

**Class:** `ParallelExecuteAction`  
**Registration Name:** `"Parallel Execute"`

**Parameters:**
- `Actions` (array, required): Array of actions to execute
- `MaxConcurrency` (number, optional): Maximum concurrent executions (default: 10)
- `StopOnError` (boolean, optional): Stop all if one fails (default: false)
- `Timeout` (number, optional): Overall timeout in ms

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Parallel Execute',
    Params: [
        { Name: 'Actions', Value: [
            { name: 'Web Search', params: { SearchTerms: 'AI' } },
            { name: 'HTTP Request', params: { URL: 'https://api.example.com' } }
        ]},
        { Name: 'MaxConcurrency', Value: 2 }
    ],
    ContextUser: currentUser
});
```

#### Retry Action

Retries failed actions with configurable backoff strategies.

**Class:** `RetryAction`  
**Registration Name:** `"Retry"`

**Parameters:**
- `Action` (object, required): Action to retry
- `MaxRetries` (number, optional): Maximum retry attempts (default: 3)
- `InitialDelay` (number, optional): Initial delay in ms (default: 1000)
- `BackoffMultiplier` (number, optional): Delay multiplier (default: 2)
- `MaxDelay` (number, optional): Maximum delay in ms (default: 30000)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Retry',
    Params: [
        { Name: 'Action', Value: { name: 'HTTP Request', params: {...} } },
        { Name: 'MaxRetries', Value: 5 },
        { Name: 'InitialDelay', Value: 2000 }
    ],
    ContextUser: currentUser
});
```

#### Delay Action

Introduces delays in workflow execution.

**Class:** `DelayAction`  
**Registration Name:** `"Delay"`

**Parameters:**
- `DelayMs` (number, required): Delay duration in milliseconds
- `Jitter` (number, optional): Random jitter to add (0-1, percentage of delay)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Delay',
    Params: [
        { Name: 'DelayMs', Value: 5000 },
        { Name: 'Jitter', Value: 0.1 } // 10% jitter
    ],
    ContextUser: currentUser
});
```

### 10. Communication Actions

#### Slack Webhook Action

Sends messages to Slack channels via webhooks.

**Class:** `SlackWebhookAction`  
**Registration Name:** `"Slack Webhook"`

**Parameters:**
- `WebhookURL` (string, required): Slack webhook URL
- `Message` (string, required): Message text
- `Channel` (string, optional): Override default channel
- `Username` (string, optional): Override default username
- `IconEmoji` (string, optional): Override default icon
- `Attachments` (array/string, optional): Rich message attachments

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Slack Webhook',
    Params: [
        { Name: 'WebhookURL', Value: 'https://hooks.slack.com/services/...' },
        { Name: 'Message', Value: 'Deployment completed successfully!' },
        { Name: 'IconEmoji', Value: ':rocket:' }
    ],
    ContextUser: currentUser
});
```

#### Teams Webhook Action

Sends messages to Microsoft Teams channels via webhooks.

**Class:** `TeamsWebhookAction`  
**Registration Name:** `"Teams Webhook"`

**Parameters:**
- `WebhookURL` (string, required): Teams webhook URL
- `Title` (string, optional): Message title
- `Text` (string, required): Message text
- `ThemeColor` (string, optional): Message accent color
- `Sections` (array/string, optional): Message sections
- `Actions` (array/string, optional): Interactive actions

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Teams Webhook',
    Params: [
        { Name: 'WebhookURL', Value: 'https://outlook.office.com/webhook/...' },
        { Name: 'Title', Value: 'Build Status' },
        { Name: 'Text', Value: 'Build #123 completed successfully' },
        { Name: 'ThemeColor', Value: '00FF00' }
    ],
    ContextUser: currentUser
});
```

### 11. AI Actions

#### Execute AI Prompt Action

Executes AI prompts using MemberJunction's AI framework with model selection and parameter control.

**Class:** `ExecuteAIPromptAction`  
**Registration Name:** `"Execute AI Prompt"`

**Parameters:**
- `PromptID` (string, optional): ID of saved prompt template
- `PromptName` (string, optional): Name of saved prompt template
- `PromptText` (string, optional): Direct prompt text (if not using template)
- `ModelID` (string, optional): Specific AI model ID to use
- `ModelName` (string, optional): Specific AI model name to use
- `Temperature` (number, optional): Model temperature (0-2)
- `MaxTokens` (number, optional): Maximum response tokens
- `Variables` (object/string, optional): Variables to inject into prompt template

**Example Usage:**

```typescript
// Using a saved prompt template
const templateResult = await ActionEngine.RunAction({
    ActionName: 'Execute AI Prompt',
    Params: [
        { Name: 'PromptName', Value: 'Summarize Text' },
        { Name: 'Variables', Value: { text: 'Long article text here...' } },
        { Name: 'Temperature', Value: 0.7 }
    ],
    ContextUser: currentUser
});

// Using direct prompt text
const directResult = await ActionEngine.RunAction({
    ActionName: 'Execute AI Prompt',
    Params: [
        { Name: 'PromptText', Value: 'Explain quantum computing in simple terms' },
        { Name: 'ModelName', Value: 'gpt-4' },
        { Name: 'MaxTokens', Value: 500 }
    ],
    ContextUser: currentUser
});
```

## Special Features

### Dual JSON Parameter Support

Many actions support both JSON object and string inputs for flexibility:
- **JSON Object**: Pass JavaScript objects directly
- **JSON String**: Pass stringified JSON for dynamic content

This applies to actions like JSON Transform, HTTP Request, GraphQL Query, and others with object parameters.

### Error Handling and Recovery

Actions implement various error handling strategies:
- **Graceful Degradation**: Actions continue with partial results when possible
- **Detailed Error Messages**: Clear explanations of what went wrong
- **Retry Logic**: Built-in retry mechanisms for transient failures
- **Validation**: Input validation with helpful error messages

### Performance Considerations

- **Streaming Support**: Large file operations use streaming when possible
- **Batch Processing**: Actions process data in chunks for memory efficiency
- **Parallel Execution**: Workflow actions support concurrent processing
- **Resource Management**: Proper cleanup of resources after execution

```typescript
import { SendSingleMessageAction } from '@memberjunction/core-actions';
import { ActionEngine } from '@memberjunction/actions';

// Execute the action through the Action Engine
const result = await ActionEngine.RunAction({
    ActionName: 'Send Single Message',
    Params: [
        { Name: 'Subject', Value: 'Welcome to MemberJunction' },
        { Name: 'Body', Value: 'Thank you for joining our platform!' },
        { Name: 'To', Value: 'user@example.com' },
        { Name: 'From', Value: 'noreply@memberjunction.com' },
        { Name: 'Provider', Value: 'SendGrid' },
        { Name: 'MessageType', Value: 'Email' }
    ],
    ContextUser: currentUser
});

if (result.Success) {
    console.log('Message sent successfully');
} else {
    console.error('Failed to send message:', result.Message);
}
```

### 5. Data Transformation Actions

#### CSV Parser Action

Parses CSV data with configurable options for headers, delimiters, and data types.

**Class:** `CSVParserAction`  
**Registration Name:** `"CSV Parser"`

**Parameters:**
- `CSVData` (string, required): The CSV data to parse
- `HasHeaders` (boolean, optional): Whether the first row contains headers (default: true)
- `Delimiter` (string, optional): Field delimiter (default: ',')
- `QuoteCharacter` (string, optional): Quote character for escaping (default: '"')
- `SkipEmptyRows` (boolean, optional): Skip empty rows (default: true)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'CSV Parser',
    Params: [
        { Name: 'CSVData', Value: 'Name,Age,City\nJohn,30,NYC\nJane,25,LA' },
        { Name: 'HasHeaders', Value: true }
    ],
    ContextUser: currentUser
});
```

#### JSON Transform Action

Transforms JSON data using JSONPath-style queries with multiple operations support.

**Class:** `JSONTransformAction`  
**Registration Name:** `"JSON Transform"`

**Parameters:**
- `InputData` (object/string, required): JSON data to transform (supports both JSON object and string)
- `Transformations` (string/array, required): JSONPath queries for transformation
- `OutputFormat` (string, optional): 'object' or 'array' (default: 'object')
- `DefaultValue` (any, optional): Default value for missing paths

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'JSON Transform',
    Params: [
        { Name: 'InputData', Value: { users: [{ name: 'John', age: 30 }] } },
        { Name: 'Transformations', Value: ['name:$.users[0].name', 'age:$.users[0].age'] }
    ],
    ContextUser: currentUser
});
```

#### XML Parser Action

Parses XML data into JSON format with namespace support.

**Class:** `XMLParserAction`  
**Registration Name:** `"XML Parser"`

**Parameters:**
- `XMLData` (string, required): The XML data to parse
- `RemoveNamespaces` (boolean, optional): Strip namespace prefixes (default: false)
- `ParseNumbers` (boolean, optional): Convert numeric strings to numbers (default: true)
- `ParseBooleans` (boolean, optional): Convert boolean strings to booleans (default: true)
- `AttributePrefix` (string, optional): Prefix for attributes (default: '@')

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'XML Parser',
    Params: [
        { Name: 'XMLData', Value: '<root><user id="1"><name>John</name></user></root>' },
        { Name: 'ParseNumbers', Value: true }
    ],
    ContextUser: currentUser
});
```

#### Aggregate Data Action

Performs aggregation operations on arrays of data with support for multiple aggregation functions.

**Class:** `AggregateDataAction`  
**Registration Name:** `"Aggregate Data"`

**Parameters:**
- `Data` (array, required): Array of objects to aggregate
- `GroupBy` (string/array, optional): Field(s) to group by
- `Aggregations` (object/string, required): Aggregation operations (sum, avg, count, min, max)
- `Having` (object, optional): Filter conditions on aggregated results

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Aggregate Data',
    Params: [
        { Name: 'Data', Value: [{ category: 'A', value: 10 }, { category: 'A', value: 20 }] },
        { Name: 'GroupBy', Value: 'category' },
        { Name: 'Aggregations', Value: { totalValue: 'sum:value', avgValue: 'avg:value' } }
    ],
    ContextUser: currentUser
});
```

#### Data Mapper Action

Maps data from one structure to another using field mappings and transformations.

**Class:** `DataMapperAction`  
**Registration Name:** `"Data Mapper"`

**Parameters:**
- `SourceData` (object/array, required): Data to map
- `Mappings` (object/string, required): Field mapping configuration
- `DefaultValues` (object, optional): Default values for missing fields
- `RemoveUnmapped` (boolean, optional): Remove fields not in mapping (default: false)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Data Mapper',
    Params: [
        { Name: 'SourceData', Value: { firstName: 'John', lastName: 'Doe' } },
        { Name: 'Mappings', Value: { fullName: '{{firstName}} {{lastName}}' } }
    ],
    ContextUser: currentUser
});
```

### 6. File Operations Actions

#### PDF Generator Action

Generates PDF documents from HTML or markdown content.

**Class:** `PDFGeneratorAction`  
**Registration Name:** `"PDF Generator"`

**Parameters:**
- `Content` (string, required): HTML or markdown content
- `ContentType` (string, optional): 'html' or 'markdown' (default: 'html')
- `Options` (object/string, optional): PDF options (margins, orientation, etc.)
- `FileName` (string, optional): Output filename

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'PDF Generator',
    Params: [
        { Name: 'Content', Value: '<h1>Report</h1><p>Content here</p>' },
        { Name: 'Options', Value: { margin: { top: '1in' }, orientation: 'portrait' } }
    ],
    ContextUser: currentUser
});
```

#### PDF Extractor Action

Extracts text and metadata from PDF files.

**Class:** `PDFExtractorAction`  
**Registration Name:** `"PDF Extractor"`

**Parameters:**
- `PDFData` (Buffer/string, required): PDF file data or base64 string
- `ExtractText` (boolean, optional): Extract text content (default: true)
- `ExtractMetadata` (boolean, optional): Extract document metadata (default: true)
- `PageRange` (string, optional): Pages to extract (e.g., '1-5,7,9-10')

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'PDF Extractor',
    Params: [
        { Name: 'PDFData', Value: pdfBuffer },
        { Name: 'PageRange', Value: '1-10' }
    ],
    ContextUser: currentUser
});
```

#### Excel Reader Action

Reads data from Excel files with support for multiple sheets.

**Class:** `ExcelReaderAction`  
**Registration Name:** `"Excel Reader"`

**Parameters:**
- `ExcelData` (Buffer/string, required): Excel file data or base64 string
- `SheetName` (string, optional): Specific sheet to read
- `Range` (string, optional): Cell range to read (e.g., 'A1:D10')
- `ParseDates` (boolean, optional): Convert Excel dates (default: true)
- `IncludeEmptyRows` (boolean, optional): Include empty rows (default: false)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Excel Reader',
    Params: [
        { Name: 'ExcelData', Value: excelBuffer },
        { Name: 'SheetName', Value: 'Sales Data' }
    ],
    ContextUser: currentUser
});
```

#### Excel Writer Action

Creates Excel files from data with formatting options.

**Class:** `ExcelWriterAction`  
**Registration Name:** `"Excel Writer"`

**Parameters:**
- `Data` (array/object, required): Data to write (array of objects or sheets config)
- `SheetName` (string, optional): Sheet name (default: 'Sheet1')
- `IncludeHeaders` (boolean, optional): Include column headers (default: true)
- `ColumnWidths` (object, optional): Custom column widths
- `Formatting` (object/string, optional): Cell formatting rules

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Excel Writer',
    Params: [
        { Name: 'Data', Value: [{ name: 'John', sales: 1000 }, { name: 'Jane', sales: 1500 }] },
        { Name: 'SheetName', Value: 'Sales Report' }
    ],
    ContextUser: currentUser
});
```

#### File Compress Action

Compresses files into ZIP archives.

**Class:** `FileCompressAction`  
**Registration Name:** `"File Compress"`

**Parameters:**
- `Files` (array, required): Array of file objects with name and content
- `CompressionLevel` (number, optional): Compression level 0-9 (default: 6)
- `ArchiveName` (string, optional): Output archive name
- `Password` (string, optional): Password protection for archive

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'File Compress',
    Params: [
        { Name: 'Files', Value: [
            { name: 'report.txt', content: 'Report content' },
            { name: 'data.json', content: JSON.stringify(data) }
        ]},
        { Name: 'ArchiveName', Value: 'backup.zip' }
    ],
    ContextUser: currentUser
});
```

### 7. Integration Actions

#### HTTP Request Action

Makes HTTP requests with full control over headers, body, and authentication.

**Class:** `HTTPRequestAction`  
**Registration Name:** `"HTTP Request"`

**Parameters:**
- `URL` (string, required): Request URL
- `Method` (string, optional): HTTP method (default: 'GET')
- `Headers` (object/string, optional): Request headers
- `Body` (any, optional): Request body
- `Timeout` (number, optional): Request timeout in ms (default: 30000)
- `RetryCount` (number, optional): Number of retries (default: 0)
- `BasicAuth` (object, optional): Basic authentication credentials

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'HTTP Request',
    Params: [
        { Name: 'URL', Value: 'https://api.example.com/data' },
        { Name: 'Method', Value: 'POST' },
        { Name: 'Headers', Value: { 'Content-Type': 'application/json' } },
        { Name: 'Body', Value: { query: 'test' } }
    ],
    ContextUser: currentUser
});
```

#### GraphQL Query Action

Executes GraphQL queries and mutations with variable support.

**Class:** `GraphQLQueryAction`  
**Registration Name:** `"GraphQL Query"`

**Parameters:**
- `Endpoint` (string, required): GraphQL endpoint URL
- `Query` (string, required): GraphQL query or mutation
- `Variables` (object/string, optional): Query variables
- `Headers` (object/string, optional): Request headers
- `OperationName` (string, optional): Operation name for multi-operation documents

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'GraphQL Query',
    Params: [
        { Name: 'Endpoint', Value: 'https://api.example.com/graphql' },
        { Name: 'Query', Value: 'query GetUser($id: ID!) { user(id: $id) { name email } }' },
        { Name: 'Variables', Value: { id: '123' } }
    ],
    ContextUser: currentUser
});
```

#### OAuth Flow Action

Handles OAuth 2.0 authentication flows.

**Class:** `OAuthFlowAction`  
**Registration Name:** `"OAuth Flow"`

**Parameters:**
- `Provider` (string, required): OAuth provider name
- `ClientID` (string, required): OAuth client ID
- `ClientSecret` (string, required): OAuth client secret
- `RedirectURI` (string, required): Redirect URI
- `Scopes` (string/array, optional): Required scopes
- `State` (string, optional): State parameter for security

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'OAuth Flow',
    Params: [
        { Name: 'Provider', Value: 'google' },
        { Name: 'ClientID', Value: 'your-client-id' },
        { Name: 'ClientSecret', Value: 'your-client-secret' },
        { Name: 'RedirectURI', Value: 'https://app.example.com/callback' },
        { Name: 'Scopes', Value: ['email', 'profile'] }
    ],
    ContextUser: currentUser
});
```

#### API Rate Limiter Action

Manages API rate limiting with queuing and backoff strategies.

**Class:** `APIRateLimiterAction`  
**Registration Name:** `"API Rate Limiter"`

**Parameters:**
- `APIName` (string, required): API identifier
- `RequestsPerWindow` (number, required): Max requests per time window
- `WindowSizeMs` (number, optional): Time window in ms (default: 60000)
- `QueueRequests` (boolean, optional): Queue excess requests (default: true)
- `MaxQueueSize` (number, optional): Maximum queue size (default: 100)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'API Rate Limiter',
    Params: [
        { Name: 'APIName', Value: 'external-api' },
        { Name: 'RequestsPerWindow', Value: 100 },
        { Name: 'WindowSizeMs', Value: 60000 }
    ],
    ContextUser: currentUser
});
```

### 8. Security Actions

#### Password Strength Action

Evaluates password strength and provides improvement suggestions.

**Class:** `PasswordStrengthAction`  
**Registration Name:** `"Password Strength"`

**Parameters:**
- `Password` (string, required): Password to evaluate
- `MinLength` (number, optional): Minimum required length (default: 8)
- `RequireUppercase` (boolean, optional): Require uppercase letters (default: true)
- `RequireLowercase` (boolean, optional): Require lowercase letters (default: true)
- `RequireNumbers` (boolean, optional): Require numbers (default: true)
- `RequireSpecial` (boolean, optional): Require special characters (default: true)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Password Strength',
    Params: [
        { Name: 'Password', Value: 'MyP@ssw0rd' },
        { Name: 'MinLength', Value: 12 }
    ],
    ContextUser: currentUser
});
```

### 9. Workflow Control Actions

#### Conditional Action

Executes actions based on conditional logic.

**Class:** `ConditionalAction`  
**Registration Name:** `"Conditional"`

**Parameters:**
- `Condition` (string, required): JavaScript expression to evaluate
- `ThenAction` (object, required): Action to run if condition is true
- `ElseAction` (object, optional): Action to run if condition is false
- `Context` (object, optional): Variables available in condition

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Conditional',
    Params: [
        { Name: 'Condition', Value: 'value > 100' },
        { Name: 'Context', Value: { value: 150 } },
        { Name: 'ThenAction', Value: { name: 'Send Email', params: {...} } }
    ],
    ContextUser: currentUser
});
```

#### Loop Action

Executes actions repeatedly with iteration support.

**Class:** `LoopAction`  
**Registration Name:** `"Loop"`

**Parameters:**
- `Items` (array, optional): Array to iterate over
- `Count` (number, optional): Number of iterations (if no items)
- `Action` (object, required): Action to execute for each iteration
- `Parallel` (boolean, optional): Run iterations in parallel (default: false)
- `MaxConcurrency` (number, optional): Max parallel executions (default: 10)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Loop',
    Params: [
        { Name: 'Items', Value: [1, 2, 3, 4, 5] },
        { Name: 'Action', Value: { name: 'Process Item', params: {...} } },
        { Name: 'Parallel', Value: true }
    ],
    ContextUser: currentUser
});
```

#### Parallel Execute Action

Runs multiple actions concurrently with result aggregation.

**Class:** `ParallelExecuteAction`  
**Registration Name:** `"Parallel Execute"`

**Parameters:**
- `Actions` (array, required): Array of actions to execute
- `MaxConcurrency` (number, optional): Maximum concurrent executions (default: 10)
- `StopOnError` (boolean, optional): Stop all if one fails (default: false)
- `Timeout` (number, optional): Overall timeout in ms

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Parallel Execute',
    Params: [
        { Name: 'Actions', Value: [
            { name: 'Web Search', params: { SearchTerms: 'AI' } },
            { name: 'HTTP Request', params: { URL: 'https://api.example.com' } }
        ]},
        { Name: 'MaxConcurrency', Value: 2 }
    ],
    ContextUser: currentUser
});
```

#### Retry Action

Retries failed actions with configurable backoff strategies.

**Class:** `RetryAction`  
**Registration Name:** `"Retry"`

**Parameters:**
- `Action` (object, required): Action to retry
- `MaxRetries` (number, optional): Maximum retry attempts (default: 3)
- `InitialDelay` (number, optional): Initial delay in ms (default: 1000)
- `BackoffMultiplier` (number, optional): Delay multiplier (default: 2)
- `MaxDelay` (number, optional): Maximum delay in ms (default: 30000)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Retry',
    Params: [
        { Name: 'Action', Value: { name: 'HTTP Request', params: {...} } },
        { Name: 'MaxRetries', Value: 5 },
        { Name: 'InitialDelay', Value: 2000 }
    ],
    ContextUser: currentUser
});
```

#### Delay Action

Introduces delays in workflow execution.

**Class:** `DelayAction`  
**Registration Name:** `"Delay"`

**Parameters:**
- `DelayMs` (number, required): Delay duration in milliseconds
- `Jitter` (number, optional): Random jitter to add (0-1, percentage of delay)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Delay',
    Params: [
        { Name: 'DelayMs', Value: 5000 },
        { Name: 'Jitter', Value: 0.1 } // 10% jitter
    ],
    ContextUser: currentUser
});
```

### 10. Communication Actions

#### Slack Webhook Action

Sends messages to Slack channels via webhooks.

**Class:** `SlackWebhookAction`  
**Registration Name:** `"Slack Webhook"`

**Parameters:**
- `WebhookURL` (string, required): Slack webhook URL
- `Message` (string, required): Message text
- `Channel` (string, optional): Override default channel
- `Username` (string, optional): Override default username
- `IconEmoji` (string, optional): Override default icon
- `Attachments` (array/string, optional): Rich message attachments

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Slack Webhook',
    Params: [
        { Name: 'WebhookURL', Value: 'https://hooks.slack.com/services/...' },
        { Name: 'Message', Value: 'Deployment completed successfully!' },
        { Name: 'IconEmoji', Value: ':rocket:' }
    ],
    ContextUser: currentUser
});
```

#### Teams Webhook Action

Sends messages to Microsoft Teams channels via webhooks.

**Class:** `TeamsWebhookAction`  
**Registration Name:** `"Teams Webhook"`

**Parameters:**
- `WebhookURL` (string, required): Teams webhook URL
- `Title` (string, optional): Message title
- `Text` (string, required): Message text
- `ThemeColor` (string, optional): Message accent color
- `Sections` (array/string, optional): Message sections
- `Actions` (array/string, optional): Interactive actions

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Teams Webhook',
    Params: [
        { Name: 'WebhookURL', Value: 'https://outlook.office.com/webhook/...' },
        { Name: 'Title', Value: 'Build Status' },
        { Name: 'Text', Value: 'Build #123 completed successfully' },
        { Name: 'ThemeColor', Value: '00FF00' }
    ],
    ContextUser: currentUser
});
```

### 11. AI Actions

#### Execute AI Prompt Action

Executes AI prompts using MemberJunction's AI framework with model selection and parameter control.

**Class:** `ExecuteAIPromptAction`  
**Registration Name:** `"Execute AI Prompt"`

**Parameters:**
- `PromptID` (string, optional): ID of saved prompt template
- `PromptName` (string, optional): Name of saved prompt template
- `PromptText` (string, optional): Direct prompt text (if not using template)
- `ModelID` (string, optional): Specific AI model ID to use
- `ModelName` (string, optional): Specific AI model name to use
- `Temperature` (number, optional): Model temperature (0-2)
- `MaxTokens` (number, optional): Maximum response tokens
- `Variables` (object/string, optional): Variables to inject into prompt template

**Example Usage:**

```typescript
// Using a saved prompt template
const templateResult = await ActionEngine.RunAction({
    ActionName: 'Execute AI Prompt',
    Params: [
        { Name: 'PromptName', Value: 'Summarize Text' },
        { Name: 'Variables', Value: { text: 'Long article text here...' } },
        { Name: 'Temperature', Value: 0.7 }
    ],
    ContextUser: currentUser
});

// Using direct prompt text
const directResult = await ActionEngine.RunAction({
    ActionName: 'Execute AI Prompt',
    Params: [
        { Name: 'PromptText', Value: 'Explain quantum computing in simple terms' },
        { Name: 'ModelName', Value: 'gpt-4' },
        { Name: 'MaxTokens', Value: 500 }
    ],
    ContextUser: currentUser
});
```

## Special Features

### Dual JSON Parameter Support

Many actions support both JSON object and string inputs for flexibility:
- **JSON Object**: Pass JavaScript objects directly
- **JSON String**: Pass stringified JSON for dynamic content

This applies to actions like JSON Transform, HTTP Request, GraphQL Query, and others with object parameters.

### Error Handling and Recovery

Actions implement various error handling strategies:
- **Graceful Degradation**: Actions continue with partial results when possible
- **Detailed Error Messages**: Clear explanations of what went wrong
- **Retry Logic**: Built-in retry mechanisms for transient failures
- **Validation**: Input validation with helpful error messages

### Performance Considerations

- **Streaming Support**: Large file operations use streaming when possible
- **Batch Processing**: Actions process data in chunks for memory efficiency
- **Parallel Execution**: Workflow actions support concurrent processing
- **Resource Management**: Proper cleanup of resources after execution

```

### 2. Vectorize Entity Action

Enables vectorization of entity data for AI and machine learning operations. This action integrates with MemberJunction's AI vector synchronization system to create vector embeddings of entity records.

**Class:** `VectorizeEntityAction`  
**Registration Name:** `"Vectorize Entity"`

**Parameters:**
- `EntityNames` (string | string[]): Entity name(s) to vectorize. Can be:
  - A single entity name as a string
  - Multiple entity names as a comma-separated string
  - An array of entity names

**Example Usage:**

```

### 5. Data Transformation Actions

#### CSV Parser Action

Parses CSV data with configurable options for headers, delimiters, and data types.

**Class:** `CSVParserAction`  
**Registration Name:** `"CSV Parser"`

**Parameters:**
- `CSVData` (string, required): The CSV data to parse
- `HasHeaders` (boolean, optional): Whether the first row contains headers (default: true)
- `Delimiter` (string, optional): Field delimiter (default: ',')
- `QuoteCharacter` (string, optional): Quote character for escaping (default: '"')
- `SkipEmptyRows` (boolean, optional): Skip empty rows (default: true)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'CSV Parser',
    Params: [
        { Name: 'CSVData', Value: 'Name,Age,City\nJohn,30,NYC\nJane,25,LA' },
        { Name: 'HasHeaders', Value: true }
    ],
    ContextUser: currentUser
});
```

#### JSON Transform Action

Transforms JSON data using JSONPath-style queries with multiple operations support.

**Class:** `JSONTransformAction`  
**Registration Name:** `"JSON Transform"`

**Parameters:**
- `InputData` (object/string, required): JSON data to transform (supports both JSON object and string)
- `Transformations` (string/array, required): JSONPath queries for transformation
- `OutputFormat` (string, optional): 'object' or 'array' (default: 'object')
- `DefaultValue` (any, optional): Default value for missing paths

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'JSON Transform',
    Params: [
        { Name: 'InputData', Value: { users: [{ name: 'John', age: 30 }] } },
        { Name: 'Transformations', Value: ['name:$.users[0].name', 'age:$.users[0].age'] }
    ],
    ContextUser: currentUser
});
```

#### XML Parser Action

Parses XML data into JSON format with namespace support.

**Class:** `XMLParserAction`  
**Registration Name:** `"XML Parser"`

**Parameters:**
- `XMLData` (string, required): The XML data to parse
- `RemoveNamespaces` (boolean, optional): Strip namespace prefixes (default: false)
- `ParseNumbers` (boolean, optional): Convert numeric strings to numbers (default: true)
- `ParseBooleans` (boolean, optional): Convert boolean strings to booleans (default: true)
- `AttributePrefix` (string, optional): Prefix for attributes (default: '@')

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'XML Parser',
    Params: [
        { Name: 'XMLData', Value: '<root><user id="1"><name>John</name></user></root>' },
        { Name: 'ParseNumbers', Value: true }
    ],
    ContextUser: currentUser
});
```

#### Aggregate Data Action

Performs aggregation operations on arrays of data with support for multiple aggregation functions.

**Class:** `AggregateDataAction`  
**Registration Name:** `"Aggregate Data"`

**Parameters:**
- `Data` (array, required): Array of objects to aggregate
- `GroupBy` (string/array, optional): Field(s) to group by
- `Aggregations` (object/string, required): Aggregation operations (sum, avg, count, min, max)
- `Having` (object, optional): Filter conditions on aggregated results

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Aggregate Data',
    Params: [
        { Name: 'Data', Value: [{ category: 'A', value: 10 }, { category: 'A', value: 20 }] },
        { Name: 'GroupBy', Value: 'category' },
        { Name: 'Aggregations', Value: { totalValue: 'sum:value', avgValue: 'avg:value' } }
    ],
    ContextUser: currentUser
});
```

#### Data Mapper Action

Maps data from one structure to another using field mappings and transformations.

**Class:** `DataMapperAction`  
**Registration Name:** `"Data Mapper"`

**Parameters:**
- `SourceData` (object/array, required): Data to map
- `Mappings` (object/string, required): Field mapping configuration
- `DefaultValues` (object, optional): Default values for missing fields
- `RemoveUnmapped` (boolean, optional): Remove fields not in mapping (default: false)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Data Mapper',
    Params: [
        { Name: 'SourceData', Value: { firstName: 'John', lastName: 'Doe' } },
        { Name: 'Mappings', Value: { fullName: '{{firstName}} {{lastName}}' } }
    ],
    ContextUser: currentUser
});
```

### 6. File Operations Actions

#### PDF Generator Action

Generates PDF documents from HTML or markdown content.

**Class:** `PDFGeneratorAction`  
**Registration Name:** `"PDF Generator"`

**Parameters:**
- `Content` (string, required): HTML or markdown content
- `ContentType` (string, optional): 'html' or 'markdown' (default: 'html')
- `Options` (object/string, optional): PDF options (margins, orientation, etc.)
- `FileName` (string, optional): Output filename

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'PDF Generator',
    Params: [
        { Name: 'Content', Value: '<h1>Report</h1><p>Content here</p>' },
        { Name: 'Options', Value: { margin: { top: '1in' }, orientation: 'portrait' } }
    ],
    ContextUser: currentUser
});
```

#### PDF Extractor Action

Extracts text and metadata from PDF files.

**Class:** `PDFExtractorAction`  
**Registration Name:** `"PDF Extractor"`

**Parameters:**
- `PDFData` (Buffer/string, required): PDF file data or base64 string
- `ExtractText` (boolean, optional): Extract text content (default: true)
- `ExtractMetadata` (boolean, optional): Extract document metadata (default: true)
- `PageRange` (string, optional): Pages to extract (e.g., '1-5,7,9-10')

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'PDF Extractor',
    Params: [
        { Name: 'PDFData', Value: pdfBuffer },
        { Name: 'PageRange', Value: '1-10' }
    ],
    ContextUser: currentUser
});
```

#### Excel Reader Action

Reads data from Excel files with support for multiple sheets.

**Class:** `ExcelReaderAction`  
**Registration Name:** `"Excel Reader"`

**Parameters:**
- `ExcelData` (Buffer/string, required): Excel file data or base64 string
- `SheetName` (string, optional): Specific sheet to read
- `Range` (string, optional): Cell range to read (e.g., 'A1:D10')
- `ParseDates` (boolean, optional): Convert Excel dates (default: true)
- `IncludeEmptyRows` (boolean, optional): Include empty rows (default: false)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Excel Reader',
    Params: [
        { Name: 'ExcelData', Value: excelBuffer },
        { Name: 'SheetName', Value: 'Sales Data' }
    ],
    ContextUser: currentUser
});
```

#### Excel Writer Action

Creates Excel files from data with formatting options.

**Class:** `ExcelWriterAction`  
**Registration Name:** `"Excel Writer"`

**Parameters:**
- `Data` (array/object, required): Data to write (array of objects or sheets config)
- `SheetName` (string, optional): Sheet name (default: 'Sheet1')
- `IncludeHeaders` (boolean, optional): Include column headers (default: true)
- `ColumnWidths` (object, optional): Custom column widths
- `Formatting` (object/string, optional): Cell formatting rules

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Excel Writer',
    Params: [
        { Name: 'Data', Value: [{ name: 'John', sales: 1000 }, { name: 'Jane', sales: 1500 }] },
        { Name: 'SheetName', Value: 'Sales Report' }
    ],
    ContextUser: currentUser
});
```

#### File Compress Action

Compresses files into ZIP archives.

**Class:** `FileCompressAction`  
**Registration Name:** `"File Compress"`

**Parameters:**
- `Files` (array, required): Array of file objects with name and content
- `CompressionLevel` (number, optional): Compression level 0-9 (default: 6)
- `ArchiveName` (string, optional): Output archive name
- `Password` (string, optional): Password protection for archive

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'File Compress',
    Params: [
        { Name: 'Files', Value: [
            { name: 'report.txt', content: 'Report content' },
            { name: 'data.json', content: JSON.stringify(data) }
        ]},
        { Name: 'ArchiveName', Value: 'backup.zip' }
    ],
    ContextUser: currentUser
});
```

### 7. Integration Actions

#### HTTP Request Action

Makes HTTP requests with full control over headers, body, and authentication.

**Class:** `HTTPRequestAction`  
**Registration Name:** `"HTTP Request"`

**Parameters:**
- `URL` (string, required): Request URL
- `Method` (string, optional): HTTP method (default: 'GET')
- `Headers` (object/string, optional): Request headers
- `Body` (any, optional): Request body
- `Timeout` (number, optional): Request timeout in ms (default: 30000)
- `RetryCount` (number, optional): Number of retries (default: 0)
- `BasicAuth` (object, optional): Basic authentication credentials

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'HTTP Request',
    Params: [
        { Name: 'URL', Value: 'https://api.example.com/data' },
        { Name: 'Method', Value: 'POST' },
        { Name: 'Headers', Value: { 'Content-Type': 'application/json' } },
        { Name: 'Body', Value: { query: 'test' } }
    ],
    ContextUser: currentUser
});
```

#### GraphQL Query Action

Executes GraphQL queries and mutations with variable support.

**Class:** `GraphQLQueryAction`  
**Registration Name:** `"GraphQL Query"`

**Parameters:**
- `Endpoint` (string, required): GraphQL endpoint URL
- `Query` (string, required): GraphQL query or mutation
- `Variables` (object/string, optional): Query variables
- `Headers` (object/string, optional): Request headers
- `OperationName` (string, optional): Operation name for multi-operation documents

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'GraphQL Query',
    Params: [
        { Name: 'Endpoint', Value: 'https://api.example.com/graphql' },
        { Name: 'Query', Value: 'query GetUser($id: ID!) { user(id: $id) { name email } }' },
        { Name: 'Variables', Value: { id: '123' } }
    ],
    ContextUser: currentUser
});
```

#### OAuth Flow Action

Handles OAuth 2.0 authentication flows.

**Class:** `OAuthFlowAction`  
**Registration Name:** `"OAuth Flow"`

**Parameters:**
- `Provider` (string, required): OAuth provider name
- `ClientID` (string, required): OAuth client ID
- `ClientSecret` (string, required): OAuth client secret
- `RedirectURI` (string, required): Redirect URI
- `Scopes` (string/array, optional): Required scopes
- `State` (string, optional): State parameter for security

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'OAuth Flow',
    Params: [
        { Name: 'Provider', Value: 'google' },
        { Name: 'ClientID', Value: 'your-client-id' },
        { Name: 'ClientSecret', Value: 'your-client-secret' },
        { Name: 'RedirectURI', Value: 'https://app.example.com/callback' },
        { Name: 'Scopes', Value: ['email', 'profile'] }
    ],
    ContextUser: currentUser
});
```

#### API Rate Limiter Action

Manages API rate limiting with queuing and backoff strategies.

**Class:** `APIRateLimiterAction`  
**Registration Name:** `"API Rate Limiter"`

**Parameters:**
- `APIName` (string, required): API identifier
- `RequestsPerWindow` (number, required): Max requests per time window
- `WindowSizeMs` (number, optional): Time window in ms (default: 60000)
- `QueueRequests` (boolean, optional): Queue excess requests (default: true)
- `MaxQueueSize` (number, optional): Maximum queue size (default: 100)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'API Rate Limiter',
    Params: [
        { Name: 'APIName', Value: 'external-api' },
        { Name: 'RequestsPerWindow', Value: 100 },
        { Name: 'WindowSizeMs', Value: 60000 }
    ],
    ContextUser: currentUser
});
```

### 8. Security Actions

#### Password Strength Action

Evaluates password strength and provides improvement suggestions.

**Class:** `PasswordStrengthAction`  
**Registration Name:** `"Password Strength"`

**Parameters:**
- `Password` (string, required): Password to evaluate
- `MinLength` (number, optional): Minimum required length (default: 8)
- `RequireUppercase` (boolean, optional): Require uppercase letters (default: true)
- `RequireLowercase` (boolean, optional): Require lowercase letters (default: true)
- `RequireNumbers` (boolean, optional): Require numbers (default: true)
- `RequireSpecial` (boolean, optional): Require special characters (default: true)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Password Strength',
    Params: [
        { Name: 'Password', Value: 'MyP@ssw0rd' },
        { Name: 'MinLength', Value: 12 }
    ],
    ContextUser: currentUser
});
```

### 9. Workflow Control Actions

#### Conditional Action

Executes actions based on conditional logic.

**Class:** `ConditionalAction`  
**Registration Name:** `"Conditional"`

**Parameters:**
- `Condition` (string, required): JavaScript expression to evaluate
- `ThenAction` (object, required): Action to run if condition is true
- `ElseAction` (object, optional): Action to run if condition is false
- `Context` (object, optional): Variables available in condition

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Conditional',
    Params: [
        { Name: 'Condition', Value: 'value > 100' },
        { Name: 'Context', Value: { value: 150 } },
        { Name: 'ThenAction', Value: { name: 'Send Email', params: {...} } }
    ],
    ContextUser: currentUser
});
```

#### Loop Action

Executes actions repeatedly with iteration support.

**Class:** `LoopAction`  
**Registration Name:** `"Loop"`

**Parameters:**
- `Items` (array, optional): Array to iterate over
- `Count` (number, optional): Number of iterations (if no items)
- `Action` (object, required): Action to execute for each iteration
- `Parallel` (boolean, optional): Run iterations in parallel (default: false)
- `MaxConcurrency` (number, optional): Max parallel executions (default: 10)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Loop',
    Params: [
        { Name: 'Items', Value: [1, 2, 3, 4, 5] },
        { Name: 'Action', Value: { name: 'Process Item', params: {...} } },
        { Name: 'Parallel', Value: true }
    ],
    ContextUser: currentUser
});
```

#### Parallel Execute Action

Runs multiple actions concurrently with result aggregation.

**Class:** `ParallelExecuteAction`  
**Registration Name:** `"Parallel Execute"`

**Parameters:**
- `Actions` (array, required): Array of actions to execute
- `MaxConcurrency` (number, optional): Maximum concurrent executions (default: 10)
- `StopOnError` (boolean, optional): Stop all if one fails (default: false)
- `Timeout` (number, optional): Overall timeout in ms

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Parallel Execute',
    Params: [
        { Name: 'Actions', Value: [
            { name: 'Web Search', params: { SearchTerms: 'AI' } },
            { name: 'HTTP Request', params: { URL: 'https://api.example.com' } }
        ]},
        { Name: 'MaxConcurrency', Value: 2 }
    ],
    ContextUser: currentUser
});
```

#### Retry Action

Retries failed actions with configurable backoff strategies.

**Class:** `RetryAction`  
**Registration Name:** `"Retry"`

**Parameters:**
- `Action` (object, required): Action to retry
- `MaxRetries` (number, optional): Maximum retry attempts (default: 3)
- `InitialDelay` (number, optional): Initial delay in ms (default: 1000)
- `BackoffMultiplier` (number, optional): Delay multiplier (default: 2)
- `MaxDelay` (number, optional): Maximum delay in ms (default: 30000)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Retry',
    Params: [
        { Name: 'Action', Value: { name: 'HTTP Request', params: {...} } },
        { Name: 'MaxRetries', Value: 5 },
        { Name: 'InitialDelay', Value: 2000 }
    ],
    ContextUser: currentUser
});
```

#### Delay Action

Introduces delays in workflow execution.

**Class:** `DelayAction`  
**Registration Name:** `"Delay"`

**Parameters:**
- `DelayMs` (number, required): Delay duration in milliseconds
- `Jitter` (number, optional): Random jitter to add (0-1, percentage of delay)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Delay',
    Params: [
        { Name: 'DelayMs', Value: 5000 },
        { Name: 'Jitter', Value: 0.1 } // 10% jitter
    ],
    ContextUser: currentUser
});
```

### 10. Communication Actions

#### Slack Webhook Action

Sends messages to Slack channels via webhooks.

**Class:** `SlackWebhookAction`  
**Registration Name:** `"Slack Webhook"`

**Parameters:**
- `WebhookURL` (string, required): Slack webhook URL
- `Message` (string, required): Message text
- `Channel` (string, optional): Override default channel
- `Username` (string, optional): Override default username
- `IconEmoji` (string, optional): Override default icon
- `Attachments` (array/string, optional): Rich message attachments

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Slack Webhook',
    Params: [
        { Name: 'WebhookURL', Value: 'https://hooks.slack.com/services/...' },
        { Name: 'Message', Value: 'Deployment completed successfully!' },
        { Name: 'IconEmoji', Value: ':rocket:' }
    ],
    ContextUser: currentUser
});
```

#### Teams Webhook Action

Sends messages to Microsoft Teams channels via webhooks.

**Class:** `TeamsWebhookAction`  
**Registration Name:** `"Teams Webhook"`

**Parameters:**
- `WebhookURL` (string, required): Teams webhook URL
- `Title` (string, optional): Message title
- `Text` (string, required): Message text
- `ThemeColor` (string, optional): Message accent color
- `Sections` (array/string, optional): Message sections
- `Actions` (array/string, optional): Interactive actions

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Teams Webhook',
    Params: [
        { Name: 'WebhookURL', Value: 'https://outlook.office.com/webhook/...' },
        { Name: 'Title', Value: 'Build Status' },
        { Name: 'Text', Value: 'Build #123 completed successfully' },
        { Name: 'ThemeColor', Value: '00FF00' }
    ],
    ContextUser: currentUser
});
```

### 11. AI Actions

#### Execute AI Prompt Action

Executes AI prompts using MemberJunction's AI framework with model selection and parameter control.

**Class:** `ExecuteAIPromptAction`  
**Registration Name:** `"Execute AI Prompt"`

**Parameters:**
- `PromptID` (string, optional): ID of saved prompt template
- `PromptName` (string, optional): Name of saved prompt template
- `PromptText` (string, optional): Direct prompt text (if not using template)
- `ModelID` (string, optional): Specific AI model ID to use
- `ModelName` (string, optional): Specific AI model name to use
- `Temperature` (number, optional): Model temperature (0-2)
- `MaxTokens` (number, optional): Maximum response tokens
- `Variables` (object/string, optional): Variables to inject into prompt template

**Example Usage:**

```typescript
// Using a saved prompt template
const templateResult = await ActionEngine.RunAction({
    ActionName: 'Execute AI Prompt',
    Params: [
        { Name: 'PromptName', Value: 'Summarize Text' },
        { Name: 'Variables', Value: { text: 'Long article text here...' } },
        { Name: 'Temperature', Value: 0.7 }
    ],
    ContextUser: currentUser
});

// Using direct prompt text
const directResult = await ActionEngine.RunAction({
    ActionName: 'Execute AI Prompt',
    Params: [
        { Name: 'PromptText', Value: 'Explain quantum computing in simple terms' },
        { Name: 'ModelName', Value: 'gpt-4' },
        { Name: 'MaxTokens', Value: 500 }
    ],
    ContextUser: currentUser
});
```

## Special Features

### Dual JSON Parameter Support

Many actions support both JSON object and string inputs for flexibility:
- **JSON Object**: Pass JavaScript objects directly
- **JSON String**: Pass stringified JSON for dynamic content

This applies to actions like JSON Transform, HTTP Request, GraphQL Query, and others with object parameters.

### Error Handling and Recovery

Actions implement various error handling strategies:
- **Graceful Degradation**: Actions continue with partial results when possible
- **Detailed Error Messages**: Clear explanations of what went wrong
- **Retry Logic**: Built-in retry mechanisms for transient failures
- **Validation**: Input validation with helpful error messages

### Performance Considerations

- **Streaming Support**: Large file operations use streaming when possible
- **Batch Processing**: Actions process data in chunks for memory efficiency
- **Parallel Execution**: Workflow actions support concurrent processing
- **Resource Management**: Proper cleanup of resources after execution

```typescript
import { VectorizeEntityAction } from '@memberjunction/core-actions';
import { ActionEngine } from '@memberjunction/actions';

// Vectorize a single entity
const singleResult = await ActionEngine.RunAction({
    ActionName: 'Vectorize Entity',
    Params: [
        { Name: 'EntityNames', Value: 'Customers' }
    ],
    ContextUser: currentUser
});

// Vectorize multiple entities
const multiResult = await ActionEngine.RunAction({
    ActionName: 'Vectorize Entity',
    Params: [
        { Name: 'EntityNames', Value: 'Customers,Products,Orders' }
    ],
    ContextUser: currentUser
});

// Or using an array
const arrayResult = await ActionEngine.RunAction({
    ActionName: 'Vectorize Entity',
    Params: [
        { Name: 'EntityNames', Value: ['Customers', 'Products', 'Orders'] }
    ],
    ContextUser: currentUser
});
```

### 5. Data Transformation Actions

#### CSV Parser Action

Parses CSV data with configurable options for headers, delimiters, and data types.

**Class:** `CSVParserAction`  
**Registration Name:** `"CSV Parser"`

**Parameters:**
- `CSVData` (string, required): The CSV data to parse
- `HasHeaders` (boolean, optional): Whether the first row contains headers (default: true)
- `Delimiter` (string, optional): Field delimiter (default: ',')
- `QuoteCharacter` (string, optional): Quote character for escaping (default: '"')
- `SkipEmptyRows` (boolean, optional): Skip empty rows (default: true)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'CSV Parser',
    Params: [
        { Name: 'CSVData', Value: 'Name,Age,City\nJohn,30,NYC\nJane,25,LA' },
        { Name: 'HasHeaders', Value: true }
    ],
    ContextUser: currentUser
});
```

#### JSON Transform Action

Transforms JSON data using JSONPath-style queries with multiple operations support.

**Class:** `JSONTransformAction`  
**Registration Name:** `"JSON Transform"`

**Parameters:**
- `InputData` (object/string, required): JSON data to transform (supports both JSON object and string)
- `Transformations` (string/array, required): JSONPath queries for transformation
- `OutputFormat` (string, optional): 'object' or 'array' (default: 'object')
- `DefaultValue` (any, optional): Default value for missing paths

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'JSON Transform',
    Params: [
        { Name: 'InputData', Value: { users: [{ name: 'John', age: 30 }] } },
        { Name: 'Transformations', Value: ['name:$.users[0].name', 'age:$.users[0].age'] }
    ],
    ContextUser: currentUser
});
```

#### XML Parser Action

Parses XML data into JSON format with namespace support.

**Class:** `XMLParserAction`  
**Registration Name:** `"XML Parser"`

**Parameters:**
- `XMLData` (string, required): The XML data to parse
- `RemoveNamespaces` (boolean, optional): Strip namespace prefixes (default: false)
- `ParseNumbers` (boolean, optional): Convert numeric strings to numbers (default: true)
- `ParseBooleans` (boolean, optional): Convert boolean strings to booleans (default: true)
- `AttributePrefix` (string, optional): Prefix for attributes (default: '@')

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'XML Parser',
    Params: [
        { Name: 'XMLData', Value: '<root><user id="1"><name>John</name></user></root>' },
        { Name: 'ParseNumbers', Value: true }
    ],
    ContextUser: currentUser
});
```

#### Aggregate Data Action

Performs aggregation operations on arrays of data with support for multiple aggregation functions.

**Class:** `AggregateDataAction`  
**Registration Name:** `"Aggregate Data"`

**Parameters:**
- `Data` (array, required): Array of objects to aggregate
- `GroupBy` (string/array, optional): Field(s) to group by
- `Aggregations` (object/string, required): Aggregation operations (sum, avg, count, min, max)
- `Having` (object, optional): Filter conditions on aggregated results

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Aggregate Data',
    Params: [
        { Name: 'Data', Value: [{ category: 'A', value: 10 }, { category: 'A', value: 20 }] },
        { Name: 'GroupBy', Value: 'category' },
        { Name: 'Aggregations', Value: { totalValue: 'sum:value', avgValue: 'avg:value' } }
    ],
    ContextUser: currentUser
});
```

#### Data Mapper Action

Maps data from one structure to another using field mappings and transformations.

**Class:** `DataMapperAction`  
**Registration Name:** `"Data Mapper"`

**Parameters:**
- `SourceData` (object/array, required): Data to map
- `Mappings` (object/string, required): Field mapping configuration
- `DefaultValues` (object, optional): Default values for missing fields
- `RemoveUnmapped` (boolean, optional): Remove fields not in mapping (default: false)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Data Mapper',
    Params: [
        { Name: 'SourceData', Value: { firstName: 'John', lastName: 'Doe' } },
        { Name: 'Mappings', Value: { fullName: '{{firstName}} {{lastName}}' } }
    ],
    ContextUser: currentUser
});
```

### 6. File Operations Actions

#### PDF Generator Action

Generates PDF documents from HTML or markdown content.

**Class:** `PDFGeneratorAction`  
**Registration Name:** `"PDF Generator"`

**Parameters:**
- `Content` (string, required): HTML or markdown content
- `ContentType` (string, optional): 'html' or 'markdown' (default: 'html')
- `Options` (object/string, optional): PDF options (margins, orientation, etc.)
- `FileName` (string, optional): Output filename

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'PDF Generator',
    Params: [
        { Name: 'Content', Value: '<h1>Report</h1><p>Content here</p>' },
        { Name: 'Options', Value: { margin: { top: '1in' }, orientation: 'portrait' } }
    ],
    ContextUser: currentUser
});
```

#### PDF Extractor Action

Extracts text and metadata from PDF files.

**Class:** `PDFExtractorAction`  
**Registration Name:** `"PDF Extractor"`

**Parameters:**
- `PDFData` (Buffer/string, required): PDF file data or base64 string
- `ExtractText` (boolean, optional): Extract text content (default: true)
- `ExtractMetadata` (boolean, optional): Extract document metadata (default: true)
- `PageRange` (string, optional): Pages to extract (e.g., '1-5,7,9-10')

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'PDF Extractor',
    Params: [
        { Name: 'PDFData', Value: pdfBuffer },
        { Name: 'PageRange', Value: '1-10' }
    ],
    ContextUser: currentUser
});
```

#### Excel Reader Action

Reads data from Excel files with support for multiple sheets.

**Class:** `ExcelReaderAction`  
**Registration Name:** `"Excel Reader"`

**Parameters:**
- `ExcelData` (Buffer/string, required): Excel file data or base64 string
- `SheetName` (string, optional): Specific sheet to read
- `Range` (string, optional): Cell range to read (e.g., 'A1:D10')
- `ParseDates` (boolean, optional): Convert Excel dates (default: true)
- `IncludeEmptyRows` (boolean, optional): Include empty rows (default: false)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Excel Reader',
    Params: [
        { Name: 'ExcelData', Value: excelBuffer },
        { Name: 'SheetName', Value: 'Sales Data' }
    ],
    ContextUser: currentUser
});
```

#### Excel Writer Action

Creates Excel files from data with formatting options.

**Class:** `ExcelWriterAction`  
**Registration Name:** `"Excel Writer"`

**Parameters:**
- `Data` (array/object, required): Data to write (array of objects or sheets config)
- `SheetName` (string, optional): Sheet name (default: 'Sheet1')
- `IncludeHeaders` (boolean, optional): Include column headers (default: true)
- `ColumnWidths` (object, optional): Custom column widths
- `Formatting` (object/string, optional): Cell formatting rules

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Excel Writer',
    Params: [
        { Name: 'Data', Value: [{ name: 'John', sales: 1000 }, { name: 'Jane', sales: 1500 }] },
        { Name: 'SheetName', Value: 'Sales Report' }
    ],
    ContextUser: currentUser
});
```

#### File Compress Action

Compresses files into ZIP archives.

**Class:** `FileCompressAction`  
**Registration Name:** `"File Compress"`

**Parameters:**
- `Files` (array, required): Array of file objects with name and content
- `CompressionLevel` (number, optional): Compression level 0-9 (default: 6)
- `ArchiveName` (string, optional): Output archive name
- `Password` (string, optional): Password protection for archive

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'File Compress',
    Params: [
        { Name: 'Files', Value: [
            { name: 'report.txt', content: 'Report content' },
            { name: 'data.json', content: JSON.stringify(data) }
        ]},
        { Name: 'ArchiveName', Value: 'backup.zip' }
    ],
    ContextUser: currentUser
});
```

### 7. Integration Actions

#### HTTP Request Action

Makes HTTP requests with full control over headers, body, and authentication.

**Class:** `HTTPRequestAction`  
**Registration Name:** `"HTTP Request"`

**Parameters:**
- `URL` (string, required): Request URL
- `Method` (string, optional): HTTP method (default: 'GET')
- `Headers` (object/string, optional): Request headers
- `Body` (any, optional): Request body
- `Timeout` (number, optional): Request timeout in ms (default: 30000)
- `RetryCount` (number, optional): Number of retries (default: 0)
- `BasicAuth` (object, optional): Basic authentication credentials

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'HTTP Request',
    Params: [
        { Name: 'URL', Value: 'https://api.example.com/data' },
        { Name: 'Method', Value: 'POST' },
        { Name: 'Headers', Value: { 'Content-Type': 'application/json' } },
        { Name: 'Body', Value: { query: 'test' } }
    ],
    ContextUser: currentUser
});
```

#### GraphQL Query Action

Executes GraphQL queries and mutations with variable support.

**Class:** `GraphQLQueryAction`  
**Registration Name:** `"GraphQL Query"`

**Parameters:**
- `Endpoint` (string, required): GraphQL endpoint URL
- `Query` (string, required): GraphQL query or mutation
- `Variables` (object/string, optional): Query variables
- `Headers` (object/string, optional): Request headers
- `OperationName` (string, optional): Operation name for multi-operation documents

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'GraphQL Query',
    Params: [
        { Name: 'Endpoint', Value: 'https://api.example.com/graphql' },
        { Name: 'Query', Value: 'query GetUser($id: ID!) { user(id: $id) { name email } }' },
        { Name: 'Variables', Value: { id: '123' } }
    ],
    ContextUser: currentUser
});
```

#### OAuth Flow Action

Handles OAuth 2.0 authentication flows.

**Class:** `OAuthFlowAction`  
**Registration Name:** `"OAuth Flow"`

**Parameters:**
- `Provider` (string, required): OAuth provider name
- `ClientID` (string, required): OAuth client ID
- `ClientSecret` (string, required): OAuth client secret
- `RedirectURI` (string, required): Redirect URI
- `Scopes` (string/array, optional): Required scopes
- `State` (string, optional): State parameter for security

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'OAuth Flow',
    Params: [
        { Name: 'Provider', Value: 'google' },
        { Name: 'ClientID', Value: 'your-client-id' },
        { Name: 'ClientSecret', Value: 'your-client-secret' },
        { Name: 'RedirectURI', Value: 'https://app.example.com/callback' },
        { Name: 'Scopes', Value: ['email', 'profile'] }
    ],
    ContextUser: currentUser
});
```

#### API Rate Limiter Action

Manages API rate limiting with queuing and backoff strategies.

**Class:** `APIRateLimiterAction`  
**Registration Name:** `"API Rate Limiter"`

**Parameters:**
- `APIName` (string, required): API identifier
- `RequestsPerWindow` (number, required): Max requests per time window
- `WindowSizeMs` (number, optional): Time window in ms (default: 60000)
- `QueueRequests` (boolean, optional): Queue excess requests (default: true)
- `MaxQueueSize` (number, optional): Maximum queue size (default: 100)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'API Rate Limiter',
    Params: [
        { Name: 'APIName', Value: 'external-api' },
        { Name: 'RequestsPerWindow', Value: 100 },
        { Name: 'WindowSizeMs', Value: 60000 }
    ],
    ContextUser: currentUser
});
```

### 8. Security Actions

#### Password Strength Action

Evaluates password strength and provides improvement suggestions.

**Class:** `PasswordStrengthAction`  
**Registration Name:** `"Password Strength"`

**Parameters:**
- `Password` (string, required): Password to evaluate
- `MinLength` (number, optional): Minimum required length (default: 8)
- `RequireUppercase` (boolean, optional): Require uppercase letters (default: true)
- `RequireLowercase` (boolean, optional): Require lowercase letters (default: true)
- `RequireNumbers` (boolean, optional): Require numbers (default: true)
- `RequireSpecial` (boolean, optional): Require special characters (default: true)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Password Strength',
    Params: [
        { Name: 'Password', Value: 'MyP@ssw0rd' },
        { Name: 'MinLength', Value: 12 }
    ],
    ContextUser: currentUser
});
```

### 9. Workflow Control Actions

#### Conditional Action

Executes actions based on conditional logic.

**Class:** `ConditionalAction`  
**Registration Name:** `"Conditional"`

**Parameters:**
- `Condition` (string, required): JavaScript expression to evaluate
- `ThenAction` (object, required): Action to run if condition is true
- `ElseAction` (object, optional): Action to run if condition is false
- `Context` (object, optional): Variables available in condition

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Conditional',
    Params: [
        { Name: 'Condition', Value: 'value > 100' },
        { Name: 'Context', Value: { value: 150 } },
        { Name: 'ThenAction', Value: { name: 'Send Email', params: {...} } }
    ],
    ContextUser: currentUser
});
```

#### Loop Action

Executes actions repeatedly with iteration support.

**Class:** `LoopAction`  
**Registration Name:** `"Loop"`

**Parameters:**
- `Items` (array, optional): Array to iterate over
- `Count` (number, optional): Number of iterations (if no items)
- `Action` (object, required): Action to execute for each iteration
- `Parallel` (boolean, optional): Run iterations in parallel (default: false)
- `MaxConcurrency` (number, optional): Max parallel executions (default: 10)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Loop',
    Params: [
        { Name: 'Items', Value: [1, 2, 3, 4, 5] },
        { Name: 'Action', Value: { name: 'Process Item', params: {...} } },
        { Name: 'Parallel', Value: true }
    ],
    ContextUser: currentUser
});
```

#### Parallel Execute Action

Runs multiple actions concurrently with result aggregation.

**Class:** `ParallelExecuteAction`  
**Registration Name:** `"Parallel Execute"`

**Parameters:**
- `Actions` (array, required): Array of actions to execute
- `MaxConcurrency` (number, optional): Maximum concurrent executions (default: 10)
- `StopOnError` (boolean, optional): Stop all if one fails (default: false)
- `Timeout` (number, optional): Overall timeout in ms

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Parallel Execute',
    Params: [
        { Name: 'Actions', Value: [
            { name: 'Web Search', params: { SearchTerms: 'AI' } },
            { name: 'HTTP Request', params: { URL: 'https://api.example.com' } }
        ]},
        { Name: 'MaxConcurrency', Value: 2 }
    ],
    ContextUser: currentUser
});
```

#### Retry Action

Retries failed actions with configurable backoff strategies.

**Class:** `RetryAction`  
**Registration Name:** `"Retry"`

**Parameters:**
- `Action` (object, required): Action to retry
- `MaxRetries` (number, optional): Maximum retry attempts (default: 3)
- `InitialDelay` (number, optional): Initial delay in ms (default: 1000)
- `BackoffMultiplier` (number, optional): Delay multiplier (default: 2)
- `MaxDelay` (number, optional): Maximum delay in ms (default: 30000)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Retry',
    Params: [
        { Name: 'Action', Value: { name: 'HTTP Request', params: {...} } },
        { Name: 'MaxRetries', Value: 5 },
        { Name: 'InitialDelay', Value: 2000 }
    ],
    ContextUser: currentUser
});
```

#### Delay Action

Introduces delays in workflow execution.

**Class:** `DelayAction`  
**Registration Name:** `"Delay"`

**Parameters:**
- `DelayMs` (number, required): Delay duration in milliseconds
- `Jitter` (number, optional): Random jitter to add (0-1, percentage of delay)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Delay',
    Params: [
        { Name: 'DelayMs', Value: 5000 },
        { Name: 'Jitter', Value: 0.1 } // 10% jitter
    ],
    ContextUser: currentUser
});
```

### 10. Communication Actions

#### Slack Webhook Action

Sends messages to Slack channels via webhooks.

**Class:** `SlackWebhookAction`  
**Registration Name:** `"Slack Webhook"`

**Parameters:**
- `WebhookURL` (string, required): Slack webhook URL
- `Message` (string, required): Message text
- `Channel` (string, optional): Override default channel
- `Username` (string, optional): Override default username
- `IconEmoji` (string, optional): Override default icon
- `Attachments` (array/string, optional): Rich message attachments

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Slack Webhook',
    Params: [
        { Name: 'WebhookURL', Value: 'https://hooks.slack.com/services/...' },
        { Name: 'Message', Value: 'Deployment completed successfully!' },
        { Name: 'IconEmoji', Value: ':rocket:' }
    ],
    ContextUser: currentUser
});
```

#### Teams Webhook Action

Sends messages to Microsoft Teams channels via webhooks.

**Class:** `TeamsWebhookAction`  
**Registration Name:** `"Teams Webhook"`

**Parameters:**
- `WebhookURL` (string, required): Teams webhook URL
- `Title` (string, optional): Message title
- `Text` (string, required): Message text
- `ThemeColor` (string, optional): Message accent color
- `Sections` (array/string, optional): Message sections
- `Actions` (array/string, optional): Interactive actions

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Teams Webhook',
    Params: [
        { Name: 'WebhookURL', Value: 'https://outlook.office.com/webhook/...' },
        { Name: 'Title', Value: 'Build Status' },
        { Name: 'Text', Value: 'Build #123 completed successfully' },
        { Name: 'ThemeColor', Value: '00FF00' }
    ],
    ContextUser: currentUser
});
```

### 11. AI Actions

#### Execute AI Prompt Action

Executes AI prompts using MemberJunction's AI framework with model selection and parameter control.

**Class:** `ExecuteAIPromptAction`  
**Registration Name:** `"Execute AI Prompt"`

**Parameters:**
- `PromptID` (string, optional): ID of saved prompt template
- `PromptName` (string, optional): Name of saved prompt template
- `PromptText` (string, optional): Direct prompt text (if not using template)
- `ModelID` (string, optional): Specific AI model ID to use
- `ModelName` (string, optional): Specific AI model name to use
- `Temperature` (number, optional): Model temperature (0-2)
- `MaxTokens` (number, optional): Maximum response tokens
- `Variables` (object/string, optional): Variables to inject into prompt template

**Example Usage:**

```typescript
// Using a saved prompt template
const templateResult = await ActionEngine.RunAction({
    ActionName: 'Execute AI Prompt',
    Params: [
        { Name: 'PromptName', Value: 'Summarize Text' },
        { Name: 'Variables', Value: { text: 'Long article text here...' } },
        { Name: 'Temperature', Value: 0.7 }
    ],
    ContextUser: currentUser
});

// Using direct prompt text
const directResult = await ActionEngine.RunAction({
    ActionName: 'Execute AI Prompt',
    Params: [
        { Name: 'PromptText', Value: 'Explain quantum computing in simple terms' },
        { Name: 'ModelName', Value: 'gpt-4' },
        { Name: 'MaxTokens', Value: 500 }
    ],
    ContextUser: currentUser
});
```

## Special Features

### Dual JSON Parameter Support

Many actions support both JSON object and string inputs for flexibility:
- **JSON Object**: Pass JavaScript objects directly
- **JSON String**: Pass stringified JSON for dynamic content

This applies to actions like JSON Transform, HTTP Request, GraphQL Query, and others with object parameters.

### Error Handling and Recovery

Actions implement various error handling strategies:
- **Graceful Degradation**: Actions continue with partial results when possible
- **Detailed Error Messages**: Clear explanations of what went wrong
- **Retry Logic**: Built-in retry mechanisms for transient failures
- **Validation**: Input validation with helpful error messages

### Performance Considerations

- **Streaming Support**: Large file operations use streaming when possible
- **Batch Processing**: Actions process data in chunks for memory efficiency
- **Parallel Execution**: Workflow actions support concurrent processing
- **Resource Management**: Proper cleanup of resources after execution

```

### 3. External Change Detection Action

Detects and replays changes from external systems that have modified data outside of the MemberJunction framework. This is crucial for maintaining data consistency when external systems directly modify the database.

**Class:** `ExternalChangeDetectionAction`  
**Registration Name:** `"Run External Change Detection"`

**Parameters:**
- `EntityList` (string, optional): Comma-separated list of entity names to check for changes. If not provided, all eligible entities will be processed.

**Example Usage:**

```

### 5. Data Transformation Actions

#### CSV Parser Action

Parses CSV data with configurable options for headers, delimiters, and data types.

**Class:** `CSVParserAction`  
**Registration Name:** `"CSV Parser"`

**Parameters:**
- `CSVData` (string, required): The CSV data to parse
- `HasHeaders` (boolean, optional): Whether the first row contains headers (default: true)
- `Delimiter` (string, optional): Field delimiter (default: ',')
- `QuoteCharacter` (string, optional): Quote character for escaping (default: '"')
- `SkipEmptyRows` (boolean, optional): Skip empty rows (default: true)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'CSV Parser',
    Params: [
        { Name: 'CSVData', Value: 'Name,Age,City\nJohn,30,NYC\nJane,25,LA' },
        { Name: 'HasHeaders', Value: true }
    ],
    ContextUser: currentUser
});
```

#### JSON Transform Action

Transforms JSON data using JSONPath-style queries with multiple operations support.

**Class:** `JSONTransformAction`  
**Registration Name:** `"JSON Transform"`

**Parameters:**
- `InputData` (object/string, required): JSON data to transform (supports both JSON object and string)
- `Transformations` (string/array, required): JSONPath queries for transformation
- `OutputFormat` (string, optional): 'object' or 'array' (default: 'object')
- `DefaultValue` (any, optional): Default value for missing paths

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'JSON Transform',
    Params: [
        { Name: 'InputData', Value: { users: [{ name: 'John', age: 30 }] } },
        { Name: 'Transformations', Value: ['name:$.users[0].name', 'age:$.users[0].age'] }
    ],
    ContextUser: currentUser
});
```

#### XML Parser Action

Parses XML data into JSON format with namespace support.

**Class:** `XMLParserAction`  
**Registration Name:** `"XML Parser"`

**Parameters:**
- `XMLData` (string, required): The XML data to parse
- `RemoveNamespaces` (boolean, optional): Strip namespace prefixes (default: false)
- `ParseNumbers` (boolean, optional): Convert numeric strings to numbers (default: true)
- `ParseBooleans` (boolean, optional): Convert boolean strings to booleans (default: true)
- `AttributePrefix` (string, optional): Prefix for attributes (default: '@')

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'XML Parser',
    Params: [
        { Name: 'XMLData', Value: '<root><user id="1"><name>John</name></user></root>' },
        { Name: 'ParseNumbers', Value: true }
    ],
    ContextUser: currentUser
});
```

#### Aggregate Data Action

Performs aggregation operations on arrays of data with support for multiple aggregation functions.

**Class:** `AggregateDataAction`  
**Registration Name:** `"Aggregate Data"`

**Parameters:**
- `Data` (array, required): Array of objects to aggregate
- `GroupBy` (string/array, optional): Field(s) to group by
- `Aggregations` (object/string, required): Aggregation operations (sum, avg, count, min, max)
- `Having` (object, optional): Filter conditions on aggregated results

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Aggregate Data',
    Params: [
        { Name: 'Data', Value: [{ category: 'A', value: 10 }, { category: 'A', value: 20 }] },
        { Name: 'GroupBy', Value: 'category' },
        { Name: 'Aggregations', Value: { totalValue: 'sum:value', avgValue: 'avg:value' } }
    ],
    ContextUser: currentUser
});
```

#### Data Mapper Action

Maps data from one structure to another using field mappings and transformations.

**Class:** `DataMapperAction`  
**Registration Name:** `"Data Mapper"`

**Parameters:**
- `SourceData` (object/array, required): Data to map
- `Mappings` (object/string, required): Field mapping configuration
- `DefaultValues` (object, optional): Default values for missing fields
- `RemoveUnmapped` (boolean, optional): Remove fields not in mapping (default: false)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Data Mapper',
    Params: [
        { Name: 'SourceData', Value: { firstName: 'John', lastName: 'Doe' } },
        { Name: 'Mappings', Value: { fullName: '{{firstName}} {{lastName}}' } }
    ],
    ContextUser: currentUser
});
```

### 6. File Operations Actions

#### PDF Generator Action

Generates PDF documents from HTML or markdown content.

**Class:** `PDFGeneratorAction`  
**Registration Name:** `"PDF Generator"`

**Parameters:**
- `Content` (string, required): HTML or markdown content
- `ContentType` (string, optional): 'html' or 'markdown' (default: 'html')
- `Options` (object/string, optional): PDF options (margins, orientation, etc.)
- `FileName` (string, optional): Output filename

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'PDF Generator',
    Params: [
        { Name: 'Content', Value: '<h1>Report</h1><p>Content here</p>' },
        { Name: 'Options', Value: { margin: { top: '1in' }, orientation: 'portrait' } }
    ],
    ContextUser: currentUser
});
```

#### PDF Extractor Action

Extracts text and metadata from PDF files.

**Class:** `PDFExtractorAction`  
**Registration Name:** `"PDF Extractor"`

**Parameters:**
- `PDFData` (Buffer/string, required): PDF file data or base64 string
- `ExtractText` (boolean, optional): Extract text content (default: true)
- `ExtractMetadata` (boolean, optional): Extract document metadata (default: true)
- `PageRange` (string, optional): Pages to extract (e.g., '1-5,7,9-10')

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'PDF Extractor',
    Params: [
        { Name: 'PDFData', Value: pdfBuffer },
        { Name: 'PageRange', Value: '1-10' }
    ],
    ContextUser: currentUser
});
```

#### Excel Reader Action

Reads data from Excel files with support for multiple sheets.

**Class:** `ExcelReaderAction`  
**Registration Name:** `"Excel Reader"`

**Parameters:**
- `ExcelData` (Buffer/string, required): Excel file data or base64 string
- `SheetName` (string, optional): Specific sheet to read
- `Range` (string, optional): Cell range to read (e.g., 'A1:D10')
- `ParseDates` (boolean, optional): Convert Excel dates (default: true)
- `IncludeEmptyRows` (boolean, optional): Include empty rows (default: false)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Excel Reader',
    Params: [
        { Name: 'ExcelData', Value: excelBuffer },
        { Name: 'SheetName', Value: 'Sales Data' }
    ],
    ContextUser: currentUser
});
```

#### Excel Writer Action

Creates Excel files from data with formatting options.

**Class:** `ExcelWriterAction`  
**Registration Name:** `"Excel Writer"`

**Parameters:**
- `Data` (array/object, required): Data to write (array of objects or sheets config)
- `SheetName` (string, optional): Sheet name (default: 'Sheet1')
- `IncludeHeaders` (boolean, optional): Include column headers (default: true)
- `ColumnWidths` (object, optional): Custom column widths
- `Formatting` (object/string, optional): Cell formatting rules

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Excel Writer',
    Params: [
        { Name: 'Data', Value: [{ name: 'John', sales: 1000 }, { name: 'Jane', sales: 1500 }] },
        { Name: 'SheetName', Value: 'Sales Report' }
    ],
    ContextUser: currentUser
});
```

#### File Compress Action

Compresses files into ZIP archives.

**Class:** `FileCompressAction`  
**Registration Name:** `"File Compress"`

**Parameters:**
- `Files` (array, required): Array of file objects with name and content
- `CompressionLevel` (number, optional): Compression level 0-9 (default: 6)
- `ArchiveName` (string, optional): Output archive name
- `Password` (string, optional): Password protection for archive

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'File Compress',
    Params: [
        { Name: 'Files', Value: [
            { name: 'report.txt', content: 'Report content' },
            { name: 'data.json', content: JSON.stringify(data) }
        ]},
        { Name: 'ArchiveName', Value: 'backup.zip' }
    ],
    ContextUser: currentUser
});
```

### 7. Integration Actions

#### HTTP Request Action

Makes HTTP requests with full control over headers, body, and authentication.

**Class:** `HTTPRequestAction`  
**Registration Name:** `"HTTP Request"`

**Parameters:**
- `URL` (string, required): Request URL
- `Method` (string, optional): HTTP method (default: 'GET')
- `Headers` (object/string, optional): Request headers
- `Body` (any, optional): Request body
- `Timeout` (number, optional): Request timeout in ms (default: 30000)
- `RetryCount` (number, optional): Number of retries (default: 0)
- `BasicAuth` (object, optional): Basic authentication credentials

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'HTTP Request',
    Params: [
        { Name: 'URL', Value: 'https://api.example.com/data' },
        { Name: 'Method', Value: 'POST' },
        { Name: 'Headers', Value: { 'Content-Type': 'application/json' } },
        { Name: 'Body', Value: { query: 'test' } }
    ],
    ContextUser: currentUser
});
```

#### GraphQL Query Action

Executes GraphQL queries and mutations with variable support.

**Class:** `GraphQLQueryAction`  
**Registration Name:** `"GraphQL Query"`

**Parameters:**
- `Endpoint` (string, required): GraphQL endpoint URL
- `Query` (string, required): GraphQL query or mutation
- `Variables` (object/string, optional): Query variables
- `Headers` (object/string, optional): Request headers
- `OperationName` (string, optional): Operation name for multi-operation documents

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'GraphQL Query',
    Params: [
        { Name: 'Endpoint', Value: 'https://api.example.com/graphql' },
        { Name: 'Query', Value: 'query GetUser($id: ID!) { user(id: $id) { name email } }' },
        { Name: 'Variables', Value: { id: '123' } }
    ],
    ContextUser: currentUser
});
```

#### OAuth Flow Action

Handles OAuth 2.0 authentication flows.

**Class:** `OAuthFlowAction`  
**Registration Name:** `"OAuth Flow"`

**Parameters:**
- `Provider` (string, required): OAuth provider name
- `ClientID` (string, required): OAuth client ID
- `ClientSecret` (string, required): OAuth client secret
- `RedirectURI` (string, required): Redirect URI
- `Scopes` (string/array, optional): Required scopes
- `State` (string, optional): State parameter for security

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'OAuth Flow',
    Params: [
        { Name: 'Provider', Value: 'google' },
        { Name: 'ClientID', Value: 'your-client-id' },
        { Name: 'ClientSecret', Value: 'your-client-secret' },
        { Name: 'RedirectURI', Value: 'https://app.example.com/callback' },
        { Name: 'Scopes', Value: ['email', 'profile'] }
    ],
    ContextUser: currentUser
});
```

#### API Rate Limiter Action

Manages API rate limiting with queuing and backoff strategies.

**Class:** `APIRateLimiterAction`  
**Registration Name:** `"API Rate Limiter"`

**Parameters:**
- `APIName` (string, required): API identifier
- `RequestsPerWindow` (number, required): Max requests per time window
- `WindowSizeMs` (number, optional): Time window in ms (default: 60000)
- `QueueRequests` (boolean, optional): Queue excess requests (default: true)
- `MaxQueueSize` (number, optional): Maximum queue size (default: 100)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'API Rate Limiter',
    Params: [
        { Name: 'APIName', Value: 'external-api' },
        { Name: 'RequestsPerWindow', Value: 100 },
        { Name: 'WindowSizeMs', Value: 60000 }
    ],
    ContextUser: currentUser
});
```

### 8. Security Actions

#### Password Strength Action

Evaluates password strength and provides improvement suggestions.

**Class:** `PasswordStrengthAction`  
**Registration Name:** `"Password Strength"`

**Parameters:**
- `Password` (string, required): Password to evaluate
- `MinLength` (number, optional): Minimum required length (default: 8)
- `RequireUppercase` (boolean, optional): Require uppercase letters (default: true)
- `RequireLowercase` (boolean, optional): Require lowercase letters (default: true)
- `RequireNumbers` (boolean, optional): Require numbers (default: true)
- `RequireSpecial` (boolean, optional): Require special characters (default: true)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Password Strength',
    Params: [
        { Name: 'Password', Value: 'MyP@ssw0rd' },
        { Name: 'MinLength', Value: 12 }
    ],
    ContextUser: currentUser
});
```

### 9. Workflow Control Actions

#### Conditional Action

Executes actions based on conditional logic.

**Class:** `ConditionalAction`  
**Registration Name:** `"Conditional"`

**Parameters:**
- `Condition` (string, required): JavaScript expression to evaluate
- `ThenAction` (object, required): Action to run if condition is true
- `ElseAction` (object, optional): Action to run if condition is false
- `Context` (object, optional): Variables available in condition

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Conditional',
    Params: [
        { Name: 'Condition', Value: 'value > 100' },
        { Name: 'Context', Value: { value: 150 } },
        { Name: 'ThenAction', Value: { name: 'Send Email', params: {...} } }
    ],
    ContextUser: currentUser
});
```

#### Loop Action

Executes actions repeatedly with iteration support.

**Class:** `LoopAction`  
**Registration Name:** `"Loop"`

**Parameters:**
- `Items` (array, optional): Array to iterate over
- `Count` (number, optional): Number of iterations (if no items)
- `Action` (object, required): Action to execute for each iteration
- `Parallel` (boolean, optional): Run iterations in parallel (default: false)
- `MaxConcurrency` (number, optional): Max parallel executions (default: 10)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Loop',
    Params: [
        { Name: 'Items', Value: [1, 2, 3, 4, 5] },
        { Name: 'Action', Value: { name: 'Process Item', params: {...} } },
        { Name: 'Parallel', Value: true }
    ],
    ContextUser: currentUser
});
```

#### Parallel Execute Action

Runs multiple actions concurrently with result aggregation.

**Class:** `ParallelExecuteAction`  
**Registration Name:** `"Parallel Execute"`

**Parameters:**
- `Actions` (array, required): Array of actions to execute
- `MaxConcurrency` (number, optional): Maximum concurrent executions (default: 10)
- `StopOnError` (boolean, optional): Stop all if one fails (default: false)
- `Timeout` (number, optional): Overall timeout in ms

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Parallel Execute',
    Params: [
        { Name: 'Actions', Value: [
            { name: 'Web Search', params: { SearchTerms: 'AI' } },
            { name: 'HTTP Request', params: { URL: 'https://api.example.com' } }
        ]},
        { Name: 'MaxConcurrency', Value: 2 }
    ],
    ContextUser: currentUser
});
```

#### Retry Action

Retries failed actions with configurable backoff strategies.

**Class:** `RetryAction`  
**Registration Name:** `"Retry"`

**Parameters:**
- `Action` (object, required): Action to retry
- `MaxRetries` (number, optional): Maximum retry attempts (default: 3)
- `InitialDelay` (number, optional): Initial delay in ms (default: 1000)
- `BackoffMultiplier` (number, optional): Delay multiplier (default: 2)
- `MaxDelay` (number, optional): Maximum delay in ms (default: 30000)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Retry',
    Params: [
        { Name: 'Action', Value: { name: 'HTTP Request', params: {...} } },
        { Name: 'MaxRetries', Value: 5 },
        { Name: 'InitialDelay', Value: 2000 }
    ],
    ContextUser: currentUser
});
```

#### Delay Action

Introduces delays in workflow execution.

**Class:** `DelayAction`  
**Registration Name:** `"Delay"`

**Parameters:**
- `DelayMs` (number, required): Delay duration in milliseconds
- `Jitter` (number, optional): Random jitter to add (0-1, percentage of delay)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Delay',
    Params: [
        { Name: 'DelayMs', Value: 5000 },
        { Name: 'Jitter', Value: 0.1 } // 10% jitter
    ],
    ContextUser: currentUser
});
```

### 10. Communication Actions

#### Slack Webhook Action

Sends messages to Slack channels via webhooks.

**Class:** `SlackWebhookAction`  
**Registration Name:** `"Slack Webhook"`

**Parameters:**
- `WebhookURL` (string, required): Slack webhook URL
- `Message` (string, required): Message text
- `Channel` (string, optional): Override default channel
- `Username` (string, optional): Override default username
- `IconEmoji` (string, optional): Override default icon
- `Attachments` (array/string, optional): Rich message attachments

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Slack Webhook',
    Params: [
        { Name: 'WebhookURL', Value: 'https://hooks.slack.com/services/...' },
        { Name: 'Message', Value: 'Deployment completed successfully!' },
        { Name: 'IconEmoji', Value: ':rocket:' }
    ],
    ContextUser: currentUser
});
```

#### Teams Webhook Action

Sends messages to Microsoft Teams channels via webhooks.

**Class:** `TeamsWebhookAction`  
**Registration Name:** `"Teams Webhook"`

**Parameters:**
- `WebhookURL` (string, required): Teams webhook URL
- `Title` (string, optional): Message title
- `Text` (string, required): Message text
- `ThemeColor` (string, optional): Message accent color
- `Sections` (array/string, optional): Message sections
- `Actions` (array/string, optional): Interactive actions

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Teams Webhook',
    Params: [
        { Name: 'WebhookURL', Value: 'https://outlook.office.com/webhook/...' },
        { Name: 'Title', Value: 'Build Status' },
        { Name: 'Text', Value: 'Build #123 completed successfully' },
        { Name: 'ThemeColor', Value: '00FF00' }
    ],
    ContextUser: currentUser
});
```

### 11. AI Actions

#### Execute AI Prompt Action

Executes AI prompts using MemberJunction's AI framework with model selection and parameter control.

**Class:** `ExecuteAIPromptAction`  
**Registration Name:** `"Execute AI Prompt"`

**Parameters:**
- `PromptID` (string, optional): ID of saved prompt template
- `PromptName` (string, optional): Name of saved prompt template
- `PromptText` (string, optional): Direct prompt text (if not using template)
- `ModelID` (string, optional): Specific AI model ID to use
- `ModelName` (string, optional): Specific AI model name to use
- `Temperature` (number, optional): Model temperature (0-2)
- `MaxTokens` (number, optional): Maximum response tokens
- `Variables` (object/string, optional): Variables to inject into prompt template

**Example Usage:**

```typescript
// Using a saved prompt template
const templateResult = await ActionEngine.RunAction({
    ActionName: 'Execute AI Prompt',
    Params: [
        { Name: 'PromptName', Value: 'Summarize Text' },
        { Name: 'Variables', Value: { text: 'Long article text here...' } },
        { Name: 'Temperature', Value: 0.7 }
    ],
    ContextUser: currentUser
});

// Using direct prompt text
const directResult = await ActionEngine.RunAction({
    ActionName: 'Execute AI Prompt',
    Params: [
        { Name: 'PromptText', Value: 'Explain quantum computing in simple terms' },
        { Name: 'ModelName', Value: 'gpt-4' },
        { Name: 'MaxTokens', Value: 500 }
    ],
    ContextUser: currentUser
});
```

## Special Features

### Dual JSON Parameter Support

Many actions support both JSON object and string inputs for flexibility:
- **JSON Object**: Pass JavaScript objects directly
- **JSON String**: Pass stringified JSON for dynamic content

This applies to actions like JSON Transform, HTTP Request, GraphQL Query, and others with object parameters.

### Error Handling and Recovery

Actions implement various error handling strategies:
- **Graceful Degradation**: Actions continue with partial results when possible
- **Detailed Error Messages**: Clear explanations of what went wrong
- **Retry Logic**: Built-in retry mechanisms for transient failures
- **Validation**: Input validation with helpful error messages

### Performance Considerations

- **Streaming Support**: Large file operations use streaming when possible
- **Batch Processing**: Actions process data in chunks for memory efficiency
- **Parallel Execution**: Workflow actions support concurrent processing
- **Resource Management**: Proper cleanup of resources after execution

```typescript
import { ExternalChangeDetectionAction } from '@memberjunction/core-actions';
import { ActionEngine } from '@memberjunction/actions';

// Check specific entities for changes
const specificResult = await ActionEngine.RunAction({
    ActionName: 'Run External Change Detection',
    Params: [
        { Name: 'EntityList', Value: 'Customers,Orders,Invoices' }
    ],
    ContextUser: currentUser
});

// Check all eligible entities
const allResult = await ActionEngine.RunAction({
    ActionName: 'Run External Change Detection',
    Params: [],
    ContextUser: currentUser
});

if (specificResult.Success) {
    console.log('External changes detected and replayed successfully');
} else {
    console.error('Change detection failed:', specificResult.Message);
}
```

### 5. Data Transformation Actions

#### CSV Parser Action

Parses CSV data with configurable options for headers, delimiters, and data types.

**Class:** `CSVParserAction`  
**Registration Name:** `"CSV Parser"`

**Parameters:**
- `CSVData` (string, required): The CSV data to parse
- `HasHeaders` (boolean, optional): Whether the first row contains headers (default: true)
- `Delimiter` (string, optional): Field delimiter (default: ',')
- `QuoteCharacter` (string, optional): Quote character for escaping (default: '"')
- `SkipEmptyRows` (boolean, optional): Skip empty rows (default: true)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'CSV Parser',
    Params: [
        { Name: 'CSVData', Value: 'Name,Age,City\nJohn,30,NYC\nJane,25,LA' },
        { Name: 'HasHeaders', Value: true }
    ],
    ContextUser: currentUser
});
```

#### JSON Transform Action

Transforms JSON data using JSONPath-style queries with multiple operations support.

**Class:** `JSONTransformAction`  
**Registration Name:** `"JSON Transform"`

**Parameters:**
- `InputData` (object/string, required): JSON data to transform (supports both JSON object and string)
- `Transformations` (string/array, required): JSONPath queries for transformation
- `OutputFormat` (string, optional): 'object' or 'array' (default: 'object')
- `DefaultValue` (any, optional): Default value for missing paths

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'JSON Transform',
    Params: [
        { Name: 'InputData', Value: { users: [{ name: 'John', age: 30 }] } },
        { Name: 'Transformations', Value: ['name:$.users[0].name', 'age:$.users[0].age'] }
    ],
    ContextUser: currentUser
});
```

#### XML Parser Action

Parses XML data into JSON format with namespace support.

**Class:** `XMLParserAction`  
**Registration Name:** `"XML Parser"`

**Parameters:**
- `XMLData` (string, required): The XML data to parse
- `RemoveNamespaces` (boolean, optional): Strip namespace prefixes (default: false)
- `ParseNumbers` (boolean, optional): Convert numeric strings to numbers (default: true)
- `ParseBooleans` (boolean, optional): Convert boolean strings to booleans (default: true)
- `AttributePrefix` (string, optional): Prefix for attributes (default: '@')

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'XML Parser',
    Params: [
        { Name: 'XMLData', Value: '<root><user id="1"><name>John</name></user></root>' },
        { Name: 'ParseNumbers', Value: true }
    ],
    ContextUser: currentUser
});
```

#### Aggregate Data Action

Performs aggregation operations on arrays of data with support for multiple aggregation functions.

**Class:** `AggregateDataAction`  
**Registration Name:** `"Aggregate Data"`

**Parameters:**
- `Data` (array, required): Array of objects to aggregate
- `GroupBy` (string/array, optional): Field(s) to group by
- `Aggregations` (object/string, required): Aggregation operations (sum, avg, count, min, max)
- `Having` (object, optional): Filter conditions on aggregated results

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Aggregate Data',
    Params: [
        { Name: 'Data', Value: [{ category: 'A', value: 10 }, { category: 'A', value: 20 }] },
        { Name: 'GroupBy', Value: 'category' },
        { Name: 'Aggregations', Value: { totalValue: 'sum:value', avgValue: 'avg:value' } }
    ],
    ContextUser: currentUser
});
```

#### Data Mapper Action

Maps data from one structure to another using field mappings and transformations.

**Class:** `DataMapperAction`  
**Registration Name:** `"Data Mapper"`

**Parameters:**
- `SourceData` (object/array, required): Data to map
- `Mappings` (object/string, required): Field mapping configuration
- `DefaultValues` (object, optional): Default values for missing fields
- `RemoveUnmapped` (boolean, optional): Remove fields not in mapping (default: false)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Data Mapper',
    Params: [
        { Name: 'SourceData', Value: { firstName: 'John', lastName: 'Doe' } },
        { Name: 'Mappings', Value: { fullName: '{{firstName}} {{lastName}}' } }
    ],
    ContextUser: currentUser
});
```

### 6. File Operations Actions

#### PDF Generator Action

Generates PDF documents from HTML or markdown content.

**Class:** `PDFGeneratorAction`  
**Registration Name:** `"PDF Generator"`

**Parameters:**
- `Content` (string, required): HTML or markdown content
- `ContentType` (string, optional): 'html' or 'markdown' (default: 'html')
- `Options` (object/string, optional): PDF options (margins, orientation, etc.)
- `FileName` (string, optional): Output filename

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'PDF Generator',
    Params: [
        { Name: 'Content', Value: '<h1>Report</h1><p>Content here</p>' },
        { Name: 'Options', Value: { margin: { top: '1in' }, orientation: 'portrait' } }
    ],
    ContextUser: currentUser
});
```

#### PDF Extractor Action

Extracts text and metadata from PDF files.

**Class:** `PDFExtractorAction`  
**Registration Name:** `"PDF Extractor"`

**Parameters:**
- `PDFData` (Buffer/string, required): PDF file data or base64 string
- `ExtractText` (boolean, optional): Extract text content (default: true)
- `ExtractMetadata` (boolean, optional): Extract document metadata (default: true)
- `PageRange` (string, optional): Pages to extract (e.g., '1-5,7,9-10')

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'PDF Extractor',
    Params: [
        { Name: 'PDFData', Value: pdfBuffer },
        { Name: 'PageRange', Value: '1-10' }
    ],
    ContextUser: currentUser
});
```

#### Excel Reader Action

Reads data from Excel files with support for multiple sheets.

**Class:** `ExcelReaderAction`  
**Registration Name:** `"Excel Reader"`

**Parameters:**
- `ExcelData` (Buffer/string, required): Excel file data or base64 string
- `SheetName` (string, optional): Specific sheet to read
- `Range` (string, optional): Cell range to read (e.g., 'A1:D10')
- `ParseDates` (boolean, optional): Convert Excel dates (default: true)
- `IncludeEmptyRows` (boolean, optional): Include empty rows (default: false)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Excel Reader',
    Params: [
        { Name: 'ExcelData', Value: excelBuffer },
        { Name: 'SheetName', Value: 'Sales Data' }
    ],
    ContextUser: currentUser
});
```

#### Excel Writer Action

Creates Excel files from data with formatting options.

**Class:** `ExcelWriterAction`  
**Registration Name:** `"Excel Writer"`

**Parameters:**
- `Data` (array/object, required): Data to write (array of objects or sheets config)
- `SheetName` (string, optional): Sheet name (default: 'Sheet1')
- `IncludeHeaders` (boolean, optional): Include column headers (default: true)
- `ColumnWidths` (object, optional): Custom column widths
- `Formatting` (object/string, optional): Cell formatting rules

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Excel Writer',
    Params: [
        { Name: 'Data', Value: [{ name: 'John', sales: 1000 }, { name: 'Jane', sales: 1500 }] },
        { Name: 'SheetName', Value: 'Sales Report' }
    ],
    ContextUser: currentUser
});
```

#### File Compress Action

Compresses files into ZIP archives.

**Class:** `FileCompressAction`  
**Registration Name:** `"File Compress"`

**Parameters:**
- `Files` (array, required): Array of file objects with name and content
- `CompressionLevel` (number, optional): Compression level 0-9 (default: 6)
- `ArchiveName` (string, optional): Output archive name
- `Password` (string, optional): Password protection for archive

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'File Compress',
    Params: [
        { Name: 'Files', Value: [
            { name: 'report.txt', content: 'Report content' },
            { name: 'data.json', content: JSON.stringify(data) }
        ]},
        { Name: 'ArchiveName', Value: 'backup.zip' }
    ],
    ContextUser: currentUser
});
```

### 7. Integration Actions

#### HTTP Request Action

Makes HTTP requests with full control over headers, body, and authentication.

**Class:** `HTTPRequestAction`  
**Registration Name:** `"HTTP Request"`

**Parameters:**
- `URL` (string, required): Request URL
- `Method` (string, optional): HTTP method (default: 'GET')
- `Headers` (object/string, optional): Request headers
- `Body` (any, optional): Request body
- `Timeout` (number, optional): Request timeout in ms (default: 30000)
- `RetryCount` (number, optional): Number of retries (default: 0)
- `BasicAuth` (object, optional): Basic authentication credentials

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'HTTP Request',
    Params: [
        { Name: 'URL', Value: 'https://api.example.com/data' },
        { Name: 'Method', Value: 'POST' },
        { Name: 'Headers', Value: { 'Content-Type': 'application/json' } },
        { Name: 'Body', Value: { query: 'test' } }
    ],
    ContextUser: currentUser
});
```

#### GraphQL Query Action

Executes GraphQL queries and mutations with variable support.

**Class:** `GraphQLQueryAction`  
**Registration Name:** `"GraphQL Query"`

**Parameters:**
- `Endpoint` (string, required): GraphQL endpoint URL
- `Query` (string, required): GraphQL query or mutation
- `Variables` (object/string, optional): Query variables
- `Headers` (object/string, optional): Request headers
- `OperationName` (string, optional): Operation name for multi-operation documents

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'GraphQL Query',
    Params: [
        { Name: 'Endpoint', Value: 'https://api.example.com/graphql' },
        { Name: 'Query', Value: 'query GetUser($id: ID!) { user(id: $id) { name email } }' },
        { Name: 'Variables', Value: { id: '123' } }
    ],
    ContextUser: currentUser
});
```

#### OAuth Flow Action

Handles OAuth 2.0 authentication flows.

**Class:** `OAuthFlowAction`  
**Registration Name:** `"OAuth Flow"`

**Parameters:**
- `Provider` (string, required): OAuth provider name
- `ClientID` (string, required): OAuth client ID
- `ClientSecret` (string, required): OAuth client secret
- `RedirectURI` (string, required): Redirect URI
- `Scopes` (string/array, optional): Required scopes
- `State` (string, optional): State parameter for security

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'OAuth Flow',
    Params: [
        { Name: 'Provider', Value: 'google' },
        { Name: 'ClientID', Value: 'your-client-id' },
        { Name: 'ClientSecret', Value: 'your-client-secret' },
        { Name: 'RedirectURI', Value: 'https://app.example.com/callback' },
        { Name: 'Scopes', Value: ['email', 'profile'] }
    ],
    ContextUser: currentUser
});
```

#### API Rate Limiter Action

Manages API rate limiting with queuing and backoff strategies.

**Class:** `APIRateLimiterAction`  
**Registration Name:** `"API Rate Limiter"`

**Parameters:**
- `APIName` (string, required): API identifier
- `RequestsPerWindow` (number, required): Max requests per time window
- `WindowSizeMs` (number, optional): Time window in ms (default: 60000)
- `QueueRequests` (boolean, optional): Queue excess requests (default: true)
- `MaxQueueSize` (number, optional): Maximum queue size (default: 100)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'API Rate Limiter',
    Params: [
        { Name: 'APIName', Value: 'external-api' },
        { Name: 'RequestsPerWindow', Value: 100 },
        { Name: 'WindowSizeMs', Value: 60000 }
    ],
    ContextUser: currentUser
});
```

### 8. Security Actions

#### Password Strength Action

Evaluates password strength and provides improvement suggestions.

**Class:** `PasswordStrengthAction`  
**Registration Name:** `"Password Strength"`

**Parameters:**
- `Password` (string, required): Password to evaluate
- `MinLength` (number, optional): Minimum required length (default: 8)
- `RequireUppercase` (boolean, optional): Require uppercase letters (default: true)
- `RequireLowercase` (boolean, optional): Require lowercase letters (default: true)
- `RequireNumbers` (boolean, optional): Require numbers (default: true)
- `RequireSpecial` (boolean, optional): Require special characters (default: true)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Password Strength',
    Params: [
        { Name: 'Password', Value: 'MyP@ssw0rd' },
        { Name: 'MinLength', Value: 12 }
    ],
    ContextUser: currentUser
});
```

### 9. Workflow Control Actions

#### Conditional Action

Executes actions based on conditional logic.

**Class:** `ConditionalAction`  
**Registration Name:** `"Conditional"`

**Parameters:**
- `Condition` (string, required): JavaScript expression to evaluate
- `ThenAction` (object, required): Action to run if condition is true
- `ElseAction` (object, optional): Action to run if condition is false
- `Context` (object, optional): Variables available in condition

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Conditional',
    Params: [
        { Name: 'Condition', Value: 'value > 100' },
        { Name: 'Context', Value: { value: 150 } },
        { Name: 'ThenAction', Value: { name: 'Send Email', params: {...} } }
    ],
    ContextUser: currentUser
});
```

#### Loop Action

Executes actions repeatedly with iteration support.

**Class:** `LoopAction`  
**Registration Name:** `"Loop"`

**Parameters:**
- `Items` (array, optional): Array to iterate over
- `Count` (number, optional): Number of iterations (if no items)
- `Action` (object, required): Action to execute for each iteration
- `Parallel` (boolean, optional): Run iterations in parallel (default: false)
- `MaxConcurrency` (number, optional): Max parallel executions (default: 10)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Loop',
    Params: [
        { Name: 'Items', Value: [1, 2, 3, 4, 5] },
        { Name: 'Action', Value: { name: 'Process Item', params: {...} } },
        { Name: 'Parallel', Value: true }
    ],
    ContextUser: currentUser
});
```

#### Parallel Execute Action

Runs multiple actions concurrently with result aggregation.

**Class:** `ParallelExecuteAction`  
**Registration Name:** `"Parallel Execute"`

**Parameters:**
- `Actions` (array, required): Array of actions to execute
- `MaxConcurrency` (number, optional): Maximum concurrent executions (default: 10)
- `StopOnError` (boolean, optional): Stop all if one fails (default: false)
- `Timeout` (number, optional): Overall timeout in ms

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Parallel Execute',
    Params: [
        { Name: 'Actions', Value: [
            { name: 'Web Search', params: { SearchTerms: 'AI' } },
            { name: 'HTTP Request', params: { URL: 'https://api.example.com' } }
        ]},
        { Name: 'MaxConcurrency', Value: 2 }
    ],
    ContextUser: currentUser
});
```

#### Retry Action

Retries failed actions with configurable backoff strategies.

**Class:** `RetryAction`  
**Registration Name:** `"Retry"`

**Parameters:**
- `Action` (object, required): Action to retry
- `MaxRetries` (number, optional): Maximum retry attempts (default: 3)
- `InitialDelay` (number, optional): Initial delay in ms (default: 1000)
- `BackoffMultiplier` (number, optional): Delay multiplier (default: 2)
- `MaxDelay` (number, optional): Maximum delay in ms (default: 30000)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Retry',
    Params: [
        { Name: 'Action', Value: { name: 'HTTP Request', params: {...} } },
        { Name: 'MaxRetries', Value: 5 },
        { Name: 'InitialDelay', Value: 2000 }
    ],
    ContextUser: currentUser
});
```

#### Delay Action

Introduces delays in workflow execution.

**Class:** `DelayAction`  
**Registration Name:** `"Delay"`

**Parameters:**
- `DelayMs` (number, required): Delay duration in milliseconds
- `Jitter` (number, optional): Random jitter to add (0-1, percentage of delay)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Delay',
    Params: [
        { Name: 'DelayMs', Value: 5000 },
        { Name: 'Jitter', Value: 0.1 } // 10% jitter
    ],
    ContextUser: currentUser
});
```

### 10. Communication Actions

#### Slack Webhook Action

Sends messages to Slack channels via webhooks.

**Class:** `SlackWebhookAction`  
**Registration Name:** `"Slack Webhook"`

**Parameters:**
- `WebhookURL` (string, required): Slack webhook URL
- `Message` (string, required): Message text
- `Channel` (string, optional): Override default channel
- `Username` (string, optional): Override default username
- `IconEmoji` (string, optional): Override default icon
- `Attachments` (array/string, optional): Rich message attachments

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Slack Webhook',
    Params: [
        { Name: 'WebhookURL', Value: 'https://hooks.slack.com/services/...' },
        { Name: 'Message', Value: 'Deployment completed successfully!' },
        { Name: 'IconEmoji', Value: ':rocket:' }
    ],
    ContextUser: currentUser
});
```

#### Teams Webhook Action

Sends messages to Microsoft Teams channels via webhooks.

**Class:** `TeamsWebhookAction`  
**Registration Name:** `"Teams Webhook"`

**Parameters:**
- `WebhookURL` (string, required): Teams webhook URL
- `Title` (string, optional): Message title
- `Text` (string, required): Message text
- `ThemeColor` (string, optional): Message accent color
- `Sections` (array/string, optional): Message sections
- `Actions` (array/string, optional): Interactive actions

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Teams Webhook',
    Params: [
        { Name: 'WebhookURL', Value: 'https://outlook.office.com/webhook/...' },
        { Name: 'Title', Value: 'Build Status' },
        { Name: 'Text', Value: 'Build #123 completed successfully' },
        { Name: 'ThemeColor', Value: '00FF00' }
    ],
    ContextUser: currentUser
});
```

### 11. AI Actions

#### Execute AI Prompt Action

Executes AI prompts using MemberJunction's AI framework with model selection and parameter control.

**Class:** `ExecuteAIPromptAction`  
**Registration Name:** `"Execute AI Prompt"`

**Parameters:**
- `PromptID` (string, optional): ID of saved prompt template
- `PromptName` (string, optional): Name of saved prompt template
- `PromptText` (string, optional): Direct prompt text (if not using template)
- `ModelID` (string, optional): Specific AI model ID to use
- `ModelName` (string, optional): Specific AI model name to use
- `Temperature` (number, optional): Model temperature (0-2)
- `MaxTokens` (number, optional): Maximum response tokens
- `Variables` (object/string, optional): Variables to inject into prompt template

**Example Usage:**

```typescript
// Using a saved prompt template
const templateResult = await ActionEngine.RunAction({
    ActionName: 'Execute AI Prompt',
    Params: [
        { Name: 'PromptName', Value: 'Summarize Text' },
        { Name: 'Variables', Value: { text: 'Long article text here...' } },
        { Name: 'Temperature', Value: 0.7 }
    ],
    ContextUser: currentUser
});

// Using direct prompt text
const directResult = await ActionEngine.RunAction({
    ActionName: 'Execute AI Prompt',
    Params: [
        { Name: 'PromptText', Value: 'Explain quantum computing in simple terms' },
        { Name: 'ModelName', Value: 'gpt-4' },
        { Name: 'MaxTokens', Value: 500 }
    ],
    ContextUser: currentUser
});
```

## Special Features

### Dual JSON Parameter Support

Many actions support both JSON object and string inputs for flexibility:
- **JSON Object**: Pass JavaScript objects directly
- **JSON String**: Pass stringified JSON for dynamic content

This applies to actions like JSON Transform, HTTP Request, GraphQL Query, and others with object parameters.

### Error Handling and Recovery

Actions implement various error handling strategies:
- **Graceful Degradation**: Actions continue with partial results when possible
- **Detailed Error Messages**: Clear explanations of what went wrong
- **Retry Logic**: Built-in retry mechanisms for transient failures
- **Validation**: Input validation with helpful error messages

### Performance Considerations

- **Streaming Support**: Large file operations use streaming when possible
- **Batch Processing**: Actions process data in chunks for memory efficiency
- **Parallel Execution**: Workflow actions support concurrent processing
- **Resource Management**: Proper cleanup of resources after execution

```

### 4. Web Search Action

Performs web searches using DuckDuckGo's API with built-in adaptive rate limiting to handle API request limits gracefully.

**Class:** `WebSearchAction`  
**Registration Name:** `"Web Search"`

**Parameters:**
- `SearchTerms` (string, required): Keywords to search for
- `MaxResults` (number, optional): Maximum number of results to return (default: 10, max: 30)
- `Region` (string, optional): Regional search preference (default: 'us-en')
- `SafeSearch` (string, optional): Safe search level - 'strict', 'moderate', 'off' (default: 'moderate')
- `DisableQueueing` (boolean, optional): If true, fails immediately when rate limited instead of queueing (default: false)

**Rate Limiting Features:**
- **Adaptive Queue Management**: Automatically activates request queueing when rate limits are detected
- **Exponential Backoff**: Implements retry logic with exponential delays (2s, 4s, 8s, 16s)
- **Auto-Recovery**: Deactivates queue after 10 seconds of successful requests
- **Configurable Behavior**: Option to disable queueing for immediate failure on rate limits

**Example Usage:**

```

### 5. Data Transformation Actions

#### CSV Parser Action

Parses CSV data with configurable options for headers, delimiters, and data types.

**Class:** `CSVParserAction`  
**Registration Name:** `"CSV Parser"`

**Parameters:**
- `CSVData` (string, required): The CSV data to parse
- `HasHeaders` (boolean, optional): Whether the first row contains headers (default: true)
- `Delimiter` (string, optional): Field delimiter (default: ',')
- `QuoteCharacter` (string, optional): Quote character for escaping (default: '"')
- `SkipEmptyRows` (boolean, optional): Skip empty rows (default: true)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'CSV Parser',
    Params: [
        { Name: 'CSVData', Value: 'Name,Age,City\nJohn,30,NYC\nJane,25,LA' },
        { Name: 'HasHeaders', Value: true }
    ],
    ContextUser: currentUser
});
```

#### JSON Transform Action

Transforms JSON data using JSONPath-style queries with multiple operations support.

**Class:** `JSONTransformAction`  
**Registration Name:** `"JSON Transform"`

**Parameters:**
- `InputData` (object/string, required): JSON data to transform (supports both JSON object and string)
- `Transformations` (string/array, required): JSONPath queries for transformation
- `OutputFormat` (string, optional): 'object' or 'array' (default: 'object')
- `DefaultValue` (any, optional): Default value for missing paths

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'JSON Transform',
    Params: [
        { Name: 'InputData', Value: { users: [{ name: 'John', age: 30 }] } },
        { Name: 'Transformations', Value: ['name:$.users[0].name', 'age:$.users[0].age'] }
    ],
    ContextUser: currentUser
});
```

#### XML Parser Action

Parses XML data into JSON format with namespace support.

**Class:** `XMLParserAction`  
**Registration Name:** `"XML Parser"`

**Parameters:**
- `XMLData` (string, required): The XML data to parse
- `RemoveNamespaces` (boolean, optional): Strip namespace prefixes (default: false)
- `ParseNumbers` (boolean, optional): Convert numeric strings to numbers (default: true)
- `ParseBooleans` (boolean, optional): Convert boolean strings to booleans (default: true)
- `AttributePrefix` (string, optional): Prefix for attributes (default: '@')

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'XML Parser',
    Params: [
        { Name: 'XMLData', Value: '<root><user id="1"><name>John</name></user></root>' },
        { Name: 'ParseNumbers', Value: true }
    ],
    ContextUser: currentUser
});
```

#### Aggregate Data Action

Performs aggregation operations on arrays of data with support for multiple aggregation functions.

**Class:** `AggregateDataAction`  
**Registration Name:** `"Aggregate Data"`

**Parameters:**
- `Data` (array, required): Array of objects to aggregate
- `GroupBy` (string/array, optional): Field(s) to group by
- `Aggregations` (object/string, required): Aggregation operations (sum, avg, count, min, max)
- `Having` (object, optional): Filter conditions on aggregated results

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Aggregate Data',
    Params: [
        { Name: 'Data', Value: [{ category: 'A', value: 10 }, { category: 'A', value: 20 }] },
        { Name: 'GroupBy', Value: 'category' },
        { Name: 'Aggregations', Value: { totalValue: 'sum:value', avgValue: 'avg:value' } }
    ],
    ContextUser: currentUser
});
```

#### Data Mapper Action

Maps data from one structure to another using field mappings and transformations.

**Class:** `DataMapperAction`  
**Registration Name:** `"Data Mapper"`

**Parameters:**
- `SourceData` (object/array, required): Data to map
- `Mappings` (object/string, required): Field mapping configuration
- `DefaultValues` (object, optional): Default values for missing fields
- `RemoveUnmapped` (boolean, optional): Remove fields not in mapping (default: false)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Data Mapper',
    Params: [
        { Name: 'SourceData', Value: { firstName: 'John', lastName: 'Doe' } },
        { Name: 'Mappings', Value: { fullName: '{{firstName}} {{lastName}}' } }
    ],
    ContextUser: currentUser
});
```

### 6. File Operations Actions

#### PDF Generator Action

Generates PDF documents from HTML or markdown content.

**Class:** `PDFGeneratorAction`  
**Registration Name:** `"PDF Generator"`

**Parameters:**
- `Content` (string, required): HTML or markdown content
- `ContentType` (string, optional): 'html' or 'markdown' (default: 'html')
- `Options` (object/string, optional): PDF options (margins, orientation, etc.)
- `FileName` (string, optional): Output filename

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'PDF Generator',
    Params: [
        { Name: 'Content', Value: '<h1>Report</h1><p>Content here</p>' },
        { Name: 'Options', Value: { margin: { top: '1in' }, orientation: 'portrait' } }
    ],
    ContextUser: currentUser
});
```

#### PDF Extractor Action

Extracts text and metadata from PDF files.

**Class:** `PDFExtractorAction`  
**Registration Name:** `"PDF Extractor"`

**Parameters:**
- `PDFData` (Buffer/string, required): PDF file data or base64 string
- `ExtractText` (boolean, optional): Extract text content (default: true)
- `ExtractMetadata` (boolean, optional): Extract document metadata (default: true)
- `PageRange` (string, optional): Pages to extract (e.g., '1-5,7,9-10')

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'PDF Extractor',
    Params: [
        { Name: 'PDFData', Value: pdfBuffer },
        { Name: 'PageRange', Value: '1-10' }
    ],
    ContextUser: currentUser
});
```

#### Excel Reader Action

Reads data from Excel files with support for multiple sheets.

**Class:** `ExcelReaderAction`  
**Registration Name:** `"Excel Reader"`

**Parameters:**
- `ExcelData` (Buffer/string, required): Excel file data or base64 string
- `SheetName` (string, optional): Specific sheet to read
- `Range` (string, optional): Cell range to read (e.g., 'A1:D10')
- `ParseDates` (boolean, optional): Convert Excel dates (default: true)
- `IncludeEmptyRows` (boolean, optional): Include empty rows (default: false)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Excel Reader',
    Params: [
        { Name: 'ExcelData', Value: excelBuffer },
        { Name: 'SheetName', Value: 'Sales Data' }
    ],
    ContextUser: currentUser
});
```

#### Excel Writer Action

Creates Excel files from data with formatting options.

**Class:** `ExcelWriterAction`  
**Registration Name:** `"Excel Writer"`

**Parameters:**
- `Data` (array/object, required): Data to write (array of objects or sheets config)
- `SheetName` (string, optional): Sheet name (default: 'Sheet1')
- `IncludeHeaders` (boolean, optional): Include column headers (default: true)
- `ColumnWidths` (object, optional): Custom column widths
- `Formatting` (object/string, optional): Cell formatting rules

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Excel Writer',
    Params: [
        { Name: 'Data', Value: [{ name: 'John', sales: 1000 }, { name: 'Jane', sales: 1500 }] },
        { Name: 'SheetName', Value: 'Sales Report' }
    ],
    ContextUser: currentUser
});
```

#### File Compress Action

Compresses files into ZIP archives.

**Class:** `FileCompressAction`  
**Registration Name:** `"File Compress"`

**Parameters:**
- `Files` (array, required): Array of file objects with name and content
- `CompressionLevel` (number, optional): Compression level 0-9 (default: 6)
- `ArchiveName` (string, optional): Output archive name
- `Password` (string, optional): Password protection for archive

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'File Compress',
    Params: [
        { Name: 'Files', Value: [
            { name: 'report.txt', content: 'Report content' },
            { name: 'data.json', content: JSON.stringify(data) }
        ]},
        { Name: 'ArchiveName', Value: 'backup.zip' }
    ],
    ContextUser: currentUser
});
```

### 7. Integration Actions

#### HTTP Request Action

Makes HTTP requests with full control over headers, body, and authentication.

**Class:** `HTTPRequestAction`  
**Registration Name:** `"HTTP Request"`

**Parameters:**
- `URL` (string, required): Request URL
- `Method` (string, optional): HTTP method (default: 'GET')
- `Headers` (object/string, optional): Request headers
- `Body` (any, optional): Request body
- `Timeout` (number, optional): Request timeout in ms (default: 30000)
- `RetryCount` (number, optional): Number of retries (default: 0)
- `BasicAuth` (object, optional): Basic authentication credentials

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'HTTP Request',
    Params: [
        { Name: 'URL', Value: 'https://api.example.com/data' },
        { Name: 'Method', Value: 'POST' },
        { Name: 'Headers', Value: { 'Content-Type': 'application/json' } },
        { Name: 'Body', Value: { query: 'test' } }
    ],
    ContextUser: currentUser
});
```

#### GraphQL Query Action

Executes GraphQL queries and mutations with variable support.

**Class:** `GraphQLQueryAction`  
**Registration Name:** `"GraphQL Query"`

**Parameters:**
- `Endpoint` (string, required): GraphQL endpoint URL
- `Query` (string, required): GraphQL query or mutation
- `Variables` (object/string, optional): Query variables
- `Headers` (object/string, optional): Request headers
- `OperationName` (string, optional): Operation name for multi-operation documents

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'GraphQL Query',
    Params: [
        { Name: 'Endpoint', Value: 'https://api.example.com/graphql' },
        { Name: 'Query', Value: 'query GetUser($id: ID!) { user(id: $id) { name email } }' },
        { Name: 'Variables', Value: { id: '123' } }
    ],
    ContextUser: currentUser
});
```

#### OAuth Flow Action

Handles OAuth 2.0 authentication flows.

**Class:** `OAuthFlowAction`  
**Registration Name:** `"OAuth Flow"`

**Parameters:**
- `Provider` (string, required): OAuth provider name
- `ClientID` (string, required): OAuth client ID
- `ClientSecret` (string, required): OAuth client secret
- `RedirectURI` (string, required): Redirect URI
- `Scopes` (string/array, optional): Required scopes
- `State` (string, optional): State parameter for security

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'OAuth Flow',
    Params: [
        { Name: 'Provider', Value: 'google' },
        { Name: 'ClientID', Value: 'your-client-id' },
        { Name: 'ClientSecret', Value: 'your-client-secret' },
        { Name: 'RedirectURI', Value: 'https://app.example.com/callback' },
        { Name: 'Scopes', Value: ['email', 'profile'] }
    ],
    ContextUser: currentUser
});
```

#### API Rate Limiter Action

Manages API rate limiting with queuing and backoff strategies.

**Class:** `APIRateLimiterAction`  
**Registration Name:** `"API Rate Limiter"`

**Parameters:**
- `APIName` (string, required): API identifier
- `RequestsPerWindow` (number, required): Max requests per time window
- `WindowSizeMs` (number, optional): Time window in ms (default: 60000)
- `QueueRequests` (boolean, optional): Queue excess requests (default: true)
- `MaxQueueSize` (number, optional): Maximum queue size (default: 100)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'API Rate Limiter',
    Params: [
        { Name: 'APIName', Value: 'external-api' },
        { Name: 'RequestsPerWindow', Value: 100 },
        { Name: 'WindowSizeMs', Value: 60000 }
    ],
    ContextUser: currentUser
});
```

### 8. Security Actions

#### Password Strength Action

Evaluates password strength and provides improvement suggestions.

**Class:** `PasswordStrengthAction`  
**Registration Name:** `"Password Strength"`

**Parameters:**
- `Password` (string, required): Password to evaluate
- `MinLength` (number, optional): Minimum required length (default: 8)
- `RequireUppercase` (boolean, optional): Require uppercase letters (default: true)
- `RequireLowercase` (boolean, optional): Require lowercase letters (default: true)
- `RequireNumbers` (boolean, optional): Require numbers (default: true)
- `RequireSpecial` (boolean, optional): Require special characters (default: true)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Password Strength',
    Params: [
        { Name: 'Password', Value: 'MyP@ssw0rd' },
        { Name: 'MinLength', Value: 12 }
    ],
    ContextUser: currentUser
});
```

### 9. Workflow Control Actions

#### Conditional Action

Executes actions based on conditional logic.

**Class:** `ConditionalAction`  
**Registration Name:** `"Conditional"`

**Parameters:**
- `Condition` (string, required): JavaScript expression to evaluate
- `ThenAction` (object, required): Action to run if condition is true
- `ElseAction` (object, optional): Action to run if condition is false
- `Context` (object, optional): Variables available in condition

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Conditional',
    Params: [
        { Name: 'Condition', Value: 'value > 100' },
        { Name: 'Context', Value: { value: 150 } },
        { Name: 'ThenAction', Value: { name: 'Send Email', params: {...} } }
    ],
    ContextUser: currentUser
});
```

#### Loop Action

Executes actions repeatedly with iteration support.

**Class:** `LoopAction`  
**Registration Name:** `"Loop"`

**Parameters:**
- `Items` (array, optional): Array to iterate over
- `Count` (number, optional): Number of iterations (if no items)
- `Action` (object, required): Action to execute for each iteration
- `Parallel` (boolean, optional): Run iterations in parallel (default: false)
- `MaxConcurrency` (number, optional): Max parallel executions (default: 10)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Loop',
    Params: [
        { Name: 'Items', Value: [1, 2, 3, 4, 5] },
        { Name: 'Action', Value: { name: 'Process Item', params: {...} } },
        { Name: 'Parallel', Value: true }
    ],
    ContextUser: currentUser
});
```

#### Parallel Execute Action

Runs multiple actions concurrently with result aggregation.

**Class:** `ParallelExecuteAction`  
**Registration Name:** `"Parallel Execute"`

**Parameters:**
- `Actions` (array, required): Array of actions to execute
- `MaxConcurrency` (number, optional): Maximum concurrent executions (default: 10)
- `StopOnError` (boolean, optional): Stop all if one fails (default: false)
- `Timeout` (number, optional): Overall timeout in ms

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Parallel Execute',
    Params: [
        { Name: 'Actions', Value: [
            { name: 'Web Search', params: { SearchTerms: 'AI' } },
            { name: 'HTTP Request', params: { URL: 'https://api.example.com' } }
        ]},
        { Name: 'MaxConcurrency', Value: 2 }
    ],
    ContextUser: currentUser
});
```

#### Retry Action

Retries failed actions with configurable backoff strategies.

**Class:** `RetryAction`  
**Registration Name:** `"Retry"`

**Parameters:**
- `Action` (object, required): Action to retry
- `MaxRetries` (number, optional): Maximum retry attempts (default: 3)
- `InitialDelay` (number, optional): Initial delay in ms (default: 1000)
- `BackoffMultiplier` (number, optional): Delay multiplier (default: 2)
- `MaxDelay` (number, optional): Maximum delay in ms (default: 30000)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Retry',
    Params: [
        { Name: 'Action', Value: { name: 'HTTP Request', params: {...} } },
        { Name: 'MaxRetries', Value: 5 },
        { Name: 'InitialDelay', Value: 2000 }
    ],
    ContextUser: currentUser
});
```

#### Delay Action

Introduces delays in workflow execution.

**Class:** `DelayAction`  
**Registration Name:** `"Delay"`

**Parameters:**
- `DelayMs` (number, required): Delay duration in milliseconds
- `Jitter` (number, optional): Random jitter to add (0-1, percentage of delay)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Delay',
    Params: [
        { Name: 'DelayMs', Value: 5000 },
        { Name: 'Jitter', Value: 0.1 } // 10% jitter
    ],
    ContextUser: currentUser
});
```

### 10. Communication Actions

#### Slack Webhook Action

Sends messages to Slack channels via webhooks.

**Class:** `SlackWebhookAction`  
**Registration Name:** `"Slack Webhook"`

**Parameters:**
- `WebhookURL` (string, required): Slack webhook URL
- `Message` (string, required): Message text
- `Channel` (string, optional): Override default channel
- `Username` (string, optional): Override default username
- `IconEmoji` (string, optional): Override default icon
- `Attachments` (array/string, optional): Rich message attachments

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Slack Webhook',
    Params: [
        { Name: 'WebhookURL', Value: 'https://hooks.slack.com/services/...' },
        { Name: 'Message', Value: 'Deployment completed successfully!' },
        { Name: 'IconEmoji', Value: ':rocket:' }
    ],
    ContextUser: currentUser
});
```

#### Teams Webhook Action

Sends messages to Microsoft Teams channels via webhooks.

**Class:** `TeamsWebhookAction`  
**Registration Name:** `"Teams Webhook"`

**Parameters:**
- `WebhookURL` (string, required): Teams webhook URL
- `Title` (string, optional): Message title
- `Text` (string, required): Message text
- `ThemeColor` (string, optional): Message accent color
- `Sections` (array/string, optional): Message sections
- `Actions` (array/string, optional): Interactive actions

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Teams Webhook',
    Params: [
        { Name: 'WebhookURL', Value: 'https://outlook.office.com/webhook/...' },
        { Name: 'Title', Value: 'Build Status' },
        { Name: 'Text', Value: 'Build #123 completed successfully' },
        { Name: 'ThemeColor', Value: '00FF00' }
    ],
    ContextUser: currentUser
});
```

### 11. AI Actions

#### Execute AI Prompt Action

Executes AI prompts using MemberJunction's AI framework with model selection and parameter control.

**Class:** `ExecuteAIPromptAction`  
**Registration Name:** `"Execute AI Prompt"`

**Parameters:**
- `PromptID` (string, optional): ID of saved prompt template
- `PromptName` (string, optional): Name of saved prompt template
- `PromptText` (string, optional): Direct prompt text (if not using template)
- `ModelID` (string, optional): Specific AI model ID to use
- `ModelName` (string, optional): Specific AI model name to use
- `Temperature` (number, optional): Model temperature (0-2)
- `MaxTokens` (number, optional): Maximum response tokens
- `Variables` (object/string, optional): Variables to inject into prompt template

**Example Usage:**

```typescript
// Using a saved prompt template
const templateResult = await ActionEngine.RunAction({
    ActionName: 'Execute AI Prompt',
    Params: [
        { Name: 'PromptName', Value: 'Summarize Text' },
        { Name: 'Variables', Value: { text: 'Long article text here...' } },
        { Name: 'Temperature', Value: 0.7 }
    ],
    ContextUser: currentUser
});

// Using direct prompt text
const directResult = await ActionEngine.RunAction({
    ActionName: 'Execute AI Prompt',
    Params: [
        { Name: 'PromptText', Value: 'Explain quantum computing in simple terms' },
        { Name: 'ModelName', Value: 'gpt-4' },
        { Name: 'MaxTokens', Value: 500 }
    ],
    ContextUser: currentUser
});
```

## Special Features

### Dual JSON Parameter Support

Many actions support both JSON object and string inputs for flexibility:
- **JSON Object**: Pass JavaScript objects directly
- **JSON String**: Pass stringified JSON for dynamic content

This applies to actions like JSON Transform, HTTP Request, GraphQL Query, and others with object parameters.

### Error Handling and Recovery

Actions implement various error handling strategies:
- **Graceful Degradation**: Actions continue with partial results when possible
- **Detailed Error Messages**: Clear explanations of what went wrong
- **Retry Logic**: Built-in retry mechanisms for transient failures
- **Validation**: Input validation with helpful error messages

### Performance Considerations

- **Streaming Support**: Large file operations use streaming when possible
- **Batch Processing**: Actions process data in chunks for memory efficiency
- **Parallel Execution**: Workflow actions support concurrent processing
- **Resource Management**: Proper cleanup of resources after execution

```typescript
import { WebSearchAction } from '@memberjunction/core-actions';
import { ActionEngine } from '@memberjunction/actions';

// Basic web search
const searchResult = await ActionEngine.RunAction({
    ActionName: 'Web Search',
    Params: [
        { Name: 'SearchTerms', Value: 'TypeScript programming' }
    ],
    ContextUser: currentUser
});

// Search with custom options
const customResult = await ActionEngine.RunAction({
    ActionName: 'Web Search',
    Params: [
        { Name: 'SearchTerms', Value: 'machine learning tutorials' },
        { Name: 'MaxResults', Value: 15 },
        { Name: 'Region', Value: 'uk-en' },
        { Name: 'SafeSearch', Value: 'strict' }
    ],
    ContextUser: currentUser
});

// Search with immediate failure on rate limits
const immediateResult = await ActionEngine.RunAction({
    ActionName: 'Web Search',
    Params: [
        { Name: 'SearchTerms', Value: 'data science' },
        { Name: 'DisableQueueing', Value: true }
    ],
    ContextUser: currentUser
});

if (searchResult.Success) {
    const results = searchResult.ResultObject;
    console.log(`Found ${results.length} search results`);
    results.forEach(result => {
        console.log(`Title: ${result.title}`);
        console.log(`URL: ${result.url}`);
        console.log(`Snippet: ${result.snippet}`);
    });
}
```
```

### 5. Data Transformation Actions

#### CSV Parser Action

Parses CSV data with configurable options for headers, delimiters, and data types.

**Class:** `CSVParserAction`  
**Registration Name:** `"CSV Parser"`

**Parameters:**
- `CSVData` (string, required): The CSV data to parse
- `HasHeaders` (boolean, optional): Whether the first row contains headers (default: true)
- `Delimiter` (string, optional): Field delimiter (default: ',')
- `QuoteCharacter` (string, optional): Quote character for escaping (default: '"')
- `SkipEmptyRows` (boolean, optional): Skip empty rows (default: true)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'CSV Parser',
    Params: [
        { Name: 'CSVData', Value: 'Name,Age,City\nJohn,30,NYC\nJane,25,LA' },
        { Name: 'HasHeaders', Value: true }
    ],
    ContextUser: currentUser
});
```

#### JSON Transform Action

Transforms JSON data using JSONPath-style queries with multiple operations support.

**Class:** `JSONTransformAction`  
**Registration Name:** `"JSON Transform"`

**Parameters:**
- `InputData` (object/string, required): JSON data to transform (supports both JSON object and string)
- `Transformations` (string/array, required): JSONPath queries for transformation
- `OutputFormat` (string, optional): 'object' or 'array' (default: 'object')
- `DefaultValue` (any, optional): Default value for missing paths

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'JSON Transform',
    Params: [
        { Name: 'InputData', Value: { users: [{ name: 'John', age: 30 }] } },
        { Name: 'Transformations', Value: ['name:$.users[0].name', 'age:$.users[0].age'] }
    ],
    ContextUser: currentUser
});
```

#### XML Parser Action

Parses XML data into JSON format with namespace support.

**Class:** `XMLParserAction`  
**Registration Name:** `"XML Parser"`

**Parameters:**
- `XMLData` (string, required): The XML data to parse
- `RemoveNamespaces` (boolean, optional): Strip namespace prefixes (default: false)
- `ParseNumbers` (boolean, optional): Convert numeric strings to numbers (default: true)
- `ParseBooleans` (boolean, optional): Convert boolean strings to booleans (default: true)
- `AttributePrefix` (string, optional): Prefix for attributes (default: '@')

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'XML Parser',
    Params: [
        { Name: 'XMLData', Value: '<root><user id="1"><name>John</name></user></root>' },
        { Name: 'ParseNumbers', Value: true }
    ],
    ContextUser: currentUser
});
```

#### Aggregate Data Action

Performs aggregation operations on arrays of data with support for multiple aggregation functions.

**Class:** `AggregateDataAction`  
**Registration Name:** `"Aggregate Data"`

**Parameters:**
- `Data` (array, required): Array of objects to aggregate
- `GroupBy` (string/array, optional): Field(s) to group by
- `Aggregations` (object/string, required): Aggregation operations (sum, avg, count, min, max)
- `Having` (object, optional): Filter conditions on aggregated results

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Aggregate Data',
    Params: [
        { Name: 'Data', Value: [{ category: 'A', value: 10 }, { category: 'A', value: 20 }] },
        { Name: 'GroupBy', Value: 'category' },
        { Name: 'Aggregations', Value: { totalValue: 'sum:value', avgValue: 'avg:value' } }
    ],
    ContextUser: currentUser
});
```

#### Data Mapper Action

Maps data from one structure to another using field mappings and transformations.

**Class:** `DataMapperAction`  
**Registration Name:** `"Data Mapper"`

**Parameters:**
- `SourceData` (object/array, required): Data to map
- `Mappings` (object/string, required): Field mapping configuration
- `DefaultValues` (object, optional): Default values for missing fields
- `RemoveUnmapped` (boolean, optional): Remove fields not in mapping (default: false)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Data Mapper',
    Params: [
        { Name: 'SourceData', Value: { firstName: 'John', lastName: 'Doe' } },
        { Name: 'Mappings', Value: { fullName: '{{firstName}} {{lastName}}' } }
    ],
    ContextUser: currentUser
});
```

### 6. File Operations Actions

#### PDF Generator Action

Generates PDF documents from HTML or markdown content.

**Class:** `PDFGeneratorAction`  
**Registration Name:** `"PDF Generator"`

**Parameters:**
- `Content` (string, required): HTML or markdown content
- `ContentType` (string, optional): 'html' or 'markdown' (default: 'html')
- `Options` (object/string, optional): PDF options (margins, orientation, etc.)
- `FileName` (string, optional): Output filename

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'PDF Generator',
    Params: [
        { Name: 'Content', Value: '<h1>Report</h1><p>Content here</p>' },
        { Name: 'Options', Value: { margin: { top: '1in' }, orientation: 'portrait' } }
    ],
    ContextUser: currentUser
});
```

#### PDF Extractor Action

Extracts text and metadata from PDF files.

**Class:** `PDFExtractorAction`  
**Registration Name:** `"PDF Extractor"`

**Parameters:**
- `PDFData` (Buffer/string, required): PDF file data or base64 string
- `ExtractText` (boolean, optional): Extract text content (default: true)
- `ExtractMetadata` (boolean, optional): Extract document metadata (default: true)
- `PageRange` (string, optional): Pages to extract (e.g., '1-5,7,9-10')

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'PDF Extractor',
    Params: [
        { Name: 'PDFData', Value: pdfBuffer },
        { Name: 'PageRange', Value: '1-10' }
    ],
    ContextUser: currentUser
});
```

#### Excel Reader Action

Reads data from Excel files with support for multiple sheets.

**Class:** `ExcelReaderAction`  
**Registration Name:** `"Excel Reader"`

**Parameters:**
- `ExcelData` (Buffer/string, required): Excel file data or base64 string
- `SheetName` (string, optional): Specific sheet to read
- `Range` (string, optional): Cell range to read (e.g., 'A1:D10')
- `ParseDates` (boolean, optional): Convert Excel dates (default: true)
- `IncludeEmptyRows` (boolean, optional): Include empty rows (default: false)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Excel Reader',
    Params: [
        { Name: 'ExcelData', Value: excelBuffer },
        { Name: 'SheetName', Value: 'Sales Data' }
    ],
    ContextUser: currentUser
});
```

#### Excel Writer Action

Creates Excel files from data with formatting options.

**Class:** `ExcelWriterAction`  
**Registration Name:** `"Excel Writer"`

**Parameters:**
- `Data` (array/object, required): Data to write (array of objects or sheets config)
- `SheetName` (string, optional): Sheet name (default: 'Sheet1')
- `IncludeHeaders` (boolean, optional): Include column headers (default: true)
- `ColumnWidths` (object, optional): Custom column widths
- `Formatting` (object/string, optional): Cell formatting rules

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Excel Writer',
    Params: [
        { Name: 'Data', Value: [{ name: 'John', sales: 1000 }, { name: 'Jane', sales: 1500 }] },
        { Name: 'SheetName', Value: 'Sales Report' }
    ],
    ContextUser: currentUser
});
```

#### File Compress Action

Compresses files into ZIP archives.

**Class:** `FileCompressAction`  
**Registration Name:** `"File Compress"`

**Parameters:**
- `Files` (array, required): Array of file objects with name and content
- `CompressionLevel` (number, optional): Compression level 0-9 (default: 6)
- `ArchiveName` (string, optional): Output archive name
- `Password` (string, optional): Password protection for archive

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'File Compress',
    Params: [
        { Name: 'Files', Value: [
            { name: 'report.txt', content: 'Report content' },
            { name: 'data.json', content: JSON.stringify(data) }
        ]},
        { Name: 'ArchiveName', Value: 'backup.zip' }
    ],
    ContextUser: currentUser
});
```

### 7. Integration Actions

#### HTTP Request Action

Makes HTTP requests with full control over headers, body, and authentication.

**Class:** `HTTPRequestAction`  
**Registration Name:** `"HTTP Request"`

**Parameters:**
- `URL` (string, required): Request URL
- `Method` (string, optional): HTTP method (default: 'GET')
- `Headers` (object/string, optional): Request headers
- `Body` (any, optional): Request body
- `Timeout` (number, optional): Request timeout in ms (default: 30000)
- `RetryCount` (number, optional): Number of retries (default: 0)
- `BasicAuth` (object, optional): Basic authentication credentials

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'HTTP Request',
    Params: [
        { Name: 'URL', Value: 'https://api.example.com/data' },
        { Name: 'Method', Value: 'POST' },
        { Name: 'Headers', Value: { 'Content-Type': 'application/json' } },
        { Name: 'Body', Value: { query: 'test' } }
    ],
    ContextUser: currentUser
});
```

#### GraphQL Query Action

Executes GraphQL queries and mutations with variable support.

**Class:** `GraphQLQueryAction`  
**Registration Name:** `"GraphQL Query"`

**Parameters:**
- `Endpoint` (string, required): GraphQL endpoint URL
- `Query` (string, required): GraphQL query or mutation
- `Variables` (object/string, optional): Query variables
- `Headers` (object/string, optional): Request headers
- `OperationName` (string, optional): Operation name for multi-operation documents

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'GraphQL Query',
    Params: [
        { Name: 'Endpoint', Value: 'https://api.example.com/graphql' },
        { Name: 'Query', Value: 'query GetUser($id: ID!) { user(id: $id) { name email } }' },
        { Name: 'Variables', Value: { id: '123' } }
    ],
    ContextUser: currentUser
});
```

#### OAuth Flow Action

Handles OAuth 2.0 authentication flows.

**Class:** `OAuthFlowAction`  
**Registration Name:** `"OAuth Flow"`

**Parameters:**
- `Provider` (string, required): OAuth provider name
- `ClientID` (string, required): OAuth client ID
- `ClientSecret` (string, required): OAuth client secret
- `RedirectURI` (string, required): Redirect URI
- `Scopes` (string/array, optional): Required scopes
- `State` (string, optional): State parameter for security

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'OAuth Flow',
    Params: [
        { Name: 'Provider', Value: 'google' },
        { Name: 'ClientID', Value: 'your-client-id' },
        { Name: 'ClientSecret', Value: 'your-client-secret' },
        { Name: 'RedirectURI', Value: 'https://app.example.com/callback' },
        { Name: 'Scopes', Value: ['email', 'profile'] }
    ],
    ContextUser: currentUser
});
```

#### API Rate Limiter Action

Manages API rate limiting with queuing and backoff strategies.

**Class:** `APIRateLimiterAction`  
**Registration Name:** `"API Rate Limiter"`

**Parameters:**
- `APIName` (string, required): API identifier
- `RequestsPerWindow` (number, required): Max requests per time window
- `WindowSizeMs` (number, optional): Time window in ms (default: 60000)
- `QueueRequests` (boolean, optional): Queue excess requests (default: true)
- `MaxQueueSize` (number, optional): Maximum queue size (default: 100)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'API Rate Limiter',
    Params: [
        { Name: 'APIName', Value: 'external-api' },
        { Name: 'RequestsPerWindow', Value: 100 },
        { Name: 'WindowSizeMs', Value: 60000 }
    ],
    ContextUser: currentUser
});
```

### 8. Security Actions

#### Password Strength Action

Evaluates password strength and provides improvement suggestions.

**Class:** `PasswordStrengthAction`  
**Registration Name:** `"Password Strength"`

**Parameters:**
- `Password` (string, required): Password to evaluate
- `MinLength` (number, optional): Minimum required length (default: 8)
- `RequireUppercase` (boolean, optional): Require uppercase letters (default: true)
- `RequireLowercase` (boolean, optional): Require lowercase letters (default: true)
- `RequireNumbers` (boolean, optional): Require numbers (default: true)
- `RequireSpecial` (boolean, optional): Require special characters (default: true)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Password Strength',
    Params: [
        { Name: 'Password', Value: 'MyP@ssw0rd' },
        { Name: 'MinLength', Value: 12 }
    ],
    ContextUser: currentUser
});
```

### 9. Workflow Control Actions

#### Conditional Action

Executes actions based on conditional logic.

**Class:** `ConditionalAction`  
**Registration Name:** `"Conditional"`

**Parameters:**
- `Condition` (string, required): JavaScript expression to evaluate
- `ThenAction` (object, required): Action to run if condition is true
- `ElseAction` (object, optional): Action to run if condition is false
- `Context` (object, optional): Variables available in condition

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Conditional',
    Params: [
        { Name: 'Condition', Value: 'value > 100' },
        { Name: 'Context', Value: { value: 150 } },
        { Name: 'ThenAction', Value: { name: 'Send Email', params: {...} } }
    ],
    ContextUser: currentUser
});
```

#### Loop Action

Executes actions repeatedly with iteration support.

**Class:** `LoopAction`  
**Registration Name:** `"Loop"`

**Parameters:**
- `Items` (array, optional): Array to iterate over
- `Count` (number, optional): Number of iterations (if no items)
- `Action` (object, required): Action to execute for each iteration
- `Parallel` (boolean, optional): Run iterations in parallel (default: false)
- `MaxConcurrency` (number, optional): Max parallel executions (default: 10)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Loop',
    Params: [
        { Name: 'Items', Value: [1, 2, 3, 4, 5] },
        { Name: 'Action', Value: { name: 'Process Item', params: {...} } },
        { Name: 'Parallel', Value: true }
    ],
    ContextUser: currentUser
});
```

#### Parallel Execute Action

Runs multiple actions concurrently with result aggregation.

**Class:** `ParallelExecuteAction`  
**Registration Name:** `"Parallel Execute"`

**Parameters:**
- `Actions` (array, required): Array of actions to execute
- `MaxConcurrency` (number, optional): Maximum concurrent executions (default: 10)
- `StopOnError` (boolean, optional): Stop all if one fails (default: false)
- `Timeout` (number, optional): Overall timeout in ms

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Parallel Execute',
    Params: [
        { Name: 'Actions', Value: [
            { name: 'Web Search', params: { SearchTerms: 'AI' } },
            { name: 'HTTP Request', params: { URL: 'https://api.example.com' } }
        ]},
        { Name: 'MaxConcurrency', Value: 2 }
    ],
    ContextUser: currentUser
});
```

#### Retry Action

Retries failed actions with configurable backoff strategies.

**Class:** `RetryAction`  
**Registration Name:** `"Retry"`

**Parameters:**
- `Action` (object, required): Action to retry
- `MaxRetries` (number, optional): Maximum retry attempts (default: 3)
- `InitialDelay` (number, optional): Initial delay in ms (default: 1000)
- `BackoffMultiplier` (number, optional): Delay multiplier (default: 2)
- `MaxDelay` (number, optional): Maximum delay in ms (default: 30000)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Retry',
    Params: [
        { Name: 'Action', Value: { name: 'HTTP Request', params: {...} } },
        { Name: 'MaxRetries', Value: 5 },
        { Name: 'InitialDelay', Value: 2000 }
    ],
    ContextUser: currentUser
});
```

#### Delay Action

Introduces delays in workflow execution.

**Class:** `DelayAction`  
**Registration Name:** `"Delay"`

**Parameters:**
- `DelayMs` (number, required): Delay duration in milliseconds
- `Jitter` (number, optional): Random jitter to add (0-1, percentage of delay)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Delay',
    Params: [
        { Name: 'DelayMs', Value: 5000 },
        { Name: 'Jitter', Value: 0.1 } // 10% jitter
    ],
    ContextUser: currentUser
});
```

### 10. Communication Actions

#### Slack Webhook Action

Sends messages to Slack channels via webhooks.

**Class:** `SlackWebhookAction`  
**Registration Name:** `"Slack Webhook"`

**Parameters:**
- `WebhookURL` (string, required): Slack webhook URL
- `Message` (string, required): Message text
- `Channel` (string, optional): Override default channel
- `Username` (string, optional): Override default username
- `IconEmoji` (string, optional): Override default icon
- `Attachments` (array/string, optional): Rich message attachments

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Slack Webhook',
    Params: [
        { Name: 'WebhookURL', Value: 'https://hooks.slack.com/services/...' },
        { Name: 'Message', Value: 'Deployment completed successfully!' },
        { Name: 'IconEmoji', Value: ':rocket:' }
    ],
    ContextUser: currentUser
});
```

#### Teams Webhook Action

Sends messages to Microsoft Teams channels via webhooks.

**Class:** `TeamsWebhookAction`  
**Registration Name:** `"Teams Webhook"`

**Parameters:**
- `WebhookURL` (string, required): Teams webhook URL
- `Title` (string, optional): Message title
- `Text` (string, required): Message text
- `ThemeColor` (string, optional): Message accent color
- `Sections` (array/string, optional): Message sections
- `Actions` (array/string, optional): Interactive actions

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Teams Webhook',
    Params: [
        { Name: 'WebhookURL', Value: 'https://outlook.office.com/webhook/...' },
        { Name: 'Title', Value: 'Build Status' },
        { Name: 'Text', Value: 'Build #123 completed successfully' },
        { Name: 'ThemeColor', Value: '00FF00' }
    ],
    ContextUser: currentUser
});
```

### 11. AI Actions

#### Execute AI Prompt Action

Executes AI prompts using MemberJunction's AI framework with model selection and parameter control.

**Class:** `ExecuteAIPromptAction`  
**Registration Name:** `"Execute AI Prompt"`

**Parameters:**
- `PromptID` (string, optional): ID of saved prompt template
- `PromptName` (string, optional): Name of saved prompt template
- `PromptText` (string, optional): Direct prompt text (if not using template)
- `ModelID` (string, optional): Specific AI model ID to use
- `ModelName` (string, optional): Specific AI model name to use
- `Temperature` (number, optional): Model temperature (0-2)
- `MaxTokens` (number, optional): Maximum response tokens
- `Variables` (object/string, optional): Variables to inject into prompt template

**Example Usage:**

```typescript
// Using a saved prompt template
const templateResult = await ActionEngine.RunAction({
    ActionName: 'Execute AI Prompt',
    Params: [
        { Name: 'PromptName', Value: 'Summarize Text' },
        { Name: 'Variables', Value: { text: 'Long article text here...' } },
        { Name: 'Temperature', Value: 0.7 }
    ],
    ContextUser: currentUser
});

// Using direct prompt text
const directResult = await ActionEngine.RunAction({
    ActionName: 'Execute AI Prompt',
    Params: [
        { Name: 'PromptText', Value: 'Explain quantum computing in simple terms' },
        { Name: 'ModelName', Value: 'gpt-4' },
        { Name: 'MaxTokens', Value: 500 }
    ],
    ContextUser: currentUser
});
```

## Special Features

### Dual JSON Parameter Support

Many actions support both JSON object and string inputs for flexibility:
- **JSON Object**: Pass JavaScript objects directly
- **JSON String**: Pass stringified JSON for dynamic content

This applies to actions like JSON Transform, HTTP Request, GraphQL Query, and others with object parameters.

### Error Handling and Recovery

Actions implement various error handling strategies:
- **Graceful Degradation**: Actions continue with partial results when possible
- **Detailed Error Messages**: Clear explanations of what went wrong
- **Retry Logic**: Built-in retry mechanisms for transient failures
- **Validation**: Input validation with helpful error messages

### Performance Considerations

- **Streaming Support**: Large file operations use streaming when possible
- **Batch Processing**: Actions process data in chunks for memory efficiency
- **Parallel Execution**: Workflow actions support concurrent processing
- **Resource Management**: Proper cleanup of resources after execution

```

## Integration with MemberJunction Actions Framework

All actions in this package extend the `BaseAction` class from `@memberjunction/actions` and are automatically registered with the MemberJunction class factory system using the `@RegisterClass` decorator.

To use these actions, you typically interact with them through the `ActionEngine` rather than instantiating them directly:

```

### 5. Data Transformation Actions

#### CSV Parser Action

Parses CSV data with configurable options for headers, delimiters, and data types.

**Class:** `CSVParserAction`  
**Registration Name:** `"CSV Parser"`

**Parameters:**
- `CSVData` (string, required): The CSV data to parse
- `HasHeaders` (boolean, optional): Whether the first row contains headers (default: true)
- `Delimiter` (string, optional): Field delimiter (default: ',')
- `QuoteCharacter` (string, optional): Quote character for escaping (default: '"')
- `SkipEmptyRows` (boolean, optional): Skip empty rows (default: true)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'CSV Parser',
    Params: [
        { Name: 'CSVData', Value: 'Name,Age,City\nJohn,30,NYC\nJane,25,LA' },
        { Name: 'HasHeaders', Value: true }
    ],
    ContextUser: currentUser
});
```

#### JSON Transform Action

Transforms JSON data using JSONPath-style queries with multiple operations support.

**Class:** `JSONTransformAction`  
**Registration Name:** `"JSON Transform"`

**Parameters:**
- `InputData` (object/string, required): JSON data to transform (supports both JSON object and string)
- `Transformations` (string/array, required): JSONPath queries for transformation
- `OutputFormat` (string, optional): 'object' or 'array' (default: 'object')
- `DefaultValue` (any, optional): Default value for missing paths

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'JSON Transform',
    Params: [
        { Name: 'InputData', Value: { users: [{ name: 'John', age: 30 }] } },
        { Name: 'Transformations', Value: ['name:$.users[0].name', 'age:$.users[0].age'] }
    ],
    ContextUser: currentUser
});
```

#### XML Parser Action

Parses XML data into JSON format with namespace support.

**Class:** `XMLParserAction`  
**Registration Name:** `"XML Parser"`

**Parameters:**
- `XMLData` (string, required): The XML data to parse
- `RemoveNamespaces` (boolean, optional): Strip namespace prefixes (default: false)
- `ParseNumbers` (boolean, optional): Convert numeric strings to numbers (default: true)
- `ParseBooleans` (boolean, optional): Convert boolean strings to booleans (default: true)
- `AttributePrefix` (string, optional): Prefix for attributes (default: '@')

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'XML Parser',
    Params: [
        { Name: 'XMLData', Value: '<root><user id="1"><name>John</name></user></root>' },
        { Name: 'ParseNumbers', Value: true }
    ],
    ContextUser: currentUser
});
```

#### Aggregate Data Action

Performs aggregation operations on arrays of data with support for multiple aggregation functions.

**Class:** `AggregateDataAction`  
**Registration Name:** `"Aggregate Data"`

**Parameters:**
- `Data` (array, required): Array of objects to aggregate
- `GroupBy` (string/array, optional): Field(s) to group by
- `Aggregations` (object/string, required): Aggregation operations (sum, avg, count, min, max)
- `Having` (object, optional): Filter conditions on aggregated results

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Aggregate Data',
    Params: [
        { Name: 'Data', Value: [{ category: 'A', value: 10 }, { category: 'A', value: 20 }] },
        { Name: 'GroupBy', Value: 'category' },
        { Name: 'Aggregations', Value: { totalValue: 'sum:value', avgValue: 'avg:value' } }
    ],
    ContextUser: currentUser
});
```

#### Data Mapper Action

Maps data from one structure to another using field mappings and transformations.

**Class:** `DataMapperAction`  
**Registration Name:** `"Data Mapper"`

**Parameters:**
- `SourceData` (object/array, required): Data to map
- `Mappings` (object/string, required): Field mapping configuration
- `DefaultValues` (object, optional): Default values for missing fields
- `RemoveUnmapped` (boolean, optional): Remove fields not in mapping (default: false)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Data Mapper',
    Params: [
        { Name: 'SourceData', Value: { firstName: 'John', lastName: 'Doe' } },
        { Name: 'Mappings', Value: { fullName: '{{firstName}} {{lastName}}' } }
    ],
    ContextUser: currentUser
});
```

### 6. File Operations Actions

#### PDF Generator Action

Generates PDF documents from HTML or markdown content.

**Class:** `PDFGeneratorAction`  
**Registration Name:** `"PDF Generator"`

**Parameters:**
- `Content` (string, required): HTML or markdown content
- `ContentType` (string, optional): 'html' or 'markdown' (default: 'html')
- `Options` (object/string, optional): PDF options (margins, orientation, etc.)
- `FileName` (string, optional): Output filename

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'PDF Generator',
    Params: [
        { Name: 'Content', Value: '<h1>Report</h1><p>Content here</p>' },
        { Name: 'Options', Value: { margin: { top: '1in' }, orientation: 'portrait' } }
    ],
    ContextUser: currentUser
});
```

#### PDF Extractor Action

Extracts text and metadata from PDF files.

**Class:** `PDFExtractorAction`  
**Registration Name:** `"PDF Extractor"`

**Parameters:**
- `PDFData` (Buffer/string, required): PDF file data or base64 string
- `ExtractText` (boolean, optional): Extract text content (default: true)
- `ExtractMetadata` (boolean, optional): Extract document metadata (default: true)
- `PageRange` (string, optional): Pages to extract (e.g., '1-5,7,9-10')

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'PDF Extractor',
    Params: [
        { Name: 'PDFData', Value: pdfBuffer },
        { Name: 'PageRange', Value: '1-10' }
    ],
    ContextUser: currentUser
});
```

#### Excel Reader Action

Reads data from Excel files with support for multiple sheets.

**Class:** `ExcelReaderAction`  
**Registration Name:** `"Excel Reader"`

**Parameters:**
- `ExcelData` (Buffer/string, required): Excel file data or base64 string
- `SheetName` (string, optional): Specific sheet to read
- `Range` (string, optional): Cell range to read (e.g., 'A1:D10')
- `ParseDates` (boolean, optional): Convert Excel dates (default: true)
- `IncludeEmptyRows` (boolean, optional): Include empty rows (default: false)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Excel Reader',
    Params: [
        { Name: 'ExcelData', Value: excelBuffer },
        { Name: 'SheetName', Value: 'Sales Data' }
    ],
    ContextUser: currentUser
});
```

#### Excel Writer Action

Creates Excel files from data with formatting options.

**Class:** `ExcelWriterAction`  
**Registration Name:** `"Excel Writer"`

**Parameters:**
- `Data` (array/object, required): Data to write (array of objects or sheets config)
- `SheetName` (string, optional): Sheet name (default: 'Sheet1')
- `IncludeHeaders` (boolean, optional): Include column headers (default: true)
- `ColumnWidths` (object, optional): Custom column widths
- `Formatting` (object/string, optional): Cell formatting rules

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Excel Writer',
    Params: [
        { Name: 'Data', Value: [{ name: 'John', sales: 1000 }, { name: 'Jane', sales: 1500 }] },
        { Name: 'SheetName', Value: 'Sales Report' }
    ],
    ContextUser: currentUser
});
```

#### File Compress Action

Compresses files into ZIP archives.

**Class:** `FileCompressAction`  
**Registration Name:** `"File Compress"`

**Parameters:**
- `Files` (array, required): Array of file objects with name and content
- `CompressionLevel` (number, optional): Compression level 0-9 (default: 6)
- `ArchiveName` (string, optional): Output archive name
- `Password` (string, optional): Password protection for archive

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'File Compress',
    Params: [
        { Name: 'Files', Value: [
            { name: 'report.txt', content: 'Report content' },
            { name: 'data.json', content: JSON.stringify(data) }
        ]},
        { Name: 'ArchiveName', Value: 'backup.zip' }
    ],
    ContextUser: currentUser
});
```

### 7. Integration Actions

#### HTTP Request Action

Makes HTTP requests with full control over headers, body, and authentication.

**Class:** `HTTPRequestAction`  
**Registration Name:** `"HTTP Request"`

**Parameters:**
- `URL` (string, required): Request URL
- `Method` (string, optional): HTTP method (default: 'GET')
- `Headers` (object/string, optional): Request headers
- `Body` (any, optional): Request body
- `Timeout` (number, optional): Request timeout in ms (default: 30000)
- `RetryCount` (number, optional): Number of retries (default: 0)
- `BasicAuth` (object, optional): Basic authentication credentials

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'HTTP Request',
    Params: [
        { Name: 'URL', Value: 'https://api.example.com/data' },
        { Name: 'Method', Value: 'POST' },
        { Name: 'Headers', Value: { 'Content-Type': 'application/json' } },
        { Name: 'Body', Value: { query: 'test' } }
    ],
    ContextUser: currentUser
});
```

#### GraphQL Query Action

Executes GraphQL queries and mutations with variable support.

**Class:** `GraphQLQueryAction`  
**Registration Name:** `"GraphQL Query"`

**Parameters:**
- `Endpoint` (string, required): GraphQL endpoint URL
- `Query` (string, required): GraphQL query or mutation
- `Variables` (object/string, optional): Query variables
- `Headers` (object/string, optional): Request headers
- `OperationName` (string, optional): Operation name for multi-operation documents

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'GraphQL Query',
    Params: [
        { Name: 'Endpoint', Value: 'https://api.example.com/graphql' },
        { Name: 'Query', Value: 'query GetUser($id: ID!) { user(id: $id) { name email } }' },
        { Name: 'Variables', Value: { id: '123' } }
    ],
    ContextUser: currentUser
});
```

#### OAuth Flow Action

Handles OAuth 2.0 authentication flows.

**Class:** `OAuthFlowAction`  
**Registration Name:** `"OAuth Flow"`

**Parameters:**
- `Provider` (string, required): OAuth provider name
- `ClientID` (string, required): OAuth client ID
- `ClientSecret` (string, required): OAuth client secret
- `RedirectURI` (string, required): Redirect URI
- `Scopes` (string/array, optional): Required scopes
- `State` (string, optional): State parameter for security

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'OAuth Flow',
    Params: [
        { Name: 'Provider', Value: 'google' },
        { Name: 'ClientID', Value: 'your-client-id' },
        { Name: 'ClientSecret', Value: 'your-client-secret' },
        { Name: 'RedirectURI', Value: 'https://app.example.com/callback' },
        { Name: 'Scopes', Value: ['email', 'profile'] }
    ],
    ContextUser: currentUser
});
```

#### API Rate Limiter Action

Manages API rate limiting with queuing and backoff strategies.

**Class:** `APIRateLimiterAction`  
**Registration Name:** `"API Rate Limiter"`

**Parameters:**
- `APIName` (string, required): API identifier
- `RequestsPerWindow` (number, required): Max requests per time window
- `WindowSizeMs` (number, optional): Time window in ms (default: 60000)
- `QueueRequests` (boolean, optional): Queue excess requests (default: true)
- `MaxQueueSize` (number, optional): Maximum queue size (default: 100)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'API Rate Limiter',
    Params: [
        { Name: 'APIName', Value: 'external-api' },
        { Name: 'RequestsPerWindow', Value: 100 },
        { Name: 'WindowSizeMs', Value: 60000 }
    ],
    ContextUser: currentUser
});
```

### 8. Security Actions

#### Password Strength Action

Evaluates password strength and provides improvement suggestions.

**Class:** `PasswordStrengthAction`  
**Registration Name:** `"Password Strength"`

**Parameters:**
- `Password` (string, required): Password to evaluate
- `MinLength` (number, optional): Minimum required length (default: 8)
- `RequireUppercase` (boolean, optional): Require uppercase letters (default: true)
- `RequireLowercase` (boolean, optional): Require lowercase letters (default: true)
- `RequireNumbers` (boolean, optional): Require numbers (default: true)
- `RequireSpecial` (boolean, optional): Require special characters (default: true)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Password Strength',
    Params: [
        { Name: 'Password', Value: 'MyP@ssw0rd' },
        { Name: 'MinLength', Value: 12 }
    ],
    ContextUser: currentUser
});
```

### 9. Workflow Control Actions

#### Conditional Action

Executes actions based on conditional logic.

**Class:** `ConditionalAction`  
**Registration Name:** `"Conditional"`

**Parameters:**
- `Condition` (string, required): JavaScript expression to evaluate
- `ThenAction` (object, required): Action to run if condition is true
- `ElseAction` (object, optional): Action to run if condition is false
- `Context` (object, optional): Variables available in condition

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Conditional',
    Params: [
        { Name: 'Condition', Value: 'value > 100' },
        { Name: 'Context', Value: { value: 150 } },
        { Name: 'ThenAction', Value: { name: 'Send Email', params: {...} } }
    ],
    ContextUser: currentUser
});
```

#### Loop Action

Executes actions repeatedly with iteration support.

**Class:** `LoopAction`  
**Registration Name:** `"Loop"`

**Parameters:**
- `Items` (array, optional): Array to iterate over
- `Count` (number, optional): Number of iterations (if no items)
- `Action` (object, required): Action to execute for each iteration
- `Parallel` (boolean, optional): Run iterations in parallel (default: false)
- `MaxConcurrency` (number, optional): Max parallel executions (default: 10)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Loop',
    Params: [
        { Name: 'Items', Value: [1, 2, 3, 4, 5] },
        { Name: 'Action', Value: { name: 'Process Item', params: {...} } },
        { Name: 'Parallel', Value: true }
    ],
    ContextUser: currentUser
});
```

#### Parallel Execute Action

Runs multiple actions concurrently with result aggregation.

**Class:** `ParallelExecuteAction`  
**Registration Name:** `"Parallel Execute"`

**Parameters:**
- `Actions` (array, required): Array of actions to execute
- `MaxConcurrency` (number, optional): Maximum concurrent executions (default: 10)
- `StopOnError` (boolean, optional): Stop all if one fails (default: false)
- `Timeout` (number, optional): Overall timeout in ms

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Parallel Execute',
    Params: [
        { Name: 'Actions', Value: [
            { name: 'Web Search', params: { SearchTerms: 'AI' } },
            { name: 'HTTP Request', params: { URL: 'https://api.example.com' } }
        ]},
        { Name: 'MaxConcurrency', Value: 2 }
    ],
    ContextUser: currentUser
});
```

#### Retry Action

Retries failed actions with configurable backoff strategies.

**Class:** `RetryAction`  
**Registration Name:** `"Retry"`

**Parameters:**
- `Action` (object, required): Action to retry
- `MaxRetries` (number, optional): Maximum retry attempts (default: 3)
- `InitialDelay` (number, optional): Initial delay in ms (default: 1000)
- `BackoffMultiplier` (number, optional): Delay multiplier (default: 2)
- `MaxDelay` (number, optional): Maximum delay in ms (default: 30000)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Retry',
    Params: [
        { Name: 'Action', Value: { name: 'HTTP Request', params: {...} } },
        { Name: 'MaxRetries', Value: 5 },
        { Name: 'InitialDelay', Value: 2000 }
    ],
    ContextUser: currentUser
});
```

#### Delay Action

Introduces delays in workflow execution.

**Class:** `DelayAction`  
**Registration Name:** `"Delay"`

**Parameters:**
- `DelayMs` (number, required): Delay duration in milliseconds
- `Jitter` (number, optional): Random jitter to add (0-1, percentage of delay)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Delay',
    Params: [
        { Name: 'DelayMs', Value: 5000 },
        { Name: 'Jitter', Value: 0.1 } // 10% jitter
    ],
    ContextUser: currentUser
});
```

### 10. Communication Actions

#### Slack Webhook Action

Sends messages to Slack channels via webhooks.

**Class:** `SlackWebhookAction`  
**Registration Name:** `"Slack Webhook"`

**Parameters:**
- `WebhookURL` (string, required): Slack webhook URL
- `Message` (string, required): Message text
- `Channel` (string, optional): Override default channel
- `Username` (string, optional): Override default username
- `IconEmoji` (string, optional): Override default icon
- `Attachments` (array/string, optional): Rich message attachments

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Slack Webhook',
    Params: [
        { Name: 'WebhookURL', Value: 'https://hooks.slack.com/services/...' },
        { Name: 'Message', Value: 'Deployment completed successfully!' },
        { Name: 'IconEmoji', Value: ':rocket:' }
    ],
    ContextUser: currentUser
});
```

#### Teams Webhook Action

Sends messages to Microsoft Teams channels via webhooks.

**Class:** `TeamsWebhookAction`  
**Registration Name:** `"Teams Webhook"`

**Parameters:**
- `WebhookURL` (string, required): Teams webhook URL
- `Title` (string, optional): Message title
- `Text` (string, required): Message text
- `ThemeColor` (string, optional): Message accent color
- `Sections` (array/string, optional): Message sections
- `Actions` (array/string, optional): Interactive actions

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Teams Webhook',
    Params: [
        { Name: 'WebhookURL', Value: 'https://outlook.office.com/webhook/...' },
        { Name: 'Title', Value: 'Build Status' },
        { Name: 'Text', Value: 'Build #123 completed successfully' },
        { Name: 'ThemeColor', Value: '00FF00' }
    ],
    ContextUser: currentUser
});
```

### 11. AI Actions

#### Execute AI Prompt Action

Executes AI prompts using MemberJunction's AI framework with model selection and parameter control.

**Class:** `ExecuteAIPromptAction`  
**Registration Name:** `"Execute AI Prompt"`

**Parameters:**
- `PromptID` (string, optional): ID of saved prompt template
- `PromptName` (string, optional): Name of saved prompt template
- `PromptText` (string, optional): Direct prompt text (if not using template)
- `ModelID` (string, optional): Specific AI model ID to use
- `ModelName` (string, optional): Specific AI model name to use
- `Temperature` (number, optional): Model temperature (0-2)
- `MaxTokens` (number, optional): Maximum response tokens
- `Variables` (object/string, optional): Variables to inject into prompt template

**Example Usage:**

```typescript
// Using a saved prompt template
const templateResult = await ActionEngine.RunAction({
    ActionName: 'Execute AI Prompt',
    Params: [
        { Name: 'PromptName', Value: 'Summarize Text' },
        { Name: 'Variables', Value: { text: 'Long article text here...' } },
        { Name: 'Temperature', Value: 0.7 }
    ],
    ContextUser: currentUser
});

// Using direct prompt text
const directResult = await ActionEngine.RunAction({
    ActionName: 'Execute AI Prompt',
    Params: [
        { Name: 'PromptText', Value: 'Explain quantum computing in simple terms' },
        { Name: 'ModelName', Value: 'gpt-4' },
        { Name: 'MaxTokens', Value: 500 }
    ],
    ContextUser: currentUser
});
```

## Special Features

### Dual JSON Parameter Support

Many actions support both JSON object and string inputs for flexibility:
- **JSON Object**: Pass JavaScript objects directly
- **JSON String**: Pass stringified JSON for dynamic content

This applies to actions like JSON Transform, HTTP Request, GraphQL Query, and others with object parameters.

### Error Handling and Recovery

Actions implement various error handling strategies:
- **Graceful Degradation**: Actions continue with partial results when possible
- **Detailed Error Messages**: Clear explanations of what went wrong
- **Retry Logic**: Built-in retry mechanisms for transient failures
- **Validation**: Input validation with helpful error messages

### Performance Considerations

- **Streaming Support**: Large file operations use streaming when possible
- **Batch Processing**: Actions process data in chunks for memory efficiency
- **Parallel Execution**: Workflow actions support concurrent processing
- **Resource Management**: Proper cleanup of resources after execution

```typescript
import { ActionEngine } from '@memberjunction/actions';

// The actions are automatically registered when the module is loaded
const result = await ActionEngine.RunAction({
    ActionName: 'Action Name Here',
    Params: [...],
    ContextUser: user
});
```

### 5. Data Transformation Actions

#### CSV Parser Action

Parses CSV data with configurable options for headers, delimiters, and data types.

**Class:** `CSVParserAction`  
**Registration Name:** `"CSV Parser"`

**Parameters:**
- `CSVData` (string, required): The CSV data to parse
- `HasHeaders` (boolean, optional): Whether the first row contains headers (default: true)
- `Delimiter` (string, optional): Field delimiter (default: ',')
- `QuoteCharacter` (string, optional): Quote character for escaping (default: '"')
- `SkipEmptyRows` (boolean, optional): Skip empty rows (default: true)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'CSV Parser',
    Params: [
        { Name: 'CSVData', Value: 'Name,Age,City\nJohn,30,NYC\nJane,25,LA' },
        { Name: 'HasHeaders', Value: true }
    ],
    ContextUser: currentUser
});
```

#### JSON Transform Action

Transforms JSON data using JSONPath-style queries with multiple operations support.

**Class:** `JSONTransformAction`  
**Registration Name:** `"JSON Transform"`

**Parameters:**
- `InputData` (object/string, required): JSON data to transform (supports both JSON object and string)
- `Transformations` (string/array, required): JSONPath queries for transformation
- `OutputFormat` (string, optional): 'object' or 'array' (default: 'object')
- `DefaultValue` (any, optional): Default value for missing paths

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'JSON Transform',
    Params: [
        { Name: 'InputData', Value: { users: [{ name: 'John', age: 30 }] } },
        { Name: 'Transformations', Value: ['name:$.users[0].name', 'age:$.users[0].age'] }
    ],
    ContextUser: currentUser
});
```

#### XML Parser Action

Parses XML data into JSON format with namespace support.

**Class:** `XMLParserAction`  
**Registration Name:** `"XML Parser"`

**Parameters:**
- `XMLData` (string, required): The XML data to parse
- `RemoveNamespaces` (boolean, optional): Strip namespace prefixes (default: false)
- `ParseNumbers` (boolean, optional): Convert numeric strings to numbers (default: true)
- `ParseBooleans` (boolean, optional): Convert boolean strings to booleans (default: true)
- `AttributePrefix` (string, optional): Prefix for attributes (default: '@')

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'XML Parser',
    Params: [
        { Name: 'XMLData', Value: '<root><user id="1"><name>John</name></user></root>' },
        { Name: 'ParseNumbers', Value: true }
    ],
    ContextUser: currentUser
});
```

#### Aggregate Data Action

Performs aggregation operations on arrays of data with support for multiple aggregation functions.

**Class:** `AggregateDataAction`  
**Registration Name:** `"Aggregate Data"`

**Parameters:**
- `Data` (array, required): Array of objects to aggregate
- `GroupBy` (string/array, optional): Field(s) to group by
- `Aggregations` (object/string, required): Aggregation operations (sum, avg, count, min, max)
- `Having` (object, optional): Filter conditions on aggregated results

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Aggregate Data',
    Params: [
        { Name: 'Data', Value: [{ category: 'A', value: 10 }, { category: 'A', value: 20 }] },
        { Name: 'GroupBy', Value: 'category' },
        { Name: 'Aggregations', Value: { totalValue: 'sum:value', avgValue: 'avg:value' } }
    ],
    ContextUser: currentUser
});
```

#### Data Mapper Action

Maps data from one structure to another using field mappings and transformations.

**Class:** `DataMapperAction`  
**Registration Name:** `"Data Mapper"`

**Parameters:**
- `SourceData` (object/array, required): Data to map
- `Mappings` (object/string, required): Field mapping configuration
- `DefaultValues` (object, optional): Default values for missing fields
- `RemoveUnmapped` (boolean, optional): Remove fields not in mapping (default: false)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Data Mapper',
    Params: [
        { Name: 'SourceData', Value: { firstName: 'John', lastName: 'Doe' } },
        { Name: 'Mappings', Value: { fullName: '{{firstName}} {{lastName}}' } }
    ],
    ContextUser: currentUser
});
```

### 6. File Operations Actions

#### PDF Generator Action

Generates PDF documents from HTML or markdown content.

**Class:** `PDFGeneratorAction`  
**Registration Name:** `"PDF Generator"`

**Parameters:**
- `Content` (string, required): HTML or markdown content
- `ContentType` (string, optional): 'html' or 'markdown' (default: 'html')
- `Options` (object/string, optional): PDF options (margins, orientation, etc.)
- `FileName` (string, optional): Output filename

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'PDF Generator',
    Params: [
        { Name: 'Content', Value: '<h1>Report</h1><p>Content here</p>' },
        { Name: 'Options', Value: { margin: { top: '1in' }, orientation: 'portrait' } }
    ],
    ContextUser: currentUser
});
```

#### PDF Extractor Action

Extracts text and metadata from PDF files.

**Class:** `PDFExtractorAction`  
**Registration Name:** `"PDF Extractor"`

**Parameters:**
- `PDFData` (Buffer/string, required): PDF file data or base64 string
- `ExtractText` (boolean, optional): Extract text content (default: true)
- `ExtractMetadata` (boolean, optional): Extract document metadata (default: true)
- `PageRange` (string, optional): Pages to extract (e.g., '1-5,7,9-10')

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'PDF Extractor',
    Params: [
        { Name: 'PDFData', Value: pdfBuffer },
        { Name: 'PageRange', Value: '1-10' }
    ],
    ContextUser: currentUser
});
```

#### Excel Reader Action

Reads data from Excel files with support for multiple sheets.

**Class:** `ExcelReaderAction`  
**Registration Name:** `"Excel Reader"`

**Parameters:**
- `ExcelData` (Buffer/string, required): Excel file data or base64 string
- `SheetName` (string, optional): Specific sheet to read
- `Range` (string, optional): Cell range to read (e.g., 'A1:D10')
- `ParseDates` (boolean, optional): Convert Excel dates (default: true)
- `IncludeEmptyRows` (boolean, optional): Include empty rows (default: false)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Excel Reader',
    Params: [
        { Name: 'ExcelData', Value: excelBuffer },
        { Name: 'SheetName', Value: 'Sales Data' }
    ],
    ContextUser: currentUser
});
```

#### Excel Writer Action

Creates Excel files from data with formatting options.

**Class:** `ExcelWriterAction`  
**Registration Name:** `"Excel Writer"`

**Parameters:**
- `Data` (array/object, required): Data to write (array of objects or sheets config)
- `SheetName` (string, optional): Sheet name (default: 'Sheet1')
- `IncludeHeaders` (boolean, optional): Include column headers (default: true)
- `ColumnWidths` (object, optional): Custom column widths
- `Formatting` (object/string, optional): Cell formatting rules

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Excel Writer',
    Params: [
        { Name: 'Data', Value: [{ name: 'John', sales: 1000 }, { name: 'Jane', sales: 1500 }] },
        { Name: 'SheetName', Value: 'Sales Report' }
    ],
    ContextUser: currentUser
});
```

#### File Compress Action

Compresses files into ZIP archives.

**Class:** `FileCompressAction`  
**Registration Name:** `"File Compress"`

**Parameters:**
- `Files` (array, required): Array of file objects with name and content
- `CompressionLevel` (number, optional): Compression level 0-9 (default: 6)
- `ArchiveName` (string, optional): Output archive name
- `Password` (string, optional): Password protection for archive

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'File Compress',
    Params: [
        { Name: 'Files', Value: [
            { name: 'report.txt', content: 'Report content' },
            { name: 'data.json', content: JSON.stringify(data) }
        ]},
        { Name: 'ArchiveName', Value: 'backup.zip' }
    ],
    ContextUser: currentUser
});
```

### 7. Integration Actions

#### HTTP Request Action

Makes HTTP requests with full control over headers, body, and authentication.

**Class:** `HTTPRequestAction`  
**Registration Name:** `"HTTP Request"`

**Parameters:**
- `URL` (string, required): Request URL
- `Method` (string, optional): HTTP method (default: 'GET')
- `Headers` (object/string, optional): Request headers
- `Body` (any, optional): Request body
- `Timeout` (number, optional): Request timeout in ms (default: 30000)
- `RetryCount` (number, optional): Number of retries (default: 0)
- `BasicAuth` (object, optional): Basic authentication credentials

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'HTTP Request',
    Params: [
        { Name: 'URL', Value: 'https://api.example.com/data' },
        { Name: 'Method', Value: 'POST' },
        { Name: 'Headers', Value: { 'Content-Type': 'application/json' } },
        { Name: 'Body', Value: { query: 'test' } }
    ],
    ContextUser: currentUser
});
```

#### GraphQL Query Action

Executes GraphQL queries and mutations with variable support.

**Class:** `GraphQLQueryAction`  
**Registration Name:** `"GraphQL Query"`

**Parameters:**
- `Endpoint` (string, required): GraphQL endpoint URL
- `Query` (string, required): GraphQL query or mutation
- `Variables` (object/string, optional): Query variables
- `Headers` (object/string, optional): Request headers
- `OperationName` (string, optional): Operation name for multi-operation documents

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'GraphQL Query',
    Params: [
        { Name: 'Endpoint', Value: 'https://api.example.com/graphql' },
        { Name: 'Query', Value: 'query GetUser($id: ID!) { user(id: $id) { name email } }' },
        { Name: 'Variables', Value: { id: '123' } }
    ],
    ContextUser: currentUser
});
```

#### OAuth Flow Action

Handles OAuth 2.0 authentication flows.

**Class:** `OAuthFlowAction`  
**Registration Name:** `"OAuth Flow"`

**Parameters:**
- `Provider` (string, required): OAuth provider name
- `ClientID` (string, required): OAuth client ID
- `ClientSecret` (string, required): OAuth client secret
- `RedirectURI` (string, required): Redirect URI
- `Scopes` (string/array, optional): Required scopes
- `State` (string, optional): State parameter for security

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'OAuth Flow',
    Params: [
        { Name: 'Provider', Value: 'google' },
        { Name: 'ClientID', Value: 'your-client-id' },
        { Name: 'ClientSecret', Value: 'your-client-secret' },
        { Name: 'RedirectURI', Value: 'https://app.example.com/callback' },
        { Name: 'Scopes', Value: ['email', 'profile'] }
    ],
    ContextUser: currentUser
});
```

#### API Rate Limiter Action

Manages API rate limiting with queuing and backoff strategies.

**Class:** `APIRateLimiterAction`  
**Registration Name:** `"API Rate Limiter"`

**Parameters:**
- `APIName` (string, required): API identifier
- `RequestsPerWindow` (number, required): Max requests per time window
- `WindowSizeMs` (number, optional): Time window in ms (default: 60000)
- `QueueRequests` (boolean, optional): Queue excess requests (default: true)
- `MaxQueueSize` (number, optional): Maximum queue size (default: 100)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'API Rate Limiter',
    Params: [
        { Name: 'APIName', Value: 'external-api' },
        { Name: 'RequestsPerWindow', Value: 100 },
        { Name: 'WindowSizeMs', Value: 60000 }
    ],
    ContextUser: currentUser
});
```

### 8. Security Actions

#### Password Strength Action

Evaluates password strength and provides improvement suggestions.

**Class:** `PasswordStrengthAction`  
**Registration Name:** `"Password Strength"`

**Parameters:**
- `Password` (string, required): Password to evaluate
- `MinLength` (number, optional): Minimum required length (default: 8)
- `RequireUppercase` (boolean, optional): Require uppercase letters (default: true)
- `RequireLowercase` (boolean, optional): Require lowercase letters (default: true)
- `RequireNumbers` (boolean, optional): Require numbers (default: true)
- `RequireSpecial` (boolean, optional): Require special characters (default: true)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Password Strength',
    Params: [
        { Name: 'Password', Value: 'MyP@ssw0rd' },
        { Name: 'MinLength', Value: 12 }
    ],
    ContextUser: currentUser
});
```

### 9. Workflow Control Actions

#### Conditional Action

Executes actions based on conditional logic.

**Class:** `ConditionalAction`  
**Registration Name:** `"Conditional"`

**Parameters:**
- `Condition` (string, required): JavaScript expression to evaluate
- `ThenAction` (object, required): Action to run if condition is true
- `ElseAction` (object, optional): Action to run if condition is false
- `Context` (object, optional): Variables available in condition

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Conditional',
    Params: [
        { Name: 'Condition', Value: 'value > 100' },
        { Name: 'Context', Value: { value: 150 } },
        { Name: 'ThenAction', Value: { name: 'Send Email', params: {...} } }
    ],
    ContextUser: currentUser
});
```

#### Loop Action

Executes actions repeatedly with iteration support.

**Class:** `LoopAction`  
**Registration Name:** `"Loop"`

**Parameters:**
- `Items` (array, optional): Array to iterate over
- `Count` (number, optional): Number of iterations (if no items)
- `Action` (object, required): Action to execute for each iteration
- `Parallel` (boolean, optional): Run iterations in parallel (default: false)
- `MaxConcurrency` (number, optional): Max parallel executions (default: 10)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Loop',
    Params: [
        { Name: 'Items', Value: [1, 2, 3, 4, 5] },
        { Name: 'Action', Value: { name: 'Process Item', params: {...} } },
        { Name: 'Parallel', Value: true }
    ],
    ContextUser: currentUser
});
```

#### Parallel Execute Action

Runs multiple actions concurrently with result aggregation.

**Class:** `ParallelExecuteAction`  
**Registration Name:** `"Parallel Execute"`

**Parameters:**
- `Actions` (array, required): Array of actions to execute
- `MaxConcurrency` (number, optional): Maximum concurrent executions (default: 10)
- `StopOnError` (boolean, optional): Stop all if one fails (default: false)
- `Timeout` (number, optional): Overall timeout in ms

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Parallel Execute',
    Params: [
        { Name: 'Actions', Value: [
            { name: 'Web Search', params: { SearchTerms: 'AI' } },
            { name: 'HTTP Request', params: { URL: 'https://api.example.com' } }
        ]},
        { Name: 'MaxConcurrency', Value: 2 }
    ],
    ContextUser: currentUser
});
```

#### Retry Action

Retries failed actions with configurable backoff strategies.

**Class:** `RetryAction`  
**Registration Name:** `"Retry"`

**Parameters:**
- `Action` (object, required): Action to retry
- `MaxRetries` (number, optional): Maximum retry attempts (default: 3)
- `InitialDelay` (number, optional): Initial delay in ms (default: 1000)
- `BackoffMultiplier` (number, optional): Delay multiplier (default: 2)
- `MaxDelay` (number, optional): Maximum delay in ms (default: 30000)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Retry',
    Params: [
        { Name: 'Action', Value: { name: 'HTTP Request', params: {...} } },
        { Name: 'MaxRetries', Value: 5 },
        { Name: 'InitialDelay', Value: 2000 }
    ],
    ContextUser: currentUser
});
```

#### Delay Action

Introduces delays in workflow execution.

**Class:** `DelayAction`  
**Registration Name:** `"Delay"`

**Parameters:**
- `DelayMs` (number, required): Delay duration in milliseconds
- `Jitter` (number, optional): Random jitter to add (0-1, percentage of delay)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Delay',
    Params: [
        { Name: 'DelayMs', Value: 5000 },
        { Name: 'Jitter', Value: 0.1 } // 10% jitter
    ],
    ContextUser: currentUser
});
```

### 10. Communication Actions

#### Slack Webhook Action

Sends messages to Slack channels via webhooks.

**Class:** `SlackWebhookAction`  
**Registration Name:** `"Slack Webhook"`

**Parameters:**
- `WebhookURL` (string, required): Slack webhook URL
- `Message` (string, required): Message text
- `Channel` (string, optional): Override default channel
- `Username` (string, optional): Override default username
- `IconEmoji` (string, optional): Override default icon
- `Attachments` (array/string, optional): Rich message attachments

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Slack Webhook',
    Params: [
        { Name: 'WebhookURL', Value: 'https://hooks.slack.com/services/...' },
        { Name: 'Message', Value: 'Deployment completed successfully!' },
        { Name: 'IconEmoji', Value: ':rocket:' }
    ],
    ContextUser: currentUser
});
```

#### Teams Webhook Action

Sends messages to Microsoft Teams channels via webhooks.

**Class:** `TeamsWebhookAction`  
**Registration Name:** `"Teams Webhook"`

**Parameters:**
- `WebhookURL` (string, required): Teams webhook URL
- `Title` (string, optional): Message title
- `Text` (string, required): Message text
- `ThemeColor` (string, optional): Message accent color
- `Sections` (array/string, optional): Message sections
- `Actions` (array/string, optional): Interactive actions

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Teams Webhook',
    Params: [
        { Name: 'WebhookURL', Value: 'https://outlook.office.com/webhook/...' },
        { Name: 'Title', Value: 'Build Status' },
        { Name: 'Text', Value: 'Build #123 completed successfully' },
        { Name: 'ThemeColor', Value: '00FF00' }
    ],
    ContextUser: currentUser
});
```

### 11. AI Actions

#### Execute AI Prompt Action

Executes AI prompts using MemberJunction's AI framework with model selection and parameter control.

**Class:** `ExecuteAIPromptAction`  
**Registration Name:** `"Execute AI Prompt"`

**Parameters:**
- `PromptID` (string, optional): ID of saved prompt template
- `PromptName` (string, optional): Name of saved prompt template
- `PromptText` (string, optional): Direct prompt text (if not using template)
- `ModelID` (string, optional): Specific AI model ID to use
- `ModelName` (string, optional): Specific AI model name to use
- `Temperature` (number, optional): Model temperature (0-2)
- `MaxTokens` (number, optional): Maximum response tokens
- `Variables` (object/string, optional): Variables to inject into prompt template

**Example Usage:**

```typescript
// Using a saved prompt template
const templateResult = await ActionEngine.RunAction({
    ActionName: 'Execute AI Prompt',
    Params: [
        { Name: 'PromptName', Value: 'Summarize Text' },
        { Name: 'Variables', Value: { text: 'Long article text here...' } },
        { Name: 'Temperature', Value: 0.7 }
    ],
    ContextUser: currentUser
});

// Using direct prompt text
const directResult = await ActionEngine.RunAction({
    ActionName: 'Execute AI Prompt',
    Params: [
        { Name: 'PromptText', Value: 'Explain quantum computing in simple terms' },
        { Name: 'ModelName', Value: 'gpt-4' },
        { Name: 'MaxTokens', Value: 500 }
    ],
    ContextUser: currentUser
});
```

## Special Features

### Dual JSON Parameter Support

Many actions support both JSON object and string inputs for flexibility:
- **JSON Object**: Pass JavaScript objects directly
- **JSON String**: Pass stringified JSON for dynamic content

This applies to actions like JSON Transform, HTTP Request, GraphQL Query, and others with object parameters.

### Error Handling and Recovery

Actions implement various error handling strategies:
- **Graceful Degradation**: Actions continue with partial results when possible
- **Detailed Error Messages**: Clear explanations of what went wrong
- **Retry Logic**: Built-in retry mechanisms for transient failures
- **Validation**: Input validation with helpful error messages

### Performance Considerations

- **Streaming Support**: Large file operations use streaming when possible
- **Batch Processing**: Actions process data in chunks for memory efficiency
- **Parallel Execution**: Workflow actions support concurrent processing
- **Resource Management**: Proper cleanup of resources after execution

```

## Dependencies

This package depends on several core MemberJunction packages:

- `@memberjunction/global` - Global utilities and class registration
- `@memberjunction/core` - Core MemberJunction functionality
- `@memberjunction/core-entities` - Entity definitions
- `@memberjunction/actions` - Base action framework
- `@memberjunction/communication-engine` - Communication framework
- `@memberjunction/external-change-detection` - Change detection engine
- `@memberjunction/ai-vector-sync` - AI vectorization functionality
- `@memberjunction/content-autotagging` - Content tagging capabilities
- `@memberjunction/ai` - AI providers and prompt execution

Additional dependencies for the new actions:
- `papaparse` - CSV parsing functionality
- `jsonpath-plus` - JSONPath query support
- `xml2js` - XML parsing capabilities
- `puppeteer` - PDF generation from HTML/markdown
- `pdf-parse` - PDF text extraction
- `xlsx` - Excel file reading and writing
- `archiver` - ZIP file compression
- `axios` - HTTP requests with advanced features
- `zod` - Runtime type validation

## Building and Development

To build this package:

```

### 5. Data Transformation Actions

#### CSV Parser Action

Parses CSV data with configurable options for headers, delimiters, and data types.

**Class:** `CSVParserAction`  
**Registration Name:** `"CSV Parser"`

**Parameters:**
- `CSVData` (string, required): The CSV data to parse
- `HasHeaders` (boolean, optional): Whether the first row contains headers (default: true)
- `Delimiter` (string, optional): Field delimiter (default: ',')
- `QuoteCharacter` (string, optional): Quote character for escaping (default: '"')
- `SkipEmptyRows` (boolean, optional): Skip empty rows (default: true)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'CSV Parser',
    Params: [
        { Name: 'CSVData', Value: 'Name,Age,City\nJohn,30,NYC\nJane,25,LA' },
        { Name: 'HasHeaders', Value: true }
    ],
    ContextUser: currentUser
});
```

#### JSON Transform Action

Transforms JSON data using JSONPath-style queries with multiple operations support.

**Class:** `JSONTransformAction`  
**Registration Name:** `"JSON Transform"`

**Parameters:**
- `InputData` (object/string, required): JSON data to transform (supports both JSON object and string)
- `Transformations` (string/array, required): JSONPath queries for transformation
- `OutputFormat` (string, optional): 'object' or 'array' (default: 'object')
- `DefaultValue` (any, optional): Default value for missing paths

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'JSON Transform',
    Params: [
        { Name: 'InputData', Value: { users: [{ name: 'John', age: 30 }] } },
        { Name: 'Transformations', Value: ['name:$.users[0].name', 'age:$.users[0].age'] }
    ],
    ContextUser: currentUser
});
```

#### XML Parser Action

Parses XML data into JSON format with namespace support.

**Class:** `XMLParserAction`  
**Registration Name:** `"XML Parser"`

**Parameters:**
- `XMLData` (string, required): The XML data to parse
- `RemoveNamespaces` (boolean, optional): Strip namespace prefixes (default: false)
- `ParseNumbers` (boolean, optional): Convert numeric strings to numbers (default: true)
- `ParseBooleans` (boolean, optional): Convert boolean strings to booleans (default: true)
- `AttributePrefix` (string, optional): Prefix for attributes (default: '@')

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'XML Parser',
    Params: [
        { Name: 'XMLData', Value: '<root><user id="1"><name>John</name></user></root>' },
        { Name: 'ParseNumbers', Value: true }
    ],
    ContextUser: currentUser
});
```

#### Aggregate Data Action

Performs aggregation operations on arrays of data with support for multiple aggregation functions.

**Class:** `AggregateDataAction`  
**Registration Name:** `"Aggregate Data"`

**Parameters:**
- `Data` (array, required): Array of objects to aggregate
- `GroupBy` (string/array, optional): Field(s) to group by
- `Aggregations` (object/string, required): Aggregation operations (sum, avg, count, min, max)
- `Having` (object, optional): Filter conditions on aggregated results

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Aggregate Data',
    Params: [
        { Name: 'Data', Value: [{ category: 'A', value: 10 }, { category: 'A', value: 20 }] },
        { Name: 'GroupBy', Value: 'category' },
        { Name: 'Aggregations', Value: { totalValue: 'sum:value', avgValue: 'avg:value' } }
    ],
    ContextUser: currentUser
});
```

#### Data Mapper Action

Maps data from one structure to another using field mappings and transformations.

**Class:** `DataMapperAction`  
**Registration Name:** `"Data Mapper"`

**Parameters:**
- `SourceData` (object/array, required): Data to map
- `Mappings` (object/string, required): Field mapping configuration
- `DefaultValues` (object, optional): Default values for missing fields
- `RemoveUnmapped` (boolean, optional): Remove fields not in mapping (default: false)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Data Mapper',
    Params: [
        { Name: 'SourceData', Value: { firstName: 'John', lastName: 'Doe' } },
        { Name: 'Mappings', Value: { fullName: '{{firstName}} {{lastName}}' } }
    ],
    ContextUser: currentUser
});
```

### 6. File Operations Actions

#### PDF Generator Action

Generates PDF documents from HTML or markdown content.

**Class:** `PDFGeneratorAction`  
**Registration Name:** `"PDF Generator"`

**Parameters:**
- `Content` (string, required): HTML or markdown content
- `ContentType` (string, optional): 'html' or 'markdown' (default: 'html')
- `Options` (object/string, optional): PDF options (margins, orientation, etc.)
- `FileName` (string, optional): Output filename

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'PDF Generator',
    Params: [
        { Name: 'Content', Value: '<h1>Report</h1><p>Content here</p>' },
        { Name: 'Options', Value: { margin: { top: '1in' }, orientation: 'portrait' } }
    ],
    ContextUser: currentUser
});
```

#### PDF Extractor Action

Extracts text and metadata from PDF files.

**Class:** `PDFExtractorAction`  
**Registration Name:** `"PDF Extractor"`

**Parameters:**
- `PDFData` (Buffer/string, required): PDF file data or base64 string
- `ExtractText` (boolean, optional): Extract text content (default: true)
- `ExtractMetadata` (boolean, optional): Extract document metadata (default: true)
- `PageRange` (string, optional): Pages to extract (e.g., '1-5,7,9-10')

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'PDF Extractor',
    Params: [
        { Name: 'PDFData', Value: pdfBuffer },
        { Name: 'PageRange', Value: '1-10' }
    ],
    ContextUser: currentUser
});
```

#### Excel Reader Action

Reads data from Excel files with support for multiple sheets.

**Class:** `ExcelReaderAction`  
**Registration Name:** `"Excel Reader"`

**Parameters:**
- `ExcelData` (Buffer/string, required): Excel file data or base64 string
- `SheetName` (string, optional): Specific sheet to read
- `Range` (string, optional): Cell range to read (e.g., 'A1:D10')
- `ParseDates` (boolean, optional): Convert Excel dates (default: true)
- `IncludeEmptyRows` (boolean, optional): Include empty rows (default: false)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Excel Reader',
    Params: [
        { Name: 'ExcelData', Value: excelBuffer },
        { Name: 'SheetName', Value: 'Sales Data' }
    ],
    ContextUser: currentUser
});
```

#### Excel Writer Action

Creates Excel files from data with formatting options.

**Class:** `ExcelWriterAction`  
**Registration Name:** `"Excel Writer"`

**Parameters:**
- `Data` (array/object, required): Data to write (array of objects or sheets config)
- `SheetName` (string, optional): Sheet name (default: 'Sheet1')
- `IncludeHeaders` (boolean, optional): Include column headers (default: true)
- `ColumnWidths` (object, optional): Custom column widths
- `Formatting` (object/string, optional): Cell formatting rules

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Excel Writer',
    Params: [
        { Name: 'Data', Value: [{ name: 'John', sales: 1000 }, { name: 'Jane', sales: 1500 }] },
        { Name: 'SheetName', Value: 'Sales Report' }
    ],
    ContextUser: currentUser
});
```

#### File Compress Action

Compresses files into ZIP archives.

**Class:** `FileCompressAction`  
**Registration Name:** `"File Compress"`

**Parameters:**
- `Files` (array, required): Array of file objects with name and content
- `CompressionLevel` (number, optional): Compression level 0-9 (default: 6)
- `ArchiveName` (string, optional): Output archive name
- `Password` (string, optional): Password protection for archive

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'File Compress',
    Params: [
        { Name: 'Files', Value: [
            { name: 'report.txt', content: 'Report content' },
            { name: 'data.json', content: JSON.stringify(data) }
        ]},
        { Name: 'ArchiveName', Value: 'backup.zip' }
    ],
    ContextUser: currentUser
});
```

### 7. Integration Actions

#### HTTP Request Action

Makes HTTP requests with full control over headers, body, and authentication.

**Class:** `HTTPRequestAction`  
**Registration Name:** `"HTTP Request"`

**Parameters:**
- `URL` (string, required): Request URL
- `Method` (string, optional): HTTP method (default: 'GET')
- `Headers` (object/string, optional): Request headers
- `Body` (any, optional): Request body
- `Timeout` (number, optional): Request timeout in ms (default: 30000)
- `RetryCount` (number, optional): Number of retries (default: 0)
- `BasicAuth` (object, optional): Basic authentication credentials

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'HTTP Request',
    Params: [
        { Name: 'URL', Value: 'https://api.example.com/data' },
        { Name: 'Method', Value: 'POST' },
        { Name: 'Headers', Value: { 'Content-Type': 'application/json' } },
        { Name: 'Body', Value: { query: 'test' } }
    ],
    ContextUser: currentUser
});
```

#### GraphQL Query Action

Executes GraphQL queries and mutations with variable support.

**Class:** `GraphQLQueryAction`  
**Registration Name:** `"GraphQL Query"`

**Parameters:**
- `Endpoint` (string, required): GraphQL endpoint URL
- `Query` (string, required): GraphQL query or mutation
- `Variables` (object/string, optional): Query variables
- `Headers` (object/string, optional): Request headers
- `OperationName` (string, optional): Operation name for multi-operation documents

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'GraphQL Query',
    Params: [
        { Name: 'Endpoint', Value: 'https://api.example.com/graphql' },
        { Name: 'Query', Value: 'query GetUser($id: ID!) { user(id: $id) { name email } }' },
        { Name: 'Variables', Value: { id: '123' } }
    ],
    ContextUser: currentUser
});
```

#### OAuth Flow Action

Handles OAuth 2.0 authentication flows.

**Class:** `OAuthFlowAction`  
**Registration Name:** `"OAuth Flow"`

**Parameters:**
- `Provider` (string, required): OAuth provider name
- `ClientID` (string, required): OAuth client ID
- `ClientSecret` (string, required): OAuth client secret
- `RedirectURI` (string, required): Redirect URI
- `Scopes` (string/array, optional): Required scopes
- `State` (string, optional): State parameter for security

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'OAuth Flow',
    Params: [
        { Name: 'Provider', Value: 'google' },
        { Name: 'ClientID', Value: 'your-client-id' },
        { Name: 'ClientSecret', Value: 'your-client-secret' },
        { Name: 'RedirectURI', Value: 'https://app.example.com/callback' },
        { Name: 'Scopes', Value: ['email', 'profile'] }
    ],
    ContextUser: currentUser
});
```

#### API Rate Limiter Action

Manages API rate limiting with queuing and backoff strategies.

**Class:** `APIRateLimiterAction`  
**Registration Name:** `"API Rate Limiter"`

**Parameters:**
- `APIName` (string, required): API identifier
- `RequestsPerWindow` (number, required): Max requests per time window
- `WindowSizeMs` (number, optional): Time window in ms (default: 60000)
- `QueueRequests` (boolean, optional): Queue excess requests (default: true)
- `MaxQueueSize` (number, optional): Maximum queue size (default: 100)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'API Rate Limiter',
    Params: [
        { Name: 'APIName', Value: 'external-api' },
        { Name: 'RequestsPerWindow', Value: 100 },
        { Name: 'WindowSizeMs', Value: 60000 }
    ],
    ContextUser: currentUser
});
```

### 8. Security Actions

#### Password Strength Action

Evaluates password strength and provides improvement suggestions.

**Class:** `PasswordStrengthAction`  
**Registration Name:** `"Password Strength"`

**Parameters:**
- `Password` (string, required): Password to evaluate
- `MinLength` (number, optional): Minimum required length (default: 8)
- `RequireUppercase` (boolean, optional): Require uppercase letters (default: true)
- `RequireLowercase` (boolean, optional): Require lowercase letters (default: true)
- `RequireNumbers` (boolean, optional): Require numbers (default: true)
- `RequireSpecial` (boolean, optional): Require special characters (default: true)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Password Strength',
    Params: [
        { Name: 'Password', Value: 'MyP@ssw0rd' },
        { Name: 'MinLength', Value: 12 }
    ],
    ContextUser: currentUser
});
```

### 9. Workflow Control Actions

#### Conditional Action

Executes actions based on conditional logic.

**Class:** `ConditionalAction`  
**Registration Name:** `"Conditional"`

**Parameters:**
- `Condition` (string, required): JavaScript expression to evaluate
- `ThenAction` (object, required): Action to run if condition is true
- `ElseAction` (object, optional): Action to run if condition is false
- `Context` (object, optional): Variables available in condition

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Conditional',
    Params: [
        { Name: 'Condition', Value: 'value > 100' },
        { Name: 'Context', Value: { value: 150 } },
        { Name: 'ThenAction', Value: { name: 'Send Email', params: {...} } }
    ],
    ContextUser: currentUser
});
```

#### Loop Action

Executes actions repeatedly with iteration support.

**Class:** `LoopAction`  
**Registration Name:** `"Loop"`

**Parameters:**
- `Items` (array, optional): Array to iterate over
- `Count` (number, optional): Number of iterations (if no items)
- `Action` (object, required): Action to execute for each iteration
- `Parallel` (boolean, optional): Run iterations in parallel (default: false)
- `MaxConcurrency` (number, optional): Max parallel executions (default: 10)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Loop',
    Params: [
        { Name: 'Items', Value: [1, 2, 3, 4, 5] },
        { Name: 'Action', Value: { name: 'Process Item', params: {...} } },
        { Name: 'Parallel', Value: true }
    ],
    ContextUser: currentUser
});
```

#### Parallel Execute Action

Runs multiple actions concurrently with result aggregation.

**Class:** `ParallelExecuteAction`  
**Registration Name:** `"Parallel Execute"`

**Parameters:**
- `Actions` (array, required): Array of actions to execute
- `MaxConcurrency` (number, optional): Maximum concurrent executions (default: 10)
- `StopOnError` (boolean, optional): Stop all if one fails (default: false)
- `Timeout` (number, optional): Overall timeout in ms

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Parallel Execute',
    Params: [
        { Name: 'Actions', Value: [
            { name: 'Web Search', params: { SearchTerms: 'AI' } },
            { name: 'HTTP Request', params: { URL: 'https://api.example.com' } }
        ]},
        { Name: 'MaxConcurrency', Value: 2 }
    ],
    ContextUser: currentUser
});
```

#### Retry Action

Retries failed actions with configurable backoff strategies.

**Class:** `RetryAction`  
**Registration Name:** `"Retry"`

**Parameters:**
- `Action` (object, required): Action to retry
- `MaxRetries` (number, optional): Maximum retry attempts (default: 3)
- `InitialDelay` (number, optional): Initial delay in ms (default: 1000)
- `BackoffMultiplier` (number, optional): Delay multiplier (default: 2)
- `MaxDelay` (number, optional): Maximum delay in ms (default: 30000)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Retry',
    Params: [
        { Name: 'Action', Value: { name: 'HTTP Request', params: {...} } },
        { Name: 'MaxRetries', Value: 5 },
        { Name: 'InitialDelay', Value: 2000 }
    ],
    ContextUser: currentUser
});
```

#### Delay Action

Introduces delays in workflow execution.

**Class:** `DelayAction`  
**Registration Name:** `"Delay"`

**Parameters:**
- `DelayMs` (number, required): Delay duration in milliseconds
- `Jitter` (number, optional): Random jitter to add (0-1, percentage of delay)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Delay',
    Params: [
        { Name: 'DelayMs', Value: 5000 },
        { Name: 'Jitter', Value: 0.1 } // 10% jitter
    ],
    ContextUser: currentUser
});
```

### 10. Communication Actions

#### Slack Webhook Action

Sends messages to Slack channels via webhooks.

**Class:** `SlackWebhookAction`  
**Registration Name:** `"Slack Webhook"`

**Parameters:**
- `WebhookURL` (string, required): Slack webhook URL
- `Message` (string, required): Message text
- `Channel` (string, optional): Override default channel
- `Username` (string, optional): Override default username
- `IconEmoji` (string, optional): Override default icon
- `Attachments` (array/string, optional): Rich message attachments

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Slack Webhook',
    Params: [
        { Name: 'WebhookURL', Value: 'https://hooks.slack.com/services/...' },
        { Name: 'Message', Value: 'Deployment completed successfully!' },
        { Name: 'IconEmoji', Value: ':rocket:' }
    ],
    ContextUser: currentUser
});
```

#### Teams Webhook Action

Sends messages to Microsoft Teams channels via webhooks.

**Class:** `TeamsWebhookAction`  
**Registration Name:** `"Teams Webhook"`

**Parameters:**
- `WebhookURL` (string, required): Teams webhook URL
- `Title` (string, optional): Message title
- `Text` (string, required): Message text
- `ThemeColor` (string, optional): Message accent color
- `Sections` (array/string, optional): Message sections
- `Actions` (array/string, optional): Interactive actions

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Teams Webhook',
    Params: [
        { Name: 'WebhookURL', Value: 'https://outlook.office.com/webhook/...' },
        { Name: 'Title', Value: 'Build Status' },
        { Name: 'Text', Value: 'Build #123 completed successfully' },
        { Name: 'ThemeColor', Value: '00FF00' }
    ],
    ContextUser: currentUser
});
```

### 11. AI Actions

#### Execute AI Prompt Action

Executes AI prompts using MemberJunction's AI framework with model selection and parameter control.

**Class:** `ExecuteAIPromptAction`  
**Registration Name:** `"Execute AI Prompt"`

**Parameters:**
- `PromptID` (string, optional): ID of saved prompt template
- `PromptName` (string, optional): Name of saved prompt template
- `PromptText` (string, optional): Direct prompt text (if not using template)
- `ModelID` (string, optional): Specific AI model ID to use
- `ModelName` (string, optional): Specific AI model name to use
- `Temperature` (number, optional): Model temperature (0-2)
- `MaxTokens` (number, optional): Maximum response tokens
- `Variables` (object/string, optional): Variables to inject into prompt template

**Example Usage:**

```typescript
// Using a saved prompt template
const templateResult = await ActionEngine.RunAction({
    ActionName: 'Execute AI Prompt',
    Params: [
        { Name: 'PromptName', Value: 'Summarize Text' },
        { Name: 'Variables', Value: { text: 'Long article text here...' } },
        { Name: 'Temperature', Value: 0.7 }
    ],
    ContextUser: currentUser
});

// Using direct prompt text
const directResult = await ActionEngine.RunAction({
    ActionName: 'Execute AI Prompt',
    Params: [
        { Name: 'PromptText', Value: 'Explain quantum computing in simple terms' },
        { Name: 'ModelName', Value: 'gpt-4' },
        { Name: 'MaxTokens', Value: 500 }
    ],
    ContextUser: currentUser
});
```

## Special Features

### Dual JSON Parameter Support

Many actions support both JSON object and string inputs for flexibility:
- **JSON Object**: Pass JavaScript objects directly
- **JSON String**: Pass stringified JSON for dynamic content

This applies to actions like JSON Transform, HTTP Request, GraphQL Query, and others with object parameters.

### Error Handling and Recovery

Actions implement various error handling strategies:
- **Graceful Degradation**: Actions continue with partial results when possible
- **Detailed Error Messages**: Clear explanations of what went wrong
- **Retry Logic**: Built-in retry mechanisms for transient failures
- **Validation**: Input validation with helpful error messages

### Performance Considerations

- **Streaming Support**: Large file operations use streaming when possible
- **Batch Processing**: Actions process data in chunks for memory efficiency
- **Parallel Execution**: Workflow actions support concurrent processing
- **Resource Management**: Proper cleanup of resources after execution

```bash
# From the package directory
npm run build

# Or from the repository root using Turbo
turbo build --filter="@memberjunction/core-actions"
```

### 5. Data Transformation Actions

#### CSV Parser Action

Parses CSV data with configurable options for headers, delimiters, and data types.

**Class:** `CSVParserAction`  
**Registration Name:** `"CSV Parser"`

**Parameters:**
- `CSVData` (string, required): The CSV data to parse
- `HasHeaders` (boolean, optional): Whether the first row contains headers (default: true)
- `Delimiter` (string, optional): Field delimiter (default: ',')
- `QuoteCharacter` (string, optional): Quote character for escaping (default: '"')
- `SkipEmptyRows` (boolean, optional): Skip empty rows (default: true)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'CSV Parser',
    Params: [
        { Name: 'CSVData', Value: 'Name,Age,City\nJohn,30,NYC\nJane,25,LA' },
        { Name: 'HasHeaders', Value: true }
    ],
    ContextUser: currentUser
});
```

#### JSON Transform Action

Transforms JSON data using JSONPath-style queries with multiple operations support.

**Class:** `JSONTransformAction`  
**Registration Name:** `"JSON Transform"`

**Parameters:**
- `InputData` (object/string, required): JSON data to transform (supports both JSON object and string)
- `Transformations` (string/array, required): JSONPath queries for transformation
- `OutputFormat` (string, optional): 'object' or 'array' (default: 'object')
- `DefaultValue` (any, optional): Default value for missing paths

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'JSON Transform',
    Params: [
        { Name: 'InputData', Value: { users: [{ name: 'John', age: 30 }] } },
        { Name: 'Transformations', Value: ['name:$.users[0].name', 'age:$.users[0].age'] }
    ],
    ContextUser: currentUser
});
```

#### XML Parser Action

Parses XML data into JSON format with namespace support.

**Class:** `XMLParserAction`  
**Registration Name:** `"XML Parser"`

**Parameters:**
- `XMLData` (string, required): The XML data to parse
- `RemoveNamespaces` (boolean, optional): Strip namespace prefixes (default: false)
- `ParseNumbers` (boolean, optional): Convert numeric strings to numbers (default: true)
- `ParseBooleans` (boolean, optional): Convert boolean strings to booleans (default: true)
- `AttributePrefix` (string, optional): Prefix for attributes (default: '@')

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'XML Parser',
    Params: [
        { Name: 'XMLData', Value: '<root><user id="1"><name>John</name></user></root>' },
        { Name: 'ParseNumbers', Value: true }
    ],
    ContextUser: currentUser
});
```

#### Aggregate Data Action

Performs aggregation operations on arrays of data with support for multiple aggregation functions.

**Class:** `AggregateDataAction`  
**Registration Name:** `"Aggregate Data"`

**Parameters:**
- `Data` (array, required): Array of objects to aggregate
- `GroupBy` (string/array, optional): Field(s) to group by
- `Aggregations` (object/string, required): Aggregation operations (sum, avg, count, min, max)
- `Having` (object, optional): Filter conditions on aggregated results

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Aggregate Data',
    Params: [
        { Name: 'Data', Value: [{ category: 'A', value: 10 }, { category: 'A', value: 20 }] },
        { Name: 'GroupBy', Value: 'category' },
        { Name: 'Aggregations', Value: { totalValue: 'sum:value', avgValue: 'avg:value' } }
    ],
    ContextUser: currentUser
});
```

#### Data Mapper Action

Maps data from one structure to another using field mappings and transformations.

**Class:** `DataMapperAction`  
**Registration Name:** `"Data Mapper"`

**Parameters:**
- `SourceData` (object/array, required): Data to map
- `Mappings` (object/string, required): Field mapping configuration
- `DefaultValues` (object, optional): Default values for missing fields
- `RemoveUnmapped` (boolean, optional): Remove fields not in mapping (default: false)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Data Mapper',
    Params: [
        { Name: 'SourceData', Value: { firstName: 'John', lastName: 'Doe' } },
        { Name: 'Mappings', Value: { fullName: '{{firstName}} {{lastName}}' } }
    ],
    ContextUser: currentUser
});
```

### 6. File Operations Actions

#### PDF Generator Action

Generates PDF documents from HTML or markdown content.

**Class:** `PDFGeneratorAction`  
**Registration Name:** `"PDF Generator"`

**Parameters:**
- `Content` (string, required): HTML or markdown content
- `ContentType` (string, optional): 'html' or 'markdown' (default: 'html')
- `Options` (object/string, optional): PDF options (margins, orientation, etc.)
- `FileName` (string, optional): Output filename

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'PDF Generator',
    Params: [
        { Name: 'Content', Value: '<h1>Report</h1><p>Content here</p>' },
        { Name: 'Options', Value: { margin: { top: '1in' }, orientation: 'portrait' } }
    ],
    ContextUser: currentUser
});
```

#### PDF Extractor Action

Extracts text and metadata from PDF files.

**Class:** `PDFExtractorAction`  
**Registration Name:** `"PDF Extractor"`

**Parameters:**
- `PDFData` (Buffer/string, required): PDF file data or base64 string
- `ExtractText` (boolean, optional): Extract text content (default: true)
- `ExtractMetadata` (boolean, optional): Extract document metadata (default: true)
- `PageRange` (string, optional): Pages to extract (e.g., '1-5,7,9-10')

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'PDF Extractor',
    Params: [
        { Name: 'PDFData', Value: pdfBuffer },
        { Name: 'PageRange', Value: '1-10' }
    ],
    ContextUser: currentUser
});
```

#### Excel Reader Action

Reads data from Excel files with support for multiple sheets.

**Class:** `ExcelReaderAction`  
**Registration Name:** `"Excel Reader"`

**Parameters:**
- `ExcelData` (Buffer/string, required): Excel file data or base64 string
- `SheetName` (string, optional): Specific sheet to read
- `Range` (string, optional): Cell range to read (e.g., 'A1:D10')
- `ParseDates` (boolean, optional): Convert Excel dates (default: true)
- `IncludeEmptyRows` (boolean, optional): Include empty rows (default: false)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Excel Reader',
    Params: [
        { Name: 'ExcelData', Value: excelBuffer },
        { Name: 'SheetName', Value: 'Sales Data' }
    ],
    ContextUser: currentUser
});
```

#### Excel Writer Action

Creates Excel files from data with formatting options.

**Class:** `ExcelWriterAction`  
**Registration Name:** `"Excel Writer"`

**Parameters:**
- `Data` (array/object, required): Data to write (array of objects or sheets config)
- `SheetName` (string, optional): Sheet name (default: 'Sheet1')
- `IncludeHeaders` (boolean, optional): Include column headers (default: true)
- `ColumnWidths` (object, optional): Custom column widths
- `Formatting` (object/string, optional): Cell formatting rules

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Excel Writer',
    Params: [
        { Name: 'Data', Value: [{ name: 'John', sales: 1000 }, { name: 'Jane', sales: 1500 }] },
        { Name: 'SheetName', Value: 'Sales Report' }
    ],
    ContextUser: currentUser
});
```

#### File Compress Action

Compresses files into ZIP archives.

**Class:** `FileCompressAction`  
**Registration Name:** `"File Compress"`

**Parameters:**
- `Files` (array, required): Array of file objects with name and content
- `CompressionLevel` (number, optional): Compression level 0-9 (default: 6)
- `ArchiveName` (string, optional): Output archive name
- `Password` (string, optional): Password protection for archive

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'File Compress',
    Params: [
        { Name: 'Files', Value: [
            { name: 'report.txt', content: 'Report content' },
            { name: 'data.json', content: JSON.stringify(data) }
        ]},
        { Name: 'ArchiveName', Value: 'backup.zip' }
    ],
    ContextUser: currentUser
});
```

### 7. Integration Actions

#### HTTP Request Action

Makes HTTP requests with full control over headers, body, and authentication.

**Class:** `HTTPRequestAction`  
**Registration Name:** `"HTTP Request"`

**Parameters:**
- `URL` (string, required): Request URL
- `Method` (string, optional): HTTP method (default: 'GET')
- `Headers` (object/string, optional): Request headers
- `Body` (any, optional): Request body
- `Timeout` (number, optional): Request timeout in ms (default: 30000)
- `RetryCount` (number, optional): Number of retries (default: 0)
- `BasicAuth` (object, optional): Basic authentication credentials

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'HTTP Request',
    Params: [
        { Name: 'URL', Value: 'https://api.example.com/data' },
        { Name: 'Method', Value: 'POST' },
        { Name: 'Headers', Value: { 'Content-Type': 'application/json' } },
        { Name: 'Body', Value: { query: 'test' } }
    ],
    ContextUser: currentUser
});
```

#### GraphQL Query Action

Executes GraphQL queries and mutations with variable support.

**Class:** `GraphQLQueryAction`  
**Registration Name:** `"GraphQL Query"`

**Parameters:**
- `Endpoint` (string, required): GraphQL endpoint URL
- `Query` (string, required): GraphQL query or mutation
- `Variables` (object/string, optional): Query variables
- `Headers` (object/string, optional): Request headers
- `OperationName` (string, optional): Operation name for multi-operation documents

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'GraphQL Query',
    Params: [
        { Name: 'Endpoint', Value: 'https://api.example.com/graphql' },
        { Name: 'Query', Value: 'query GetUser($id: ID!) { user(id: $id) { name email } }' },
        { Name: 'Variables', Value: { id: '123' } }
    ],
    ContextUser: currentUser
});
```

#### OAuth Flow Action

Handles OAuth 2.0 authentication flows.

**Class:** `OAuthFlowAction`  
**Registration Name:** `"OAuth Flow"`

**Parameters:**
- `Provider` (string, required): OAuth provider name
- `ClientID` (string, required): OAuth client ID
- `ClientSecret` (string, required): OAuth client secret
- `RedirectURI` (string, required): Redirect URI
- `Scopes` (string/array, optional): Required scopes
- `State` (string, optional): State parameter for security

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'OAuth Flow',
    Params: [
        { Name: 'Provider', Value: 'google' },
        { Name: 'ClientID', Value: 'your-client-id' },
        { Name: 'ClientSecret', Value: 'your-client-secret' },
        { Name: 'RedirectURI', Value: 'https://app.example.com/callback' },
        { Name: 'Scopes', Value: ['email', 'profile'] }
    ],
    ContextUser: currentUser
});
```

#### API Rate Limiter Action

Manages API rate limiting with queuing and backoff strategies.

**Class:** `APIRateLimiterAction`  
**Registration Name:** `"API Rate Limiter"`

**Parameters:**
- `APIName` (string, required): API identifier
- `RequestsPerWindow` (number, required): Max requests per time window
- `WindowSizeMs` (number, optional): Time window in ms (default: 60000)
- `QueueRequests` (boolean, optional): Queue excess requests (default: true)
- `MaxQueueSize` (number, optional): Maximum queue size (default: 100)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'API Rate Limiter',
    Params: [
        { Name: 'APIName', Value: 'external-api' },
        { Name: 'RequestsPerWindow', Value: 100 },
        { Name: 'WindowSizeMs', Value: 60000 }
    ],
    ContextUser: currentUser
});
```

### 8. Security Actions

#### Password Strength Action

Evaluates password strength and provides improvement suggestions.

**Class:** `PasswordStrengthAction`  
**Registration Name:** `"Password Strength"`

**Parameters:**
- `Password` (string, required): Password to evaluate
- `MinLength` (number, optional): Minimum required length (default: 8)
- `RequireUppercase` (boolean, optional): Require uppercase letters (default: true)
- `RequireLowercase` (boolean, optional): Require lowercase letters (default: true)
- `RequireNumbers` (boolean, optional): Require numbers (default: true)
- `RequireSpecial` (boolean, optional): Require special characters (default: true)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Password Strength',
    Params: [
        { Name: 'Password', Value: 'MyP@ssw0rd' },
        { Name: 'MinLength', Value: 12 }
    ],
    ContextUser: currentUser
});
```

### 9. Workflow Control Actions

#### Conditional Action

Executes actions based on conditional logic.

**Class:** `ConditionalAction`  
**Registration Name:** `"Conditional"`

**Parameters:**
- `Condition` (string, required): JavaScript expression to evaluate
- `ThenAction` (object, required): Action to run if condition is true
- `ElseAction` (object, optional): Action to run if condition is false
- `Context` (object, optional): Variables available in condition

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Conditional',
    Params: [
        { Name: 'Condition', Value: 'value > 100' },
        { Name: 'Context', Value: { value: 150 } },
        { Name: 'ThenAction', Value: { name: 'Send Email', params: {...} } }
    ],
    ContextUser: currentUser
});
```

#### Loop Action

Executes actions repeatedly with iteration support.

**Class:** `LoopAction`  
**Registration Name:** `"Loop"`

**Parameters:**
- `Items` (array, optional): Array to iterate over
- `Count` (number, optional): Number of iterations (if no items)
- `Action` (object, required): Action to execute for each iteration
- `Parallel` (boolean, optional): Run iterations in parallel (default: false)
- `MaxConcurrency` (number, optional): Max parallel executions (default: 10)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Loop',
    Params: [
        { Name: 'Items', Value: [1, 2, 3, 4, 5] },
        { Name: 'Action', Value: { name: 'Process Item', params: {...} } },
        { Name: 'Parallel', Value: true }
    ],
    ContextUser: currentUser
});
```

#### Parallel Execute Action

Runs multiple actions concurrently with result aggregation.

**Class:** `ParallelExecuteAction`  
**Registration Name:** `"Parallel Execute"`

**Parameters:**
- `Actions` (array, required): Array of actions to execute
- `MaxConcurrency` (number, optional): Maximum concurrent executions (default: 10)
- `StopOnError` (boolean, optional): Stop all if one fails (default: false)
- `Timeout` (number, optional): Overall timeout in ms

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Parallel Execute',
    Params: [
        { Name: 'Actions', Value: [
            { name: 'Web Search', params: { SearchTerms: 'AI' } },
            { name: 'HTTP Request', params: { URL: 'https://api.example.com' } }
        ]},
        { Name: 'MaxConcurrency', Value: 2 }
    ],
    ContextUser: currentUser
});
```

#### Retry Action

Retries failed actions with configurable backoff strategies.

**Class:** `RetryAction`  
**Registration Name:** `"Retry"`

**Parameters:**
- `Action` (object, required): Action to retry
- `MaxRetries` (number, optional): Maximum retry attempts (default: 3)
- `InitialDelay` (number, optional): Initial delay in ms (default: 1000)
- `BackoffMultiplier` (number, optional): Delay multiplier (default: 2)
- `MaxDelay` (number, optional): Maximum delay in ms (default: 30000)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Retry',
    Params: [
        { Name: 'Action', Value: { name: 'HTTP Request', params: {...} } },
        { Name: 'MaxRetries', Value: 5 },
        { Name: 'InitialDelay', Value: 2000 }
    ],
    ContextUser: currentUser
});
```

#### Delay Action

Introduces delays in workflow execution.

**Class:** `DelayAction`  
**Registration Name:** `"Delay"`

**Parameters:**
- `DelayMs` (number, required): Delay duration in milliseconds
- `Jitter` (number, optional): Random jitter to add (0-1, percentage of delay)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Delay',
    Params: [
        { Name: 'DelayMs', Value: 5000 },
        { Name: 'Jitter', Value: 0.1 } // 10% jitter
    ],
    ContextUser: currentUser
});
```

### 10. Communication Actions

#### Slack Webhook Action

Sends messages to Slack channels via webhooks.

**Class:** `SlackWebhookAction`  
**Registration Name:** `"Slack Webhook"`

**Parameters:**
- `WebhookURL` (string, required): Slack webhook URL
- `Message` (string, required): Message text
- `Channel` (string, optional): Override default channel
- `Username` (string, optional): Override default username
- `IconEmoji` (string, optional): Override default icon
- `Attachments` (array/string, optional): Rich message attachments

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Slack Webhook',
    Params: [
        { Name: 'WebhookURL', Value: 'https://hooks.slack.com/services/...' },
        { Name: 'Message', Value: 'Deployment completed successfully!' },
        { Name: 'IconEmoji', Value: ':rocket:' }
    ],
    ContextUser: currentUser
});
```

#### Teams Webhook Action

Sends messages to Microsoft Teams channels via webhooks.

**Class:** `TeamsWebhookAction`  
**Registration Name:** `"Teams Webhook"`

**Parameters:**
- `WebhookURL` (string, required): Teams webhook URL
- `Title` (string, optional): Message title
- `Text` (string, required): Message text
- `ThemeColor` (string, optional): Message accent color
- `Sections` (array/string, optional): Message sections
- `Actions` (array/string, optional): Interactive actions

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Teams Webhook',
    Params: [
        { Name: 'WebhookURL', Value: 'https://outlook.office.com/webhook/...' },
        { Name: 'Title', Value: 'Build Status' },
        { Name: 'Text', Value: 'Build #123 completed successfully' },
        { Name: 'ThemeColor', Value: '00FF00' }
    ],
    ContextUser: currentUser
});
```

### 11. AI Actions

#### Execute AI Prompt Action

Executes AI prompts using MemberJunction's AI framework with model selection and parameter control.

**Class:** `ExecuteAIPromptAction`  
**Registration Name:** `"Execute AI Prompt"`

**Parameters:**
- `PromptID` (string, optional): ID of saved prompt template
- `PromptName` (string, optional): Name of saved prompt template
- `PromptText` (string, optional): Direct prompt text (if not using template)
- `ModelID` (string, optional): Specific AI model ID to use
- `ModelName` (string, optional): Specific AI model name to use
- `Temperature` (number, optional): Model temperature (0-2)
- `MaxTokens` (number, optional): Maximum response tokens
- `Variables` (object/string, optional): Variables to inject into prompt template

**Example Usage:**

```typescript
// Using a saved prompt template
const templateResult = await ActionEngine.RunAction({
    ActionName: 'Execute AI Prompt',
    Params: [
        { Name: 'PromptName', Value: 'Summarize Text' },
        { Name: 'Variables', Value: { text: 'Long article text here...' } },
        { Name: 'Temperature', Value: 0.7 }
    ],
    ContextUser: currentUser
});

// Using direct prompt text
const directResult = await ActionEngine.RunAction({
    ActionName: 'Execute AI Prompt',
    Params: [
        { Name: 'PromptText', Value: 'Explain quantum computing in simple terms' },
        { Name: 'ModelName', Value: 'gpt-4' },
        { Name: 'MaxTokens', Value: 500 }
    ],
    ContextUser: currentUser
});
```

## Special Features

### Dual JSON Parameter Support

Many actions support both JSON object and string inputs for flexibility:
- **JSON Object**: Pass JavaScript objects directly
- **JSON String**: Pass stringified JSON for dynamic content

This applies to actions like JSON Transform, HTTP Request, GraphQL Query, and others with object parameters.

### Error Handling and Recovery

Actions implement various error handling strategies:
- **Graceful Degradation**: Actions continue with partial results when possible
- **Detailed Error Messages**: Clear explanations of what went wrong
- **Retry Logic**: Built-in retry mechanisms for transient failures
- **Validation**: Input validation with helpful error messages

### Performance Considerations

- **Streaming Support**: Large file operations use streaming when possible
- **Batch Processing**: Actions process data in chunks for memory efficiency
- **Parallel Execution**: Workflow actions support concurrent processing
- **Resource Management**: Proper cleanup of resources after execution

```

The package uses TypeScript and compiles to JavaScript with type definitions included.

## Result Handling

All actions return an `ActionResultSimple` object with the following structure:

```

### 5. Data Transformation Actions

#### CSV Parser Action

Parses CSV data with configurable options for headers, delimiters, and data types.

**Class:** `CSVParserAction`  
**Registration Name:** `"CSV Parser"`

**Parameters:**
- `CSVData` (string, required): The CSV data to parse
- `HasHeaders` (boolean, optional): Whether the first row contains headers (default: true)
- `Delimiter` (string, optional): Field delimiter (default: ',')
- `QuoteCharacter` (string, optional): Quote character for escaping (default: '"')
- `SkipEmptyRows` (boolean, optional): Skip empty rows (default: true)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'CSV Parser',
    Params: [
        { Name: 'CSVData', Value: 'Name,Age,City\nJohn,30,NYC\nJane,25,LA' },
        { Name: 'HasHeaders', Value: true }
    ],
    ContextUser: currentUser
});
```

#### JSON Transform Action

Transforms JSON data using JSONPath-style queries with multiple operations support.

**Class:** `JSONTransformAction`  
**Registration Name:** `"JSON Transform"`

**Parameters:**
- `InputData` (object/string, required): JSON data to transform (supports both JSON object and string)
- `Transformations` (string/array, required): JSONPath queries for transformation
- `OutputFormat` (string, optional): 'object' or 'array' (default: 'object')
- `DefaultValue` (any, optional): Default value for missing paths

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'JSON Transform',
    Params: [
        { Name: 'InputData', Value: { users: [{ name: 'John', age: 30 }] } },
        { Name: 'Transformations', Value: ['name:$.users[0].name', 'age:$.users[0].age'] }
    ],
    ContextUser: currentUser
});
```

#### XML Parser Action

Parses XML data into JSON format with namespace support.

**Class:** `XMLParserAction`  
**Registration Name:** `"XML Parser"`

**Parameters:**
- `XMLData` (string, required): The XML data to parse
- `RemoveNamespaces` (boolean, optional): Strip namespace prefixes (default: false)
- `ParseNumbers` (boolean, optional): Convert numeric strings to numbers (default: true)
- `ParseBooleans` (boolean, optional): Convert boolean strings to booleans (default: true)
- `AttributePrefix` (string, optional): Prefix for attributes (default: '@')

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'XML Parser',
    Params: [
        { Name: 'XMLData', Value: '<root><user id="1"><name>John</name></user></root>' },
        { Name: 'ParseNumbers', Value: true }
    ],
    ContextUser: currentUser
});
```

#### Aggregate Data Action

Performs aggregation operations on arrays of data with support for multiple aggregation functions.

**Class:** `AggregateDataAction`  
**Registration Name:** `"Aggregate Data"`

**Parameters:**
- `Data` (array, required): Array of objects to aggregate
- `GroupBy` (string/array, optional): Field(s) to group by
- `Aggregations` (object/string, required): Aggregation operations (sum, avg, count, min, max)
- `Having` (object, optional): Filter conditions on aggregated results

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Aggregate Data',
    Params: [
        { Name: 'Data', Value: [{ category: 'A', value: 10 }, { category: 'A', value: 20 }] },
        { Name: 'GroupBy', Value: 'category' },
        { Name: 'Aggregations', Value: { totalValue: 'sum:value', avgValue: 'avg:value' } }
    ],
    ContextUser: currentUser
});
```

#### Data Mapper Action

Maps data from one structure to another using field mappings and transformations.

**Class:** `DataMapperAction`  
**Registration Name:** `"Data Mapper"`

**Parameters:**
- `SourceData` (object/array, required): Data to map
- `Mappings` (object/string, required): Field mapping configuration
- `DefaultValues` (object, optional): Default values for missing fields
- `RemoveUnmapped` (boolean, optional): Remove fields not in mapping (default: false)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Data Mapper',
    Params: [
        { Name: 'SourceData', Value: { firstName: 'John', lastName: 'Doe' } },
        { Name: 'Mappings', Value: { fullName: '{{firstName}} {{lastName}}' } }
    ],
    ContextUser: currentUser
});
```

### 6. File Operations Actions

#### PDF Generator Action

Generates PDF documents from HTML or markdown content.

**Class:** `PDFGeneratorAction`  
**Registration Name:** `"PDF Generator"`

**Parameters:**
- `Content` (string, required): HTML or markdown content
- `ContentType` (string, optional): 'html' or 'markdown' (default: 'html')
- `Options` (object/string, optional): PDF options (margins, orientation, etc.)
- `FileName` (string, optional): Output filename

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'PDF Generator',
    Params: [
        { Name: 'Content', Value: '<h1>Report</h1><p>Content here</p>' },
        { Name: 'Options', Value: { margin: { top: '1in' }, orientation: 'portrait' } }
    ],
    ContextUser: currentUser
});
```

#### PDF Extractor Action

Extracts text and metadata from PDF files.

**Class:** `PDFExtractorAction`  
**Registration Name:** `"PDF Extractor"`

**Parameters:**
- `PDFData` (Buffer/string, required): PDF file data or base64 string
- `ExtractText` (boolean, optional): Extract text content (default: true)
- `ExtractMetadata` (boolean, optional): Extract document metadata (default: true)
- `PageRange` (string, optional): Pages to extract (e.g., '1-5,7,9-10')

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'PDF Extractor',
    Params: [
        { Name: 'PDFData', Value: pdfBuffer },
        { Name: 'PageRange', Value: '1-10' }
    ],
    ContextUser: currentUser
});
```

#### Excel Reader Action

Reads data from Excel files with support for multiple sheets.

**Class:** `ExcelReaderAction`  
**Registration Name:** `"Excel Reader"`

**Parameters:**
- `ExcelData` (Buffer/string, required): Excel file data or base64 string
- `SheetName` (string, optional): Specific sheet to read
- `Range` (string, optional): Cell range to read (e.g., 'A1:D10')
- `ParseDates` (boolean, optional): Convert Excel dates (default: true)
- `IncludeEmptyRows` (boolean, optional): Include empty rows (default: false)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Excel Reader',
    Params: [
        { Name: 'ExcelData', Value: excelBuffer },
        { Name: 'SheetName', Value: 'Sales Data' }
    ],
    ContextUser: currentUser
});
```

#### Excel Writer Action

Creates Excel files from data with formatting options.

**Class:** `ExcelWriterAction`  
**Registration Name:** `"Excel Writer"`

**Parameters:**
- `Data` (array/object, required): Data to write (array of objects or sheets config)
- `SheetName` (string, optional): Sheet name (default: 'Sheet1')
- `IncludeHeaders` (boolean, optional): Include column headers (default: true)
- `ColumnWidths` (object, optional): Custom column widths
- `Formatting` (object/string, optional): Cell formatting rules

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Excel Writer',
    Params: [
        { Name: 'Data', Value: [{ name: 'John', sales: 1000 }, { name: 'Jane', sales: 1500 }] },
        { Name: 'SheetName', Value: 'Sales Report' }
    ],
    ContextUser: currentUser
});
```

#### File Compress Action

Compresses files into ZIP archives.

**Class:** `FileCompressAction`  
**Registration Name:** `"File Compress"`

**Parameters:**
- `Files` (array, required): Array of file objects with name and content
- `CompressionLevel` (number, optional): Compression level 0-9 (default: 6)
- `ArchiveName` (string, optional): Output archive name
- `Password` (string, optional): Password protection for archive

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'File Compress',
    Params: [
        { Name: 'Files', Value: [
            { name: 'report.txt', content: 'Report content' },
            { name: 'data.json', content: JSON.stringify(data) }
        ]},
        { Name: 'ArchiveName', Value: 'backup.zip' }
    ],
    ContextUser: currentUser
});
```

### 7. Integration Actions

#### HTTP Request Action

Makes HTTP requests with full control over headers, body, and authentication.

**Class:** `HTTPRequestAction`  
**Registration Name:** `"HTTP Request"`

**Parameters:**
- `URL` (string, required): Request URL
- `Method` (string, optional): HTTP method (default: 'GET')
- `Headers` (object/string, optional): Request headers
- `Body` (any, optional): Request body
- `Timeout` (number, optional): Request timeout in ms (default: 30000)
- `RetryCount` (number, optional): Number of retries (default: 0)
- `BasicAuth` (object, optional): Basic authentication credentials

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'HTTP Request',
    Params: [
        { Name: 'URL', Value: 'https://api.example.com/data' },
        { Name: 'Method', Value: 'POST' },
        { Name: 'Headers', Value: { 'Content-Type': 'application/json' } },
        { Name: 'Body', Value: { query: 'test' } }
    ],
    ContextUser: currentUser
});
```

#### GraphQL Query Action

Executes GraphQL queries and mutations with variable support.

**Class:** `GraphQLQueryAction`  
**Registration Name:** `"GraphQL Query"`

**Parameters:**
- `Endpoint` (string, required): GraphQL endpoint URL
- `Query` (string, required): GraphQL query or mutation
- `Variables` (object/string, optional): Query variables
- `Headers` (object/string, optional): Request headers
- `OperationName` (string, optional): Operation name for multi-operation documents

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'GraphQL Query',
    Params: [
        { Name: 'Endpoint', Value: 'https://api.example.com/graphql' },
        { Name: 'Query', Value: 'query GetUser($id: ID!) { user(id: $id) { name email } }' },
        { Name: 'Variables', Value: { id: '123' } }
    ],
    ContextUser: currentUser
});
```

#### OAuth Flow Action

Handles OAuth 2.0 authentication flows.

**Class:** `OAuthFlowAction`  
**Registration Name:** `"OAuth Flow"`

**Parameters:**
- `Provider` (string, required): OAuth provider name
- `ClientID` (string, required): OAuth client ID
- `ClientSecret` (string, required): OAuth client secret
- `RedirectURI` (string, required): Redirect URI
- `Scopes` (string/array, optional): Required scopes
- `State` (string, optional): State parameter for security

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'OAuth Flow',
    Params: [
        { Name: 'Provider', Value: 'google' },
        { Name: 'ClientID', Value: 'your-client-id' },
        { Name: 'ClientSecret', Value: 'your-client-secret' },
        { Name: 'RedirectURI', Value: 'https://app.example.com/callback' },
        { Name: 'Scopes', Value: ['email', 'profile'] }
    ],
    ContextUser: currentUser
});
```

#### API Rate Limiter Action

Manages API rate limiting with queuing and backoff strategies.

**Class:** `APIRateLimiterAction`  
**Registration Name:** `"API Rate Limiter"`

**Parameters:**
- `APIName` (string, required): API identifier
- `RequestsPerWindow` (number, required): Max requests per time window
- `WindowSizeMs` (number, optional): Time window in ms (default: 60000)
- `QueueRequests` (boolean, optional): Queue excess requests (default: true)
- `MaxQueueSize` (number, optional): Maximum queue size (default: 100)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'API Rate Limiter',
    Params: [
        { Name: 'APIName', Value: 'external-api' },
        { Name: 'RequestsPerWindow', Value: 100 },
        { Name: 'WindowSizeMs', Value: 60000 }
    ],
    ContextUser: currentUser
});
```

### 8. Security Actions

#### Password Strength Action

Evaluates password strength and provides improvement suggestions.

**Class:** `PasswordStrengthAction`  
**Registration Name:** `"Password Strength"`

**Parameters:**
- `Password` (string, required): Password to evaluate
- `MinLength` (number, optional): Minimum required length (default: 8)
- `RequireUppercase` (boolean, optional): Require uppercase letters (default: true)
- `RequireLowercase` (boolean, optional): Require lowercase letters (default: true)
- `RequireNumbers` (boolean, optional): Require numbers (default: true)
- `RequireSpecial` (boolean, optional): Require special characters (default: true)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Password Strength',
    Params: [
        { Name: 'Password', Value: 'MyP@ssw0rd' },
        { Name: 'MinLength', Value: 12 }
    ],
    ContextUser: currentUser
});
```

### 9. Workflow Control Actions

#### Conditional Action

Executes actions based on conditional logic.

**Class:** `ConditionalAction`  
**Registration Name:** `"Conditional"`

**Parameters:**
- `Condition` (string, required): JavaScript expression to evaluate
- `ThenAction` (object, required): Action to run if condition is true
- `ElseAction` (object, optional): Action to run if condition is false
- `Context` (object, optional): Variables available in condition

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Conditional',
    Params: [
        { Name: 'Condition', Value: 'value > 100' },
        { Name: 'Context', Value: { value: 150 } },
        { Name: 'ThenAction', Value: { name: 'Send Email', params: {...} } }
    ],
    ContextUser: currentUser
});
```

#### Loop Action

Executes actions repeatedly with iteration support.

**Class:** `LoopAction`  
**Registration Name:** `"Loop"`

**Parameters:**
- `Items` (array, optional): Array to iterate over
- `Count` (number, optional): Number of iterations (if no items)
- `Action` (object, required): Action to execute for each iteration
- `Parallel` (boolean, optional): Run iterations in parallel (default: false)
- `MaxConcurrency` (number, optional): Max parallel executions (default: 10)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Loop',
    Params: [
        { Name: 'Items', Value: [1, 2, 3, 4, 5] },
        { Name: 'Action', Value: { name: 'Process Item', params: {...} } },
        { Name: 'Parallel', Value: true }
    ],
    ContextUser: currentUser
});
```

#### Parallel Execute Action

Runs multiple actions concurrently with result aggregation.

**Class:** `ParallelExecuteAction`  
**Registration Name:** `"Parallel Execute"`

**Parameters:**
- `Actions` (array, required): Array of actions to execute
- `MaxConcurrency` (number, optional): Maximum concurrent executions (default: 10)
- `StopOnError` (boolean, optional): Stop all if one fails (default: false)
- `Timeout` (number, optional): Overall timeout in ms

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Parallel Execute',
    Params: [
        { Name: 'Actions', Value: [
            { name: 'Web Search', params: { SearchTerms: 'AI' } },
            { name: 'HTTP Request', params: { URL: 'https://api.example.com' } }
        ]},
        { Name: 'MaxConcurrency', Value: 2 }
    ],
    ContextUser: currentUser
});
```

#### Retry Action

Retries failed actions with configurable backoff strategies.

**Class:** `RetryAction`  
**Registration Name:** `"Retry"`

**Parameters:**
- `Action` (object, required): Action to retry
- `MaxRetries` (number, optional): Maximum retry attempts (default: 3)
- `InitialDelay` (number, optional): Initial delay in ms (default: 1000)
- `BackoffMultiplier` (number, optional): Delay multiplier (default: 2)
- `MaxDelay` (number, optional): Maximum delay in ms (default: 30000)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Retry',
    Params: [
        { Name: 'Action', Value: { name: 'HTTP Request', params: {...} } },
        { Name: 'MaxRetries', Value: 5 },
        { Name: 'InitialDelay', Value: 2000 }
    ],
    ContextUser: currentUser
});
```

#### Delay Action

Introduces delays in workflow execution.

**Class:** `DelayAction`  
**Registration Name:** `"Delay"`

**Parameters:**
- `DelayMs` (number, required): Delay duration in milliseconds
- `Jitter` (number, optional): Random jitter to add (0-1, percentage of delay)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Delay',
    Params: [
        { Name: 'DelayMs', Value: 5000 },
        { Name: 'Jitter', Value: 0.1 } // 10% jitter
    ],
    ContextUser: currentUser
});
```

### 10. Communication Actions

#### Slack Webhook Action

Sends messages to Slack channels via webhooks.

**Class:** `SlackWebhookAction`  
**Registration Name:** `"Slack Webhook"`

**Parameters:**
- `WebhookURL` (string, required): Slack webhook URL
- `Message` (string, required): Message text
- `Channel` (string, optional): Override default channel
- `Username` (string, optional): Override default username
- `IconEmoji` (string, optional): Override default icon
- `Attachments` (array/string, optional): Rich message attachments

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Slack Webhook',
    Params: [
        { Name: 'WebhookURL', Value: 'https://hooks.slack.com/services/...' },
        { Name: 'Message', Value: 'Deployment completed successfully!' },
        { Name: 'IconEmoji', Value: ':rocket:' }
    ],
    ContextUser: currentUser
});
```

#### Teams Webhook Action

Sends messages to Microsoft Teams channels via webhooks.

**Class:** `TeamsWebhookAction`  
**Registration Name:** `"Teams Webhook"`

**Parameters:**
- `WebhookURL` (string, required): Teams webhook URL
- `Title` (string, optional): Message title
- `Text` (string, required): Message text
- `ThemeColor` (string, optional): Message accent color
- `Sections` (array/string, optional): Message sections
- `Actions` (array/string, optional): Interactive actions

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Teams Webhook',
    Params: [
        { Name: 'WebhookURL', Value: 'https://outlook.office.com/webhook/...' },
        { Name: 'Title', Value: 'Build Status' },
        { Name: 'Text', Value: 'Build #123 completed successfully' },
        { Name: 'ThemeColor', Value: '00FF00' }
    ],
    ContextUser: currentUser
});
```

### 11. AI Actions

#### Execute AI Prompt Action

Executes AI prompts using MemberJunction's AI framework with model selection and parameter control.

**Class:** `ExecuteAIPromptAction`  
**Registration Name:** `"Execute AI Prompt"`

**Parameters:**
- `PromptID` (string, optional): ID of saved prompt template
- `PromptName` (string, optional): Name of saved prompt template
- `PromptText` (string, optional): Direct prompt text (if not using template)
- `ModelID` (string, optional): Specific AI model ID to use
- `ModelName` (string, optional): Specific AI model name to use
- `Temperature` (number, optional): Model temperature (0-2)
- `MaxTokens` (number, optional): Maximum response tokens
- `Variables` (object/string, optional): Variables to inject into prompt template

**Example Usage:**

```typescript
// Using a saved prompt template
const templateResult = await ActionEngine.RunAction({
    ActionName: 'Execute AI Prompt',
    Params: [
        { Name: 'PromptName', Value: 'Summarize Text' },
        { Name: 'Variables', Value: { text: 'Long article text here...' } },
        { Name: 'Temperature', Value: 0.7 }
    ],
    ContextUser: currentUser
});

// Using direct prompt text
const directResult = await ActionEngine.RunAction({
    ActionName: 'Execute AI Prompt',
    Params: [
        { Name: 'PromptText', Value: 'Explain quantum computing in simple terms' },
        { Name: 'ModelName', Value: 'gpt-4' },
        { Name: 'MaxTokens', Value: 500 }
    ],
    ContextUser: currentUser
});
```

## Special Features

### Dual JSON Parameter Support

Many actions support both JSON object and string inputs for flexibility:
- **JSON Object**: Pass JavaScript objects directly
- **JSON String**: Pass stringified JSON for dynamic content

This applies to actions like JSON Transform, HTTP Request, GraphQL Query, and others with object parameters.

### Error Handling and Recovery

Actions implement various error handling strategies:
- **Graceful Degradation**: Actions continue with partial results when possible
- **Detailed Error Messages**: Clear explanations of what went wrong
- **Retry Logic**: Built-in retry mechanisms for transient failures
- **Validation**: Input validation with helpful error messages

### Performance Considerations

- **Streaming Support**: Large file operations use streaming when possible
- **Batch Processing**: Actions process data in chunks for memory efficiency
- **Parallel Execution**: Workflow actions support concurrent processing
- **Resource Management**: Proper cleanup of resources after execution

```typescript
interface ActionResultSimple {
    Success: boolean;      // Whether the action completed successfully
    Message?: string;      // Error message or additional information
    ResultCode: string;    // Either "SUCCESS" or "FAILED"
}
```

### 5. Data Transformation Actions

#### CSV Parser Action

Parses CSV data with configurable options for headers, delimiters, and data types.

**Class:** `CSVParserAction`  
**Registration Name:** `"CSV Parser"`

**Parameters:**
- `CSVData` (string, required): The CSV data to parse
- `HasHeaders` (boolean, optional): Whether the first row contains headers (default: true)
- `Delimiter` (string, optional): Field delimiter (default: ',')
- `QuoteCharacter` (string, optional): Quote character for escaping (default: '"')
- `SkipEmptyRows` (boolean, optional): Skip empty rows (default: true)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'CSV Parser',
    Params: [
        { Name: 'CSVData', Value: 'Name,Age,City\nJohn,30,NYC\nJane,25,LA' },
        { Name: 'HasHeaders', Value: true }
    ],
    ContextUser: currentUser
});
```

#### JSON Transform Action

Transforms JSON data using JSONPath-style queries with multiple operations support.

**Class:** `JSONTransformAction`  
**Registration Name:** `"JSON Transform"`

**Parameters:**
- `InputData` (object/string, required): JSON data to transform (supports both JSON object and string)
- `Transformations` (string/array, required): JSONPath queries for transformation
- `OutputFormat` (string, optional): 'object' or 'array' (default: 'object')
- `DefaultValue` (any, optional): Default value for missing paths

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'JSON Transform',
    Params: [
        { Name: 'InputData', Value: { users: [{ name: 'John', age: 30 }] } },
        { Name: 'Transformations', Value: ['name:$.users[0].name', 'age:$.users[0].age'] }
    ],
    ContextUser: currentUser
});
```

#### XML Parser Action

Parses XML data into JSON format with namespace support.

**Class:** `XMLParserAction`  
**Registration Name:** `"XML Parser"`

**Parameters:**
- `XMLData` (string, required): The XML data to parse
- `RemoveNamespaces` (boolean, optional): Strip namespace prefixes (default: false)
- `ParseNumbers` (boolean, optional): Convert numeric strings to numbers (default: true)
- `ParseBooleans` (boolean, optional): Convert boolean strings to booleans (default: true)
- `AttributePrefix` (string, optional): Prefix for attributes (default: '@')

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'XML Parser',
    Params: [
        { Name: 'XMLData', Value: '<root><user id="1"><name>John</name></user></root>' },
        { Name: 'ParseNumbers', Value: true }
    ],
    ContextUser: currentUser
});
```

#### Aggregate Data Action

Performs aggregation operations on arrays of data with support for multiple aggregation functions.

**Class:** `AggregateDataAction`  
**Registration Name:** `"Aggregate Data"`

**Parameters:**
- `Data` (array, required): Array of objects to aggregate
- `GroupBy` (string/array, optional): Field(s) to group by
- `Aggregations` (object/string, required): Aggregation operations (sum, avg, count, min, max)
- `Having` (object, optional): Filter conditions on aggregated results

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Aggregate Data',
    Params: [
        { Name: 'Data', Value: [{ category: 'A', value: 10 }, { category: 'A', value: 20 }] },
        { Name: 'GroupBy', Value: 'category' },
        { Name: 'Aggregations', Value: { totalValue: 'sum:value', avgValue: 'avg:value' } }
    ],
    ContextUser: currentUser
});
```

#### Data Mapper Action

Maps data from one structure to another using field mappings and transformations.

**Class:** `DataMapperAction`  
**Registration Name:** `"Data Mapper"`

**Parameters:**
- `SourceData` (object/array, required): Data to map
- `Mappings` (object/string, required): Field mapping configuration
- `DefaultValues` (object, optional): Default values for missing fields
- `RemoveUnmapped` (boolean, optional): Remove fields not in mapping (default: false)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Data Mapper',
    Params: [
        { Name: 'SourceData', Value: { firstName: 'John', lastName: 'Doe' } },
        { Name: 'Mappings', Value: { fullName: '{{firstName}} {{lastName}}' } }
    ],
    ContextUser: currentUser
});
```

### 6. File Operations Actions

#### PDF Generator Action

Generates PDF documents from HTML or markdown content.

**Class:** `PDFGeneratorAction`  
**Registration Name:** `"PDF Generator"`

**Parameters:**
- `Content` (string, required): HTML or markdown content
- `ContentType` (string, optional): 'html' or 'markdown' (default: 'html')
- `Options` (object/string, optional): PDF options (margins, orientation, etc.)
- `FileName` (string, optional): Output filename

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'PDF Generator',
    Params: [
        { Name: 'Content', Value: '<h1>Report</h1><p>Content here</p>' },
        { Name: 'Options', Value: { margin: { top: '1in' }, orientation: 'portrait' } }
    ],
    ContextUser: currentUser
});
```

#### PDF Extractor Action

Extracts text and metadata from PDF files.

**Class:** `PDFExtractorAction`  
**Registration Name:** `"PDF Extractor"`

**Parameters:**
- `PDFData` (Buffer/string, required): PDF file data or base64 string
- `ExtractText` (boolean, optional): Extract text content (default: true)
- `ExtractMetadata` (boolean, optional): Extract document metadata (default: true)
- `PageRange` (string, optional): Pages to extract (e.g., '1-5,7,9-10')

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'PDF Extractor',
    Params: [
        { Name: 'PDFData', Value: pdfBuffer },
        { Name: 'PageRange', Value: '1-10' }
    ],
    ContextUser: currentUser
});
```

#### Excel Reader Action

Reads data from Excel files with support for multiple sheets.

**Class:** `ExcelReaderAction`  
**Registration Name:** `"Excel Reader"`

**Parameters:**
- `ExcelData` (Buffer/string, required): Excel file data or base64 string
- `SheetName` (string, optional): Specific sheet to read
- `Range` (string, optional): Cell range to read (e.g., 'A1:D10')
- `ParseDates` (boolean, optional): Convert Excel dates (default: true)
- `IncludeEmptyRows` (boolean, optional): Include empty rows (default: false)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Excel Reader',
    Params: [
        { Name: 'ExcelData', Value: excelBuffer },
        { Name: 'SheetName', Value: 'Sales Data' }
    ],
    ContextUser: currentUser
});
```

#### Excel Writer Action

Creates Excel files from data with formatting options.

**Class:** `ExcelWriterAction`  
**Registration Name:** `"Excel Writer"`

**Parameters:**
- `Data` (array/object, required): Data to write (array of objects or sheets config)
- `SheetName` (string, optional): Sheet name (default: 'Sheet1')
- `IncludeHeaders` (boolean, optional): Include column headers (default: true)
- `ColumnWidths` (object, optional): Custom column widths
- `Formatting` (object/string, optional): Cell formatting rules

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Excel Writer',
    Params: [
        { Name: 'Data', Value: [{ name: 'John', sales: 1000 }, { name: 'Jane', sales: 1500 }] },
        { Name: 'SheetName', Value: 'Sales Report' }
    ],
    ContextUser: currentUser
});
```

#### File Compress Action

Compresses files into ZIP archives.

**Class:** `FileCompressAction`  
**Registration Name:** `"File Compress"`

**Parameters:**
- `Files` (array, required): Array of file objects with name and content
- `CompressionLevel` (number, optional): Compression level 0-9 (default: 6)
- `ArchiveName` (string, optional): Output archive name
- `Password` (string, optional): Password protection for archive

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'File Compress',
    Params: [
        { Name: 'Files', Value: [
            { name: 'report.txt', content: 'Report content' },
            { name: 'data.json', content: JSON.stringify(data) }
        ]},
        { Name: 'ArchiveName', Value: 'backup.zip' }
    ],
    ContextUser: currentUser
});
```

### 7. Integration Actions

#### HTTP Request Action

Makes HTTP requests with full control over headers, body, and authentication.

**Class:** `HTTPRequestAction`  
**Registration Name:** `"HTTP Request"`

**Parameters:**
- `URL` (string, required): Request URL
- `Method` (string, optional): HTTP method (default: 'GET')
- `Headers` (object/string, optional): Request headers
- `Body` (any, optional): Request body
- `Timeout` (number, optional): Request timeout in ms (default: 30000)
- `RetryCount` (number, optional): Number of retries (default: 0)
- `BasicAuth` (object, optional): Basic authentication credentials

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'HTTP Request',
    Params: [
        { Name: 'URL', Value: 'https://api.example.com/data' },
        { Name: 'Method', Value: 'POST' },
        { Name: 'Headers', Value: { 'Content-Type': 'application/json' } },
        { Name: 'Body', Value: { query: 'test' } }
    ],
    ContextUser: currentUser
});
```

#### GraphQL Query Action

Executes GraphQL queries and mutations with variable support.

**Class:** `GraphQLQueryAction`  
**Registration Name:** `"GraphQL Query"`

**Parameters:**
- `Endpoint` (string, required): GraphQL endpoint URL
- `Query` (string, required): GraphQL query or mutation
- `Variables` (object/string, optional): Query variables
- `Headers` (object/string, optional): Request headers
- `OperationName` (string, optional): Operation name for multi-operation documents

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'GraphQL Query',
    Params: [
        { Name: 'Endpoint', Value: 'https://api.example.com/graphql' },
        { Name: 'Query', Value: 'query GetUser($id: ID!) { user(id: $id) { name email } }' },
        { Name: 'Variables', Value: { id: '123' } }
    ],
    ContextUser: currentUser
});
```

#### OAuth Flow Action

Handles OAuth 2.0 authentication flows.

**Class:** `OAuthFlowAction`  
**Registration Name:** `"OAuth Flow"`

**Parameters:**
- `Provider` (string, required): OAuth provider name
- `ClientID` (string, required): OAuth client ID
- `ClientSecret` (string, required): OAuth client secret
- `RedirectURI` (string, required): Redirect URI
- `Scopes` (string/array, optional): Required scopes
- `State` (string, optional): State parameter for security

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'OAuth Flow',
    Params: [
        { Name: 'Provider', Value: 'google' },
        { Name: 'ClientID', Value: 'your-client-id' },
        { Name: 'ClientSecret', Value: 'your-client-secret' },
        { Name: 'RedirectURI', Value: 'https://app.example.com/callback' },
        { Name: 'Scopes', Value: ['email', 'profile'] }
    ],
    ContextUser: currentUser
});
```

#### API Rate Limiter Action

Manages API rate limiting with queuing and backoff strategies.

**Class:** `APIRateLimiterAction`  
**Registration Name:** `"API Rate Limiter"`

**Parameters:**
- `APIName` (string, required): API identifier
- `RequestsPerWindow` (number, required): Max requests per time window
- `WindowSizeMs` (number, optional): Time window in ms (default: 60000)
- `QueueRequests` (boolean, optional): Queue excess requests (default: true)
- `MaxQueueSize` (number, optional): Maximum queue size (default: 100)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'API Rate Limiter',
    Params: [
        { Name: 'APIName', Value: 'external-api' },
        { Name: 'RequestsPerWindow', Value: 100 },
        { Name: 'WindowSizeMs', Value: 60000 }
    ],
    ContextUser: currentUser
});
```

### 8. Security Actions

#### Password Strength Action

Evaluates password strength and provides improvement suggestions.

**Class:** `PasswordStrengthAction`  
**Registration Name:** `"Password Strength"`

**Parameters:**
- `Password` (string, required): Password to evaluate
- `MinLength` (number, optional): Minimum required length (default: 8)
- `RequireUppercase` (boolean, optional): Require uppercase letters (default: true)
- `RequireLowercase` (boolean, optional): Require lowercase letters (default: true)
- `RequireNumbers` (boolean, optional): Require numbers (default: true)
- `RequireSpecial` (boolean, optional): Require special characters (default: true)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Password Strength',
    Params: [
        { Name: 'Password', Value: 'MyP@ssw0rd' },
        { Name: 'MinLength', Value: 12 }
    ],
    ContextUser: currentUser
});
```

### 9. Workflow Control Actions

#### Conditional Action

Executes actions based on conditional logic.

**Class:** `ConditionalAction`  
**Registration Name:** `"Conditional"`

**Parameters:**
- `Condition` (string, required): JavaScript expression to evaluate
- `ThenAction` (object, required): Action to run if condition is true
- `ElseAction` (object, optional): Action to run if condition is false
- `Context` (object, optional): Variables available in condition

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Conditional',
    Params: [
        { Name: 'Condition', Value: 'value > 100' },
        { Name: 'Context', Value: { value: 150 } },
        { Name: 'ThenAction', Value: { name: 'Send Email', params: {...} } }
    ],
    ContextUser: currentUser
});
```

#### Loop Action

Executes actions repeatedly with iteration support.

**Class:** `LoopAction`  
**Registration Name:** `"Loop"`

**Parameters:**
- `Items` (array, optional): Array to iterate over
- `Count` (number, optional): Number of iterations (if no items)
- `Action` (object, required): Action to execute for each iteration
- `Parallel` (boolean, optional): Run iterations in parallel (default: false)
- `MaxConcurrency` (number, optional): Max parallel executions (default: 10)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Loop',
    Params: [
        { Name: 'Items', Value: [1, 2, 3, 4, 5] },
        { Name: 'Action', Value: { name: 'Process Item', params: {...} } },
        { Name: 'Parallel', Value: true }
    ],
    ContextUser: currentUser
});
```

#### Parallel Execute Action

Runs multiple actions concurrently with result aggregation.

**Class:** `ParallelExecuteAction`  
**Registration Name:** `"Parallel Execute"`

**Parameters:**
- `Actions` (array, required): Array of actions to execute
- `MaxConcurrency` (number, optional): Maximum concurrent executions (default: 10)
- `StopOnError` (boolean, optional): Stop all if one fails (default: false)
- `Timeout` (number, optional): Overall timeout in ms

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Parallel Execute',
    Params: [
        { Name: 'Actions', Value: [
            { name: 'Web Search', params: { SearchTerms: 'AI' } },
            { name: 'HTTP Request', params: { URL: 'https://api.example.com' } }
        ]},
        { Name: 'MaxConcurrency', Value: 2 }
    ],
    ContextUser: currentUser
});
```

#### Retry Action

Retries failed actions with configurable backoff strategies.

**Class:** `RetryAction`  
**Registration Name:** `"Retry"`

**Parameters:**
- `Action` (object, required): Action to retry
- `MaxRetries` (number, optional): Maximum retry attempts (default: 3)
- `InitialDelay` (number, optional): Initial delay in ms (default: 1000)
- `BackoffMultiplier` (number, optional): Delay multiplier (default: 2)
- `MaxDelay` (number, optional): Maximum delay in ms (default: 30000)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Retry',
    Params: [
        { Name: 'Action', Value: { name: 'HTTP Request', params: {...} } },
        { Name: 'MaxRetries', Value: 5 },
        { Name: 'InitialDelay', Value: 2000 }
    ],
    ContextUser: currentUser
});
```

#### Delay Action

Introduces delays in workflow execution.

**Class:** `DelayAction`  
**Registration Name:** `"Delay"`

**Parameters:**
- `DelayMs` (number, required): Delay duration in milliseconds
- `Jitter` (number, optional): Random jitter to add (0-1, percentage of delay)

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Delay',
    Params: [
        { Name: 'DelayMs', Value: 5000 },
        { Name: 'Jitter', Value: 0.1 } // 10% jitter
    ],
    ContextUser: currentUser
});
```

### 10. Communication Actions

#### Slack Webhook Action

Sends messages to Slack channels via webhooks.

**Class:** `SlackWebhookAction`  
**Registration Name:** `"Slack Webhook"`

**Parameters:**
- `WebhookURL` (string, required): Slack webhook URL
- `Message` (string, required): Message text
- `Channel` (string, optional): Override default channel
- `Username` (string, optional): Override default username
- `IconEmoji` (string, optional): Override default icon
- `Attachments` (array/string, optional): Rich message attachments

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Slack Webhook',
    Params: [
        { Name: 'WebhookURL', Value: 'https://hooks.slack.com/services/...' },
        { Name: 'Message', Value: 'Deployment completed successfully!' },
        { Name: 'IconEmoji', Value: ':rocket:' }
    ],
    ContextUser: currentUser
});
```

#### Teams Webhook Action

Sends messages to Microsoft Teams channels via webhooks.

**Class:** `TeamsWebhookAction`  
**Registration Name:** `"Teams Webhook"`

**Parameters:**
- `WebhookURL` (string, required): Teams webhook URL
- `Title` (string, optional): Message title
- `Text` (string, required): Message text
- `ThemeColor` (string, optional): Message accent color
- `Sections` (array/string, optional): Message sections
- `Actions` (array/string, optional): Interactive actions

**Example Usage:**

```typescript
const result = await ActionEngine.RunAction({
    ActionName: 'Teams Webhook',
    Params: [
        { Name: 'WebhookURL', Value: 'https://outlook.office.com/webhook/...' },
        { Name: 'Title', Value: 'Build Status' },
        { Name: 'Text', Value: 'Build #123 completed successfully' },
        { Name: 'ThemeColor', Value: '00FF00' }
    ],
    ContextUser: currentUser
});
```

### 11. AI Actions

#### Execute AI Prompt Action

Executes AI prompts using MemberJunction's AI framework with model selection and parameter control.

**Class:** `ExecuteAIPromptAction`  
**Registration Name:** `"Execute AI Prompt"`

**Parameters:**
- `PromptID` (string, optional): ID of saved prompt template
- `PromptName` (string, optional): Name of saved prompt template
- `PromptText` (string, optional): Direct prompt text (if not using template)
- `ModelID` (string, optional): Specific AI model ID to use
- `ModelName` (string, optional): Specific AI model name to use
- `Temperature` (number, optional): Model temperature (0-2)
- `MaxTokens` (number, optional): Maximum response tokens
- `Variables` (object/string, optional): Variables to inject into prompt template

**Example Usage:**

```typescript
// Using a saved prompt template
const templateResult = await ActionEngine.RunAction({
    ActionName: 'Execute AI Prompt',
    Params: [
        { Name: 'PromptName', Value: 'Summarize Text' },
        { Name: 'Variables', Value: { text: 'Long article text here...' } },
        { Name: 'Temperature', Value: 0.7 }
    ],
    ContextUser: currentUser
});

// Using direct prompt text
const directResult = await ActionEngine.RunAction({
    ActionName: 'Execute AI Prompt',
    Params: [
        { Name: 'PromptText', Value: 'Explain quantum computing in simple terms' },
        { Name: 'ModelName', Value: 'gpt-4' },
        { Name: 'MaxTokens', Value: 500 }
    ],
    ContextUser: currentUser
});
```

## Special Features

### Dual JSON Parameter Support

Many actions support both JSON object and string inputs for flexibility:
- **JSON Object**: Pass JavaScript objects directly
- **JSON String**: Pass stringified JSON for dynamic content

This applies to actions like JSON Transform, HTTP Request, GraphQL Query, and others with object parameters.

### Error Handling and Recovery

Actions implement various error handling strategies:
- **Graceful Degradation**: Actions continue with partial results when possible
- **Detailed Error Messages**: Clear explanations of what went wrong
- **Retry Logic**: Built-in retry mechanisms for transient failures
- **Validation**: Input validation with helpful error messages

### Performance Considerations

- **Streaming Support**: Large file operations use streaming when possible
- **Batch Processing**: Actions process data in chunks for memory efficiency
- **Parallel Execution**: Workflow actions support concurrent processing
- **Resource Management**: Proper cleanup of resources after execution

```

Always check the `Success` property before proceeding with dependent operations.

## Server-Side Only

This package contains server-side dependencies and should never be imported in client-side code. It relies on:
- Database connections
- File system access
- Server-side API integrations
- Heavy computational processes

For client-side action needs, refer to client-safe action packages in the MemberJunction ecosystem. 