# Phase 3 Testing Guide - CLI Commands

This guide provides detailed CLI commands to test all Phase 3 features of the MCP Server.

## Prerequisites

1. **MCP Server Running**: Ensure the server is running on port 3100
   ```bash
   cd /Users/hayderhamandi/Projects/MJ/MJ/packages/AI/MCPServer
   npm run start
   ```

2. **CodeGen Required**: Before testing rate limit CLI options, run CodeGen to update APIKeyEntity
   ```bash
   cd /Users/hayderhamandi/Projects/MJ/MJ
   npm run codegen
   ```

## Test 1: Scope-Based Tool Filtering

### Step 1: Generate API Keys with Different Scopes

```bash
# Navigate to MCPServer directory
cd /Users/hayderhamandi/Projects/MJ/MJ/packages/AI/MCPServer

# Generate read-only API key
node dist/api-key-cli.js generate \
  --name "Test Read Only" \
  --scopes "entities:read" \
  --expires-in-days 30

# Save the key output (mj_sk_...) - you'll need it for testing

# Generate write-enabled API key
node dist/api-key-cli.js generate \
  --name "Test Read Write" \
  --scopes "entities:read,entities:write" \
  --expires-in-days 30

# Save this key too

# Generate admin API key
node dist/api-key-cli.js generate \
  --name "Test Admin" \
  --scopes "admin:*" \
  --expires-in-days 30

# Save this key as well
```

### Step 2: Test Tool Filtering with curl

Replace `YOUR_API_KEY_HERE` with the actual keys generated above.

#### Test Read-Only Key (should work):
```bash
# Test Get_Users_Record tool (requires entities:read scope)
curl -X POST http://localhost:3100/mcp \
  -H "Authorization: Bearer YOUR_READ_ONLY_KEY_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "Get_Users_Record",
      "arguments": {
        "ID": "some-user-id"
      }
    }
  }'
```

#### Test Read-Only Key (should fail):
```bash
# Test Create_Users_Record tool (requires entities:write scope)
curl -X POST http://localhost:3100/mcp \
  -H "Authorization: Bearer YOUR_READ_ONLY_KEY_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "Create_Users_Record",
      "arguments": {
        "Name": "Test User",
        "Email": "test@example.com"
      }
    }
  }'
```

Expected: Should fail with error about tool not found or unauthorized

#### Test Write-Enabled Key (should work):
```bash
# Test Create_Users_Record tool with write-enabled key
curl -X POST http://localhost:3100/mcp \
  -H "Authorization: Bearer YOUR_READ_WRITE_KEY_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "Create_Users_Record",
      "arguments": {
        "Name": "Test User",
        "Email": "test@example.com"
      }
    }
  }'
```

#### Test Admin Key (should work for everything):
```bash
# Admin key should have access to all tools
curl -X POST http://localhost:3100/mcp \
  -H "Authorization: Bearer YOUR_ADMIN_KEY_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "tools/call",
    "params": {
      "name": "Get_Users_Record",
      "arguments": {
        "ID": "some-user-id"
      }
    }
  }'
```

### Step 3: Verify Tool Filtering in Server Logs

Check the server output for log messages:
```bash
tail -f /tmp/claude/-Users-hayderhamandi-Projects-MJ-MJ/tasks/b071669.output | grep "filtered out"
```

You should see messages like:
```
Tool Create_Users_Record filtered out - user lacks required scopes
```

## Test 2: Rate Limiting

### Step 1: Generate API Key with Custom Rate Limit

```bash
# Generate key with very low rate limit for easy testing
# Note: Requires CodeGen to be run first
node dist/api-key-cli.js generate \
  --name "Test Rate Limit - 5 per minute" \
  --scopes "entities:read" \
  --rate-limit 5 \
  --rate-window 60 \
  --expires-in-days 7

# Save the generated key
```

### Step 2: Test Rate Limiting with Rapid Requests

Create a test script to make rapid requests:

```bash
# Create a test script
cat > /tmp/test-rate-limit.sh << 'EOF'
#!/bin/bash

API_KEY="$1"
if [ -z "$API_KEY" ]; then
  echo "Usage: $0 <api-key>"
  exit 1
fi

echo "Testing rate limit with 10 rapid requests..."
echo "Expected: First 5 succeed, remaining 5 fail with 429"
echo ""

for i in {1..10}; do
  echo "Request $i:"
  response=$(curl -s -w "\nHTTP_CODE:%{http_code}\n" -X POST http://localhost:3100/mcp \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{
      "jsonrpc": "2.0",
      "id": '$i',
      "method": "tools/call",
      "params": {
        "name": "Get_Users_Record",
        "arguments": {
          "ID": "test-id-'$i'"
        }
      }
    }')

  http_code=$(echo "$response" | grep "HTTP_CODE:" | cut -d: -f2)
  echo "  Status: $http_code"

  if [ "$http_code" = "429" ]; then
    echo "  ✅ Rate limit triggered!"
  fi

  echo ""
  sleep 0.1
done
EOF

chmod +x /tmp/test-rate-limit.sh

# Run the test
/tmp/test-rate-limit.sh YOUR_RATE_LIMITED_KEY_HERE
```

### Step 3: Verify Rate Limit Reset

Wait 60 seconds and test again:
```bash
echo "Waiting 60 seconds for rate limit window to reset..."
sleep 60

echo "Testing after reset - should succeed again:"
curl -X POST http://localhost:3100/mcp \
  -H "Authorization: Bearer YOUR_RATE_LIMITED_KEY_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 100,
    "method": "tools/call",
    "params": {
      "name": "Get_Users_Record",
      "arguments": {
        "ID": "test-reset"
      }
    }
  }'
```

### Step 4: Check Rate Limit in Server Logs

```bash
tail -20 /tmp/claude/-Users-hayderhamandi-Projects-MJ-MJ/tasks/b071669.output
```

Look for:
- Rate limit check logs
- 429 error responses
- "Rate limit exceeded" messages

## Test 3: Usage Logging

### Step 1: Verify Usage Logs are Created

```bash
# Make a few requests with any API key
curl -X POST http://localhost:3100/mcp \
  -H "Authorization: Bearer YOUR_API_KEY_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "Get_Users_Record",
      "arguments": {
        "ID": "test-id"
      }
    }
  }'
```

### Step 2: Query Usage Logs (via MJ Explorer or SQL)

```sql
-- Check recent API key usage logs
SELECT TOP 20
    APIKeyID,
    OperationName,
    StatusCode,
    ResponseTimeMs,
    ErrorMessage,
    RequestTimestamp
FROM [__mj].[vwAPIKeyUsageLogs]
ORDER BY RequestTimestamp DESC;
```

### Step 3: Verify Rate Limit Denials are Logged

After triggering rate limits, check for 429 status codes:
```sql
SELECT
    APIKeyID,
    OperationName,
    StatusCode,
    ErrorMessage,
    RequestTimestamp
FROM [__mj].[vwAPIKeyUsageLogs]
WHERE StatusCode = 429
ORDER BY RequestTimestamp DESC;
```

## Test 4: API Key Management CLI

### List All API Keys
```bash
node dist/api-key-cli.js list
```

### View Specific API Key Details
```bash
node dist/api-key-cli.js view --key-id "YOUR_KEY_ID_HERE"
```

### Revoke an API Key
```bash
node dist/api-key-cli.js revoke --key-id "YOUR_KEY_ID_HERE"
```

### Verify Revoked Key Fails
```bash
curl -X POST http://localhost:3100/mcp \
  -H "Authorization: Bearer YOUR_REVOKED_KEY_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "Get_Users_Record",
      "arguments": {
        "ID": "test"
      }
    }
  }'
```

Expected: 401 Unauthorized response

## Test 5: Combined Scenario Testing

### Scenario A: Read-Only User with Rate Limit
```bash
# Generate key with read-only scope and moderate rate limit
node dist/api-key-cli.js generate \
  --name "Read Only Limited" \
  --scopes "entities:read" \
  --rate-limit 100 \
  --rate-window 3600 \
  --expires-in-days 30

# Test multiple read operations (should work)
for i in {1..5}; do
  curl -s -X POST http://localhost:3100/mcp \
    -H "Authorization: Bearer YOUR_KEY_HERE" \
    -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":$i,\"method\":\"tools/call\",\"params\":{\"name\":\"Get_Users_Record\",\"arguments\":{\"ID\":\"test-$i\"}}}"
  echo ""
done

# Test write operation (should fail due to scope)
curl -X POST http://localhost:3100/mcp \
  -H "Authorization: Bearer YOUR_KEY_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 6,
    "method": "tools/call",
    "params": {
      "name": "Create_Users_Record",
      "arguments": {
        "Name": "Test"
      }
    }
  }'
```

### Scenario B: Admin User with No Rate Limit
```bash
# Generate admin key with high rate limit
node dist/api-key-cli.js generate \
  --name "Admin Unlimited" \
  --scopes "admin:*" \
  --rate-limit 10000 \
  --rate-window 3600 \
  --expires-in-days 90

# Test rapid admin operations (all should work)
for i in {1..20}; do
  curl -s -X POST http://localhost:3100/mcp \
    -H "Authorization: Bearer YOUR_ADMIN_KEY_HERE" \
    -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":$i,\"method\":\"tools/call\",\"params\":{\"name\":\"Get_Users_Record\",\"arguments\":{\"ID\":\"test-$i\"}}}" \
    > /dev/null
  echo "Request $i completed"
done
```

## Test 6: Performance Testing

### Test Rate Limit Cache Performance
```bash
# Create a performance test script
cat > /tmp/test-cache-performance.sh << 'EOF'
#!/bin/bash

API_KEY="$1"
NUM_REQUESTS=100

echo "Testing cache performance with $NUM_REQUESTS requests..."
start_time=$(date +%s%N)

for i in $(seq 1 $NUM_REQUESTS); do
  curl -s -X POST http://localhost:3100/mcp \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":$i,\"method\":\"tools/call\",\"params\":{\"name\":\"Get_Users_Record\",\"arguments\":{\"ID\":\"test-$i\"}}}" \
    > /dev/null
done

end_time=$(date +%s%N)
elapsed_ms=$(( (end_time - start_time) / 1000000 ))
avg_ms=$(( elapsed_ms / NUM_REQUESTS ))

echo ""
echo "Results:"
echo "  Total time: ${elapsed_ms}ms"
echo "  Average per request: ${avg_ms}ms"
echo "  Expected: Rate limit check adds <1ms overhead per request"
EOF

chmod +x /tmp/test-cache-performance.sh

# Run performance test
/tmp/test-cache-performance.sh YOUR_API_KEY_HERE
```

## Monitoring & Debugging

### Watch Server Logs in Real-Time
```bash
tail -f /tmp/claude/-Users-hayderhamandi-Projects-MJ-MJ/tasks/b071669.output
```

### Check for Errors
```bash
tail -100 /tmp/claude/-Users-hayderhamandi-Projects-MJ-MJ/tasks/b071669.output | grep -i error
```

### Monitor Rate Limit Activity
```bash
tail -f /tmp/claude/-Users-hayderhamandi-Projects-MJ-MJ/tasks/b071669.output | grep -i "rate limit"
```

### Monitor Scope Filtering
```bash
tail -f /tmp/claude/-Users-hayderhamandi-Projects-MJ-MJ/tasks/b071669.output | grep -i "filtered out"
```

## Expected Results Summary

### Scope Filtering
- ✅ Read-only keys can only access Get_*_Record tools
- ✅ Write keys can access both Get_* and Create_/Update_/Delete_* tools
- ✅ Admin keys have access to all tools
- ✅ Tools outside user's scope are invisible (not listed in tools/list)

### Rate Limiting
- ✅ Requests beyond limit return 429 status code
- ✅ Error message includes reset time and limit details
- ✅ Rate limit resets after window expires
- ✅ Each API key has independent rate limit tracking
- ✅ Rate limit checks complete in <1ms (cached)

### Usage Logging
- ✅ All requests logged to MJ: API Key Usage Logs
- ✅ Logs include timestamp, operation, status code, response time
- ✅ Failed requests (including 429) are logged with error messages
- ✅ Usage data available for analytics and monitoring

## Troubleshooting

### Problem: Rate limit CLI options not working
**Solution**: Run CodeGen first to update APIKeyEntity with new fields
```bash
cd /Users/hayderhamandi/Projects/MJ/MJ
npm run codegen
```

### Problem: Tools not being filtered
**Check**: Verify scopes are properly set on the API key
```bash
node dist/api-key-cli.js view --key-id "YOUR_KEY_ID"
```

### Problem: Rate limits not enforcing
**Check**: Verify RateLimitRequests and RateLimitWindowSeconds are set in database
```sql
SELECT ID, Name, RateLimitRequests, RateLimitWindowSeconds
FROM [__mj].APIKey
WHERE ID = 'YOUR_KEY_ID';
```

### Problem: Server not starting
**Check**: Ensure port 3100 is available
```bash
lsof -ti:3100
```

## Clean Up Test Data

After testing, you can remove test API keys:
```bash
# List all keys
node dist/api-key-cli.js list

# Revoke test keys
node dist/api-key-cli.js revoke --key-id "TEST_KEY_ID_1"
node dist/api-key-cli.js revoke --key-id "TEST_KEY_ID_2"
# ... etc
```

## Next Steps

1. **Production Deployment**: See [TLS_DEPLOYMENT.md](docs/TLS_DEPLOYMENT.md) for HTTPS setup
2. **Monitoring**: Set up alerts for 429 responses and unusual usage patterns
3. **Tuning**: Adjust rate limits based on actual usage patterns
4. **Documentation**: Share API key usage guidelines with API consumers
