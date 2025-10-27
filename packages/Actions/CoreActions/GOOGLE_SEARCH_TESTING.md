# Google Custom Search Action - Testing Guide

## Configuration Setup

### Option 1: Using mj.config.cjs (Recommended)

Add to your `mj.config.cjs` file:

```javascript
module.exports = {
  // ... other config

  google: {
    customSearch: {
      apiKey: 'YOUR_API_KEY_HERE',  // From Google Cloud Console
      cx: 'YOUR_CX_HERE',             // From Programmable Search Engine
    },
  },

  // ... rest of config
};
```

### Option 2: Using Environment Variables (Fallback)

```bash
export GOOGLE_CUSTOM_SEARCH_API_KEY="YOUR_API_KEY_HERE"
export GOOGLE_CUSTOM_SEARCH_CX="YOUR_CX_HERE"
```

### Getting Credentials

1. **API Key**:
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Create or select a project
   - Enable "Custom Search API"
   - Go to "Credentials" → "Create Credentials" → "API Key"

2. **Search Engine ID (CX)**:
   - Go to [Programmable Search Engine](https://programmablesearchengine.google.com/)
   - Click "Add" to create a new search engine
   - Configure to search the entire web or specific sites
   - Copy the "Search engine ID" (CX)

## Testing the Action

### Test Script

Create a test file `test-google-search.ts`:

```typescript
import { ActionEngineServer } from '@memberjunction/actions';
import { UserInfo } from '@memberjunction/global';

async function testGoogleSearch() {
  const engine = new ActionEngineServer();
  const contextUser = await UserInfo.GetFirstUser();

  const result = await engine.RunAction({
    ActionName: 'Google Custom Search',
    Params: [
      { Name: 'Query', Value: 'MemberJunction open source', Type: 'Input' },
      { Name: 'MaxResults', Value: 5, Type: 'Input' }
    ],
    contextUser
  });

  console.log('Success:', result.Success);
  console.log('Result Code:', result.ResultCode);
  console.log('Message:', result.Message);

  if (result.Success) {
    const data = JSON.parse(result.Message);
    console.log(`\nFound ${data.totalResults} results (showing ${data.items.length}):\n`);
    data.items.forEach((item: any, index: number) => {
      console.log(`${index + 1}. ${item.title}`);
      console.log(`   ${item.link}`);
      console.log(`   ${item.snippet}\n`);
    });
  }
}

testGoogleSearch().catch(console.error);
```

### Run the Test

```bash
cd packages/Actions/CoreActions
npm run build
npx ts-node test-google-search.ts
```

## Expected Results

### Success Response

```json
{
  "Success": true,
  "ResultCode": "SUCCESS",
  "Message": {
    "query": "MemberJunction open source",
    "maxResults": 5,
    "startIndex": 1,
    "totalResults": 12500,
    "searchTime": 0.234,
    "items": [
      {
        "title": "MemberJunction - GitHub",
        "link": "https://github.com/MemberJunction/MJ",
        "displayLink": "github.com",
        "snippet": "MemberJunction is an open-source data platform..."
      }
    ]
  }
}
```

### Error Responses

#### Missing API Key
```json
{
  "Success": false,
  "ResultCode": "MISSING_API_KEY",
  "Message": "Google Custom Search API key not found. Set google.customSearch.apiKey in mj.config.cjs or GOOGLE_CUSTOM_SEARCH_API_KEY environment variable"
}
```

#### Quota Exceeded
```json
{
  "Success": false,
  "ResultCode": "FORBIDDEN",
  "Message": "Google Custom Search quota exceeded or invalid credentials: Quota exceeded for quota metric 'Queries' and limit 'Queries per day' of service 'customsearch.googleapis.com'"
}
```

## Advanced Testing

### Test with Filters

```typescript
const result = await engine.RunAction({
  ActionName: 'Google Custom Search',
  Params: [
    { Name: 'Query', Value: 'quantum computing', Type: 'Input' },
    { Name: 'MaxResults', Value: 10, Type: 'Input' },
    { Name: 'SafeSearch', Value: 'high', Type: 'Input' },
    { Name: 'DateRestrict', Value: 'm6', Type: 'Input' },  // Last 6 months
    { Name: 'FileType', Value: 'pdf', Type: 'Input' },
    { Name: 'Language', Value: 'en', Type: 'Input' }
  ],
  contextUser
});
```

### Test Site-Specific Search

```typescript
const result = await engine.RunAction({
  ActionName: 'Google Custom Search',
  Params: [
    { Name: 'Query', Value: 'typescript best practices', Type: 'Input' },
    { Name: 'SiteSearch', Value: 'github.com', Type: 'Input' },
    { Name: 'SiteSearchFilter', Value: 'include', Type: 'Input' }
  ],
  contextUser
});
```

## Troubleshooting

### Issue: "MISSING_API_KEY" or "MISSING_SEARCH_ENGINE"
- **Cause**: Credentials not configured
- **Solution**: Add credentials to mj.config.cjs or environment variables

### Issue: "FORBIDDEN" or quota exceeded
- **Cause**: Daily quota limit reached (free tier: 100 queries/day)
- **Solution**: Wait until quota resets or upgrade to paid tier

### Issue: "BAD_REQUEST"
- **Cause**: Invalid parameter values
- **Solution**: Check parameter format (e.g., dateRestrict must be 'd[number]', 'w[number]', 'm[number]', 'y[number]')

### Issue: Empty results
- **Cause**: Query too specific or CX configured for specific sites only
- **Solution**: Broaden query or check CX configuration

## Rate Limits & Quotas

- **Free Tier**: 100 queries/day
- **Paid Tier**: 10,000 queries/day ($5 per 1,000 queries after)
- **Rate Limit**: 10 queries/second

## Next Steps

After confirming the action works:
1. Create action metadata in `/metadata/actions/`
2. Sync metadata with `npx mj-sync push`
3. Test action via MJ Explorer UI
4. Associate with Research Agent
