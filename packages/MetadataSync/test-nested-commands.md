# Test Cases for Nested @ Commands

## Test 1: Simple @parent in @lookup
```json
{
  "DestinationStepID": "@lookup:MJ: AI Agent Steps.Name=Step 2(a): Get Weather&AgentID=@parent:ID"
}
```
This should resolve @parent:ID first, then use that value in the lookup.

## Test 2: Multiple nested @ commands
```json
{
  "Field1": "@lookup:Entity.Name=@root:Name&Code=@parent:Code"
}
```
Both @root:Name and @parent:Code should be resolved before the lookup.

## Test 3: Nested @file in @lookup
```json
{
  "ConfigID": "@lookup:Configs.Name=@file:config-name.txt"
}
```
Should read the file content first, then use it in the lookup.

## Test 4: Create with nested @ commands
```json
{
  "RecordID": "@lookup:Records.Code=ABC123?create&Name=@parent:Name&Description=@root:Description"
}
```
The create fields should also have their @ commands resolved.

## Test 5: Deep nesting with environment variables
```json
{
  "ID": "@lookup:Items.Environment=@env:NODE_ENV&User=@parent:UserName"
}
```
Should resolve environment variable and parent reference before lookup.

## Implementation Notes
- Maximum recursion depth: 50 levels
- All @ command types are supported within @lookup
- Works in both lookup criteria and create fields
- Maintains backward compatibility