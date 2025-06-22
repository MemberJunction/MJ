# Core Actions Library Expansion Plan

## Overview
This document outlines the implementation plan for expanding the MemberJunction Core Actions library with new utility actions focused on data transformation, file operations, integrations, workflow control, and communications.

## Implementation Status

### Phase 1 - Data & Files (High Priority) ✅
- [x] **CSVParserAction** - Parse CSV with headers, custom delimiters
- [x] **JSONTransformAction** - Transform JSON using JSONPath/JMESPath expressions
- [x] **XMLParserAction** - Parse XML, extract via XPath
- [x] **AggregateDataAction** - Sum, avg, count, group by operations
- [x] **DataMapperAction** - Transform between data structures using Nunjucks templates

### Phase 2 - File Operations
- [ ] **PDFGeneratorAction** - HTML/Markdown to PDF
- [ ] **PDFExtractorAction** - Extract text/pages from PDF
- [ ] **ExcelReaderAction** - Read Excel to JSON
- [ ] **ExcelWriterAction** - Create Excel with sheets/formatting
- [ ] **FileCompressAction** - Zip/unzip operations

### Phase 3 - Integration & Security
- [ ] **HTTPRequestAction** - Generic HTTP client with auth support
- [ ] **GraphQLQueryAction** - Execute GraphQL operations
- [ ] **OAuthFlowAction** - Handle OAuth 2.0 flows
- [ ] **APIRateLimiterAction** - Rate limit any API
- [ ] **PasswordStrengthAction** - Check/generate passwords

### Phase 4 - Workflow Control
- [ ] **ConditionalAction** - If/then/else logic
- [ ] **LoopAction** - Iterate over collections
- [ ] **ParallelExecuteAction** - Run actions in parallel
- [ ] **RetryAction** - Retry with backoff
- [ ] **DelayAction** - Add waits to workflows

### Phase 5 - Communication & AI
- [ ] **SlackWebhookAction** - Post to Slack via webhook
- [ ] **TeamsWebhookAction** - Post to Teams via webhook
- [ ] **ExecuteAIPromptAction** - Run MJ AI prompts

## Detailed Specifications

### Phase 1 - Data & Files

#### CSVParserAction
**Purpose**: Parse CSV data into structured JSON
**Parameters**:
- `CSVData`: String containing CSV data
- `FileID`: UUID of MJ Storage file (alternative to CSVData)
- `FileURL`: URL of CSV file (alternative to CSVData)
- `HasHeaders`: Boolean (default: true)
- `Delimiter`: String (default: ",")
- `QuoteChar`: String (default: '"')
- `EscapeChar`: String (default: '"')
- `SkipEmptyRows`: Boolean (default: true)
- `TrimValues`: Boolean (default: true)
**Output**: Array of objects (if headers) or array of arrays

#### JSONTransformAction
**Purpose**: Transform JSON data using JSONPath or JMESPath
**Parameters**:
- `InputData`: JSON object or array
- `TransformType`: "JSONPath" | "JMESPath" (default: "JSONPath")
- `Expression`: Query expression
- `Multiple`: Boolean - return all matches vs first match
**Output**: Transformed data based on expression

#### XMLParserAction
**Purpose**: Parse XML and extract data using XPath
**Parameters**:
- `XMLData`: String containing XML
- `FileID`: UUID of MJ Storage file (alternative)
- `FileURL`: URL of XML file (alternative)
- `XPathExpression`: XPath query
- `NamespaceMap`: Object mapping prefixes to namespace URIs
- `ReturnType`: "string" | "number" | "boolean" | "node" | "nodes"
**Output**: Extracted data based on XPath

#### AggregateDataAction
**Purpose**: Perform aggregations on data arrays
**Parameters**:
- `InputData`: Array of objects
- `GroupBy`: Field name(s) to group by (optional)
- `Aggregations`: Array of aggregation specs:
  ```json
  {
    "field": "amount",
    "operation": "sum",
    "outputName": "totalAmount"
  }
  ```
- `Operations`: sum, avg, min, max, count, countDistinct, first, last
**Output**: Aggregated results

#### DataMapperAction
**Purpose**: Transform data using Nunjucks templates
**Parameters**:
- `SourceData`: Input object or array
- `MappingTemplate`: Nunjucks template string or object with templates
- `TemplateType`: "string" | "object" (default: "object")
- `IterateArrays`: Boolean - if true, map each array item
- `CustomFilters`: Object with custom Nunjucks filters
**Example**:
```json
{
  "SourceData": { "user": { "firstName": "John", "age": 30 } },
  "MappingTemplate": {
    "fullName": "{{ user.firstName | upper }}",
    "ageGroup": "{% if user.age < 18 %}minor{% else %}adult{% endif %}",
    "greeting": "Hello {{ user.firstName }}!"
  }
}
```
**Output**: Transformed object based on templates

### Phase 2 - File Operations

#### File Input/Output Pattern
All file actions support three input methods:
1. **MJ Storage**: `FileID` parameter (UUID)
2. **URL**: `FileURL` parameter
3. **Direct Data**: `Data` parameter (for input actions)

Priority: FileID > FileURL > Data

#### PDFGeneratorAction
**Purpose**: Generate PDF from HTML or Markdown
**Parameters**:
- `Content`: HTML or Markdown string
- `ContentType`: "html" | "markdown" (default: "html")
- `Options`: PDF generation options (margins, orientation, etc.)
- `OutputFileID`: Optional MJ Storage file ID to save to
**Output**: Base64 PDF data or FileID if saved

#### PDFExtractorAction
**Purpose**: Extract content from PDF files
**Parameters**:
- `FileID`/`FileURL`/`PDFData`: Input PDF
- `ExtractType`: "text" | "metadata" | "pages"
- `PageNumbers`: Array of page numbers (for pages extraction)
- `MergePages`: Boolean - merge text from all pages
**Output**: Extracted content

#### ExcelReaderAction
**Purpose**: Read Excel files into JSON
**Parameters**:
- `FileID`/`FileURL`/`ExcelData`: Input Excel file
- `SheetName`: Specific sheet name (optional, default: first sheet)
- `Range`: A1 notation range (optional)
- `HasHeaders`: Boolean (default: true)
- `DateFormat`: How to format dates (default: ISO)
**Output**: Array of objects or array of arrays

#### ExcelWriterAction
**Purpose**: Create Excel files from data
**Parameters**:
- `Sheets`: Array of sheet definitions:
  ```json
  {
    "name": "Sheet1",
    "data": [...],
    "headers": ["Col1", "Col2"],
    "styles": { ... }
  }
  ```
- `OutputFileID`: Optional MJ Storage file ID
**Output**: Base64 Excel data or FileID

#### FileCompressAction
**Purpose**: Compress/decompress files
**Parameters**:
- `Operation`: "compress" | "decompress"
- `Files`: Array of file inputs (for compress)
- `FileID`/`FileURL`/`Data`: Single file (for decompress)
- `Format`: "zip" | "gzip" | "tar" (default: "zip")
- `OutputFileID`: Optional MJ Storage file ID
**Output**: Compressed/decompressed data or FileID

### Phase 3 - Integration & Security

#### HTTPRequestAction
**Purpose**: Make HTTP requests with full control
**Parameters**:
- `URL`: Target URL
- `Method`: HTTP method (GET, POST, etc.)
- `Headers`: Object with headers
- `Body`: Request body (string or object)
- `BodyType`: "json" | "form" | "text" | "binary"
- `Authentication`: Auth config object
- `Timeout`: Request timeout in ms
- `FollowRedirects`: Boolean (default: true)
- `MaxRedirects`: Number (default: 5)
**Output**: Response object with status, headers, body

#### GraphQLQueryAction
**Purpose**: Execute GraphQL queries/mutations
**Parameters**:
- `Endpoint`: GraphQL endpoint URL
- `Query`: GraphQL query/mutation string
- `Variables`: Variables object
- `Headers`: Additional headers
- `OperationName`: For multi-operation documents
**Output**: GraphQL response data

#### OAuthFlowAction
**Purpose**: Handle OAuth 2.0 authentication flows
**Parameters**:
- `Provider`: OAuth provider name
- `ClientID`: OAuth client ID
- `ClientSecret`: OAuth client secret
- `RedirectURI`: Callback URL
- `Scopes`: Array of scopes
- `FlowType`: "authorization_code" | "client_credentials"
- `State`: Optional state parameter
**Output**: Tokens object (access_token, refresh_token, expires_in)

#### APIRateLimiterAction
**Purpose**: Add rate limiting to any API endpoint
**Parameters**:
- `APIConfig`: Base API configuration (URL, headers, etc.)
- `Request`: Specific request to make
- `RateLimitConfig`:
  ```json
  {
    "maxRequestsPerMinute": 60,
    "maxConcurrent": 5,
    "retryOnRateLimit": true,
    "backoffMs": 1000
  }
  ```
**Output**: API response with rate limit headers

#### PasswordStrengthAction
**Purpose**: Check password strength and generate secure passwords
**Parameters**:
- `Operation`: "check" | "generate"
- `Password`: Password to check (for check operation)
- `Requirements`: Strength requirements object
- `Length`: Password length (for generate)
- `IncludeSymbols`: Boolean
- `IncludeNumbers`: Boolean
- `ExcludeAmbiguous`: Boolean
**Output**: Strength score/details or generated password

### Phase 4 - Workflow Control

#### ConditionalAction
**Purpose**: Execute actions based on conditions
**Parameters**:
- `Condition`: JavaScript expression string
- `Context`: Object with variables for condition
- `TrueAction`: Action config to run if true
- `FalseAction`: Action config to run if false
- `PassthroughContext`: Boolean - pass context to child actions
**Output**: Result from executed action

#### LoopAction
**Purpose**: Iterate over collections executing actions
**Parameters**:
- `Items`: Array to iterate over
- `ItemVariableName`: Variable name for current item
- `IndexVariableName`: Variable name for current index
- `Action`: Action config to execute per item
- `Parallel`: Boolean - run iterations in parallel
- `MaxConcurrent`: Max parallel executions
**Output**: Array of results from each iteration

#### ParallelExecuteAction
**Purpose**: Execute multiple actions in parallel
**Parameters**:
- `Actions`: Array of action configs
- `WaitForAll`: Boolean - wait for all vs first
- `ContinueOnError`: Boolean
- `MaxConcurrent`: Max parallel executions
- `Timeout`: Overall timeout
**Output**: Array of results or first result

#### RetryAction
**Purpose**: Retry failed actions with backoff
**Parameters**:
- `Action`: Action config to execute
- `MaxRetries`: Number of retries
- `RetryDelay`: Initial delay in ms
- `BackoffMultiplier`: Exponential backoff multiplier
- `RetryOn`: Array of error codes to retry on
- `GiveUpOn`: Array of error codes to not retry
**Output**: Result from successful execution

#### DelayAction
**Purpose**: Add delays to workflows
**Parameters**:
- `DelayMs`: Delay in milliseconds
- `DelayType`: "fixed" | "random"
- `MinDelayMs`: For random delays
- `MaxDelayMs`: For random delays
**Output**: Simple success with actual delay

### Phase 5 - Communication & AI

#### SlackWebhookAction
**Purpose**: Send messages to Slack via webhook
**Parameters**:
- `WebhookURL`: Slack webhook URL
- `Message`: Message text
- `Blocks`: Slack block kit blocks
- `Username`: Override username
- `IconEmoji`: Override icon
- `Channel`: Override channel
**Output**: Success confirmation

#### TeamsWebhookAction
**Purpose**: Send messages to Teams via webhook
**Parameters**:
- `WebhookURL`: Teams webhook URL
- `Message`: Message text
- `Card`: Adaptive card JSON
- `Title`: Card title
- `ThemeColor`: Hex color
**Output**: Success confirmation

#### ExecuteAIPromptAction
**Purpose**: Execute MemberJunction AI prompts
**Parameters**:
- `PromptName`: Name of the AI prompt
- `Variables`: Object with prompt variables
- `ModelOverride`: Optional model override
- `TemperatureOverride`: Optional temperature
- `MaxTokensOverride`: Optional max tokens
- `Stream`: Boolean - stream responses
**Output**: AI prompt response

## Implementation Guidelines

1. **Error Handling**: All actions should have comprehensive error handling with specific error codes
2. **Validation**: Input validation using Zod schemas where appropriate
3. **Documentation**: Each action needs JSDoc comments with examples
4. **Testing**: Unit tests for each action
5. **File Handling**: Support both MJ Storage and URLs consistently
6. **Security**: Validate URLs, sanitize inputs, respect permissions
7. **Performance**: Consider rate limiting, caching, and async operations
8. **Consistency**: Follow existing patterns from current actions

## Dependencies to Add

```json
{
  "dependencies": {
    "nunjucks": "^3.2.4",
    "jsonpath-plus": "^7.2.0",
    "jmespath": "^0.16.0",
    "xml2js": "^0.6.2",
    "xpath": "^0.0.33",
    "papaparse": "^5.4.1",
    "pdfkit": "^0.14.0",
    "pdf-parse": "^1.1.1",
    "exceljs": "^4.4.0",
    "archiver": "^6.0.1",
    "node-fetch": "^2.7.0",
    "zxcvbn": "^4.4.2"
  }
}
```

## Next Steps

1. Update package.json with required dependencies
2. Create base classes for common patterns (file handling, etc.)
3. Implement Phase 1 actions
4. Add comprehensive tests
5. Update exports in index.ts
6. Generate documentation