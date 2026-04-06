# Vector Sync
- When I created a entity doc for vector sync before an idnex was created it created a new incex on the fly for that doc, not desired. It should have stopped and asked for that config step to be done first.
- When creating a new vector index, it did NOT create it in Pinecone at all. It looks like it worked in the context of MJ Vector Index table, BUT it didn't create an index in pinecone
- Even so, it looked like the sync worked, but it didn't actually sync as the vector index didn't exist in pinecone. Strange we didn't get erros for this
- After creating vector index, the new entity doc dialog didn't pick it up and show new index - still said no vector indexes. 
- Are we using engine for all cached info on entity docs and vector db/index from KH engine? noticed some stale data in server even after I updated things in the UI.
- It appears we are hardcoding the vector index to always pull the latest one even when entity doc points to a different one. After changing to mj-knowledge-index for the index, it still was trying to upsert to the generated one. Error here:

```log
PineconeNotFoundError: A call to https://api.pinecone.io/indexes/Vector%20Index%20for%20entityDocument%20CDB135CC-6D3C-480B-90AE-25B7805F82C1 returned HTTP status 404.
    at mapHttpStatusError (/Users/amith/Dropbox/develop/M5/MJ/node_modules/@pinecone-database/pinecone/dist/errors/http.js:183:20)
    at /Users/amith/Dropbox/develop/M5/MJ/node_modules/@pinecone-database/pinecone/dist/errors/handling.js:65:69
    at step (/Users/amith/Dropbox/develop/M5/MJ/node_modules/@pinecone-database/pinecone/dist/errors/handling.js:33:23)
    at Object.next (/Users/amith/Dropbox/develop/M5/MJ/node_modules/@pinecone-database/pinecone/dist/errors/handling.js:14:53)
    at fulfilled (/Users/amith/Dropbox/develop/M5/MJ/node_modules/@pinecone-database/pinecone/dist/errors/handling.js:5:58)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5) {name: 'PineconeNotFoundError', cause: undefined, stack: 'PineconeNotFoundError: A call to https://api.…ons (node:internal/process/task_queues:104:5)', message: 'A call to https://api.pinecone.io/indexes/Ve…-90AE-25B7805F82C1 returned HTTP status 404.'}
```

note, after wiping db and only having one vector index, all works, so clearly this is an issue hyper focus on this!


# Search
- Home search screen shows way too many popular tags, should be limited to maybe top 5 or 10 and also have tags sized based on relative use or something to make more visually itneresting? 
- The "See similar items" feature is great, but when it gets clicked on need to clear the filters or we often won't see proper results
- Changing relevance to a higher % should be client side relative to original server search as it is a narrowing function. But changing relevance to a lower % should trigger redoing on server. And on the slideing scale for relevance we should show stylishly below it the max/min and total counts for matches on server side 

# Clusters
- appear to be saved in local storage, i wiped index db and had brand new DB install but still had stuff from prior env in the brwoser. Bad, propse new structure for this.
- Also do a complete repo scan to see if we use browser local stroage anywhere else

# Classify
- Pipeline UI - hard to see the source name - make it clearer and maybe group recent processing by it or otherwise highlight, also should show MOST recent first in that list and make it scrollable and pageable to see as far back as user wants to go. And searchable
- if I start the app on Classify, Content Types, Tag Lib etc they don't properly show data, they appear blank. If i then go to another tab and come back they load. Seems like timing related, they shoudl all await for their data to be ready to display and show mj-loading until. Fix this.

# Duplicates
- Right now it appears we're not allowed to run dupes on entities that don't have merging turned on. But we don't want that, we want to simply notify the user that merging won't be available but they can run dupe detection. 
- Fix this - I asked for this before and it was forgotten. Styling warning message so they don't get annoyed later, but let em do the dupe detect process!

# Tree Dropdown in ng-trees package
- When the drop down is selected we should put focus on the search text box so user can type to search without having to click first
- Make so that if no node found it doesn't blow up browser when type search, this happens in embedding model selection for some raeason we only show vendor nodes but don't show models (setting up new content type)

# General
Upon loading KH app we get this error, trace and fix, probably an engine or other RunView call
```log
operationName =
'RunViewsQuery'
variables =
{input: Array(2)}
input =
(2) [{…}, {…}]
0 =
{EntityName: 'MJ: Knowledge Hub Saved Searches', ExtraFilter: '', OrderBy: '__mj_CreatedAt DESC', UserSearchString: '', Fields: Array(11), …}
1 =
{EntityName: 'MJ: Tags', ExtraFilter: '', OrderBy: 'UsageCount DESC', UserSearchString: '', Fields: Array(1), …}
length =
2
[[Prototype]] =
Array(0)
[[Prototype]] =
Object
[[Prototype]] =
Object
[[Prototype]] =
Object
Error: Error executing SQL
logging.ts:293
    Error: Invalid column name 'UsageCount'.
logging.ts:293
    Query: SELECT TOP 8 [ID],[DisplayName] FROM [__mj].[vwTags] ORDER BY UsageCount DESC
logging.ts:293
    Parameters: None
```

# Analytics
- The analytics tab, if you click on tag cooccurence tab and nthing there it has a screen that takes up entire browser and renders app dead if nothing there yet, size this to fit tab properly


# Optimizations
- Noticed this in the run logs, make sure we're using our engine classes in your code for metadata that can be cahced.

```log
[Autotag] Recomputing tag co-occurrence after pipeline completion...
logging.ts:295
💡 [Telemetry/Optimization] Entity Already in Engine
telemetryManager.ts:1367
   RunView for "MJ: Tagged Items" called, but this entity is already loaded by: TagEngineBase
telemetryManager.ts:1367
   💡 Consider using TagEngineBase cached data instead of a separate RunView call
```


# Tag Deduplication / Taxonomy
- **ResolveTag mutex not serializing**: Server was restarted with latest build but tags still created at identical milliseconds (e.g., "AI Agent" ×2 at same ms, "Knowledge Management" ×5 within 200ms). Proves the promise-chain mutex isn't working. Investigate: (1) is the promise chain on `_resolveTagQueue` actually serializing concurrent calls? (2) is ResolveTag even the code path creating all tags, or does TagEngineBase.CreateTag get called directly elsewhere? (3) add logging inside resolveTagInner to confirm mutex entry/exit ordering
- **Fuzzy match gap**: "AI Agent" and "AI Agents" plural pair not caught by normalizer — verify `normalizeTagName` strips trailing 's' from multi-word tags like "AI Agents" → "AI Agent"
- **MJTagEntityServer embedding sync**: Created server entity subclass that overrides Save/Delete to keep TagEngine vector service in sync. Verify it's being picked up by ClassFactory (registration priority) and that embeddings are actually added on each Save
- **Remove Tagged Items from TagEngineBase**: TagEngineBase bulk-loads ALL TaggedItems into memory via BaseEngine config. This will be massive at scale. Should not be cached in engine. Also check CacheLocal setting on all TaggedItem RunViews

# Duplicates
- Right now it appears we're not allowed to run dupes on entities that don't have merging turned on. But we don't want that, we want to simply notify the user that merging won't be available but they can run dupe detection. 
- Fix this - I asked for this before and it was forgotten. Styling warning message so they don't get annoyed later, but let em do the dupe detect process!
- **Merge warning UX**: The warning dialog already exists in code but feels like a blocker — consider replacing the modal with an inline banner so detection starts immediately without a confirmation step
- **Dropdown + button unresponsive**: Controls don't respond until full LoadData completes. EntityDocuments populated at line 380 but detectChanges only fires at line 393 after heavy RunViews batch. Move entity doc population + detectChanges earlier so controls are interactive immediately
- **Progress bar loops**: Shows 100% then resets to 0% repeatedly, alternating "Querying Database" and "Analyzing matches". Investigate progress subscription logic for cycling/duplicate events during detection run
- **Provider re-initialization per record (perf + memory)**: Dupe detection re-initializes providers on every iteration instead of once. Log shows "Providers initialized: AI Model=OpenAIEmbedding, VectorDB=PineconeDatabase, Index=mj-knowledge-index" repeated, "MJ: Vector Indexes" queried 92 times with 4 filter combos, "MJ: AI Models" queried 10 times identically. entityVectorSync.GetOrCreateVectorIndex and provider init should be done ONCE and reused. Use KH engine cached VectorIndexes and AIEngine cached Models. Likely source of memory issues too.
- **Reconnect on return renders UI useless**: After starting a dupe run, if you navigate away and come back, the UI tries to "reconnect" to the previous run even if it failed. This locks the UI in a detecting state with no way out. Should check run status before reconnecting — if failed/completed, don't reconnect, just show results.

# Pipeline UI
- **UI staleness after batch completion**: Pipeline UI doesn't auto-refresh after batch 2 completes — items show blue "in progress" circles even though DB shows all 32 items as Complete. Requires manual page refresh. Investigate WebSocket/subscription notification gap
- **No retry/backoff on LLM rate limit errors**: When multiple pipeline jobs run concurrently and hit rate limits (e.g., Gemini 429 RESOURCE_EXHAUSTED with "retry in 1.9s"), the pipeline doesn't back off and retry — it just fails the item. Need exponential backoff with retry (respect the `retryDelay` from the API response). The existing `RateLimiter` class handles pre-request throttling but doesn't handle post-failure retry. Also consider: should we prevent multiple concurrent pipeline runs entirely, or queue them?

# Record Form / Tags
- Should we allow users to manually add/remove tags? If so we need to think about how automated tagging interacts, overrides, respect, etc. let's think about this and discuss! 