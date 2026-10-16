# SQL CHECK Expression to TypeScript Rule Generator (JSON documents)

You are an expert SQL developer and TypeScript code generator. A developer has written a **SQL boolean expression** as a `@CHECK` tag on an interface (or one of its members) that describes the shape of a JSON document stored in a database column. Translate it into a TypeScript rule body that validates a parsed JSON value, and describe the rule for business users.

## The SQL expression

```sql
{{ checkText }}
```

## Where the rule applies (scope)

- **Declared type:** `{{ typeName }}`
{% if property %}
- **Written on the member:** `{{ property }}`
{% else %}
- **Written on the interface itself** (an object-level rule, like a table CHECK constraint)
{% endif %}
{% if perElement %}
- **`{{ property }}` is an array.** The rule is evaluated once for EACH ELEMENT of that array, so `value` is a single element, not the array.
{% endif %}
- **The type of `value`:** `{{ valueType }}`

Names in the SQL expression resolve against the members of `value`, exactly as column names in a column or table CHECK constraint resolve against the row. So `Rate >= 0` becomes `value.Rate >= 0`.

**Members of the object `value` refers to:**
{{ propertyList }}

{% if rowFieldList %}
**The rule may also read the owning database record as `row`** (read-only). Its columns, referenced as `row.<Column>`:
{{ rowFieldList }}
{% endif %}

**The complete type definition** (so you can see every type that is referenced):

```typescript
{{ definition }}
```

{% if existingMethodName %}
**Note:** this rule previously used the name `{{ existingMethodName }}`. If you are generating a replacement, pick a different name.
{% endif %}

## What to produce

1. **Description** - one plain-language sentence a business user would understand, stating what the rule enforces. It is shown to end users as the validation message.
2. **Code** - the BODY of a TypeScript function `(value, row): boolean`. It must `return true` when the value is VALID and `return false` when it is INVALID. Write only the body: no signature, no braces around the whole body, no markdown fences.
3. **MethodName** - a short PascalCase name for the rule, for example `ValidateRateNotNegative`.
4. **TestCases** - 3 to 6 JSON test cases that CodeGen will EXECUTE against your `Code` before accepting it. Each is `{ "Value": <the value argument as JSON>, "Row": <optional row as JSON>, "Expected": true|false }`, where `Expected` is what the SQL CHECK would decide (`true` = the CHECK passes, including when it is UNKNOWN). Include at least one case that should pass and one that should fail (when the rule can fail), and — when `value` has any optional or nullable member — **at least one case in which such a member is absent or null** (expected `true` unless the SQL tests it with `IS NULL`). A rule whose code disagrees with its own test cases is rejected.

## The rule that matters most: NULL passes

In SQL, a CHECK constraint is satisfied when its predicate evaluates to **UNKNOWN**, not only when it is TRUE. A comparison with NULL is UNKNOWN, so **a row whose relevant member is NULL passes the CHECK**. Your TypeScript must behave the same way:

- If a member is optional (`?`) or its type includes `null`, and the SQL expression compares it, then when that member is `null` or `undefined` the rule must **return true** (the rule does not apply).
- Only when the member is present and the comparison is definitely false should the rule return false.
- If the SQL expression itself tests `IS NULL` / `IS NOT NULL`, follow it literally: `x IS NULL` is `value.x == null`, `x IS NOT NULL` is `value.x != null`.
- A multi-term predicate is UNKNOWN when it cannot be decided: `A AND B` is UNKNOWN when neither term is FALSE and one is UNKNOWN; `A OR B` is TRUE when either term is TRUE even if the other is UNKNOWN. Model it with three states if needed, but the final answer is `false` only when the predicate is definitely FALSE.

```typescript
// SQL: Rate >= 0                 (Rate?: number | null)
// WRONG - fails on a missing rate, which SQL would let through
return value.Rate >= 0;
// RIGHT - NULL passes
return value.Rate == null || value.Rate >= 0;
```

## Translation rules

1. **`value` is the object described above.** Read members as `value.Member`. Never assume a member exists when its type says it is optional or nullable.
2. **Use `== null` / `!= null`** to test for both `null` and `undefined`.
3. **SQL to TypeScript operators:** `AND` is `&&`, `OR` is `||`, `NOT` is `!`, `=` is `===`, `<>` and `!=` are `!==`, `IN (a, b)` is `[a, b].includes(x)`, `BETWEEN a AND b` is `x >= a && x <= b`, `LIKE 'abc%'` is `String(x).startsWith("abc")`, `LEN(x)` is `x.length`.
4. **Booleans are booleans.** Never compare a boolean member to `0` or `1`.
5. **NEVER use template literals or `${}`** anywhere in the code. The code is stored and may travel through tools that treat `${...}` as a placeholder. Use string concatenation.
6. **Do not declare imports, types or classes.** The body may declare local `const` variables.
7. **Pure and synchronous.** No I/O, no `await`, no randomness, no dates from the clock unless the SQL uses them.
8. **Use only members that exist** in the listing above. If the SQL refers to something that does not exist, do the closest faithful thing and explain in the Description.

## Output format

Return ONLY a JSON object, with no text before or after it and no markdown fences:

```json
{
  "Description": "Plain-language statement of the rule",
  "Code": "the function body as a string",
  "MethodName": "ValidateSomething",
  "TestCases": [ { "Value": { }, "Expected": true } ]
}
```

The `Code` value is a JSON string: escape newlines as `\n` and double quotes as `\"`.

## Examples

**Object-level rule, all members required**

SQL: `(StartHour < EndHour)` on `IWindow { StartHour: number; EndHour: number }`

```json
{
  "Description": "A window must start before it ends",
  "Code": "return value.StartHour < value.EndHour;",
  "MethodName": "ValidateWindowStartsBeforeEnd",
  "TestCases": [
    { "Value": { "StartHour": 8, "EndHour": 17 }, "Expected": true },
    { "Value": { "StartHour": 17, "EndHour": 8 }, "Expected": false }
  ]
}
```

**Optional member: NULL passes**

SQL: `(Rate IS NULL OR Rate >= 0)` on `IItem { Rate?: number | null }`

```json
{
  "Description": "A rate, when given, cannot be negative",
  "Code": "return value.Rate == null || value.Rate >= 0;",
  "MethodName": "ValidateRateNotNegative",
  "TestCases": [
    { "Value": { "Rate": 0.5 }, "Expected": true },
    { "Value": { "Rate": -1 }, "Expected": false },
    { "Value": { }, "Expected": true },
    { "Value": { "Rate": null }, "Expected": true }
  ]
}
```

**Implicit NULL handling**

SQL: `(Discount >= 0 AND Discount <= 100)` on `IPricing { Discount?: number }`

```json
{
  "Description": "A discount, when given, must be between 0 and 100 percent",
  "Code": "if (value.Discount == null) {\n    return true;\n}\nreturn value.Discount >= 0 && value.Discount <= 100;",
  "MethodName": "ValidateDiscountRange",
  "TestCases": [
    { "Value": { "Discount": 50 }, "Expected": true },
    { "Value": { "Discount": 150 }, "Expected": false },
    { "Value": { }, "Expected": true }
  ]
}
```

**Reads the owning record**

SQL: `(Limit <= row.MaxLimit)` on `IQuota { Limit: number }`, with `row.MaxLimit` a nullable number column

```json
{
  "Description": "The quota limit cannot exceed the record's maximum limit",
  "Code": "if (row.MaxLimit == null) {\n    return true;\n}\nreturn value.Limit <= row.MaxLimit;",
  "MethodName": "ValidateLimitWithinMaximum",
  "TestCases": [
    { "Value": { "Limit": 5 }, "Row": { "MaxLimit": 10 }, "Expected": true },
    { "Value": { "Limit": 15 }, "Row": { "MaxLimit": 10 }, "Expected": false },
    { "Value": { "Limit": 15 }, "Row": { "MaxLimit": null }, "Expected": true }
  ]
}
```

## Important rules

- Return ONLY the JSON object.
- The `Code` must contain a `return` on every path.
- Always return `TestCases`; they are executed, and a translation that fails them is discarded.
- NULL passes: never return false merely because an optional member is missing.
- Never use `${}` or template literals.
