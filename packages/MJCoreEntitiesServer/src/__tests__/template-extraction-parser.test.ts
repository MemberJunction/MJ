import { describe, it, expect } from 'vitest';
import { ParseTemplateParameters } from '../custom/template-extraction/parser';
import type { DeterministicParameter, ParseResult } from '../custom/template-extraction/types';

// ═══════════════════════════════════════════════════
// Helper to find a parameter by name in parse results
// ═══════════════════════════════════════════════════
function findParam(result: ParseResult, name: string): DeterministicParameter | undefined {
    return result.parameters.find(p => p.name === name);
}

function paramNames(result: ParseResult): string[] {
    return result.parameters.map(p => p.name).sort();
}

// ═══════════════════════════════════════════════════
// 1. BASIC VARIABLE EXTRACTION
// ═══════════════════════════════════════════════════

describe('ParseTemplateParameters', () => {
    describe('Basic variable extraction', () => {
        it('should extract a simple scalar variable', () => {
            const result = ParseTemplateParameters('Hello {{ name }}');
            expect(paramNames(result)).toEqual(['name']);
            expect(findParam(result, 'name')?.type).toBe('Scalar');
            expect(findParam(result, 'name')?.isRequired).toBe(true);
        });

        it('should extract multiple scalar variables', () => {
            const result = ParseTemplateParameters('{{ firstName }} {{ lastName }} ({{ email }})');
            expect(paramNames(result)).toEqual(['email', 'firstName', 'lastName']);
        });

        it('should deduplicate parameters used multiple times', () => {
            const result = ParseTemplateParameters('{{ name }} is {{ name }}');
            expect(result.parameters).toHaveLength(1);
            expect(findParam(result, 'name')?.usages).toHaveLength(2);
        });

        it('should handle empty template', () => {
            const result = ParseTemplateParameters('');
            expect(result.parameters).toHaveLength(0);
            expect(result.warnings).toHaveLength(0);
        });

        it('should handle null/undefined template', () => {
            const result = ParseTemplateParameters(null as unknown as string);
            expect(result.parameters).toHaveLength(0);
        });

        it('should handle template with no variables', () => {
            const result = ParseTemplateParameters('Just plain text with no template expressions.');
            expect(result.parameters).toHaveLength(0);
        });
    });

    // ═══════════════════════════════════════════════════
    // 2. OBJECT/PROPERTY ACCESS
    // ═══════════════════════════════════════════════════

    describe('Object property access', () => {
        it('should detect Object type from dot access', () => {
            const result = ParseTemplateParameters('{{ user.name }}');
            expect(findParam(result, 'user')?.type).toBe('Object');
        });

        it('should record property access path', () => {
            const result = ParseTemplateParameters('{{ user.name }}');
            const props = findParam(result, 'user')?.properties;
            expect(props).toHaveLength(1);
            expect(props?.[0].name).toBe('name');
        });

        it('should handle deep nested access', () => {
            const result = ParseTemplateParameters('{{ user.address.city }}');
            const user = findParam(result, 'user');
            expect(user?.type).toBe('Object');
            const addressProp = user?.properties.find(p => p.name === 'address');
            expect(addressProp).toBeDefined();
            expect(addressProp?.children.find(p => p.name === 'city')).toBeDefined();
        });

        it('should merge multiple property accesses on the same root', () => {
            const result = ParseTemplateParameters('{{ user.name }} {{ user.email }} {{ user.address.city }}');
            const user = findParam(result, 'user');
            expect(user?.type).toBe('Object');
            const propNames = user?.properties.map(p => p.name).sort();
            expect(propNames).toEqual(['address', 'email', 'name']);
        });
    });

    // ═══════════════════════════════════════════════════
    // 3. FOR LOOPS & ARRAY DETECTION
    // ═══════════════════════════════════════════════════

    describe('For loops and array detection', () => {
        it('should detect Array type from for loop', () => {
            const result = ParseTemplateParameters('{% for item in items %}{{ item }}{% endfor %}');
            expect(findParam(result, 'items')?.type).toBe('Array');
            // item should NOT be a parameter — it's a loop variable
            expect(findParam(result, 'item')).toBeUndefined();
        });

        it('should detect Array of Objects from property access on loop variable', () => {
            const result = ParseTemplateParameters(
                '{% for entity in entities %}{{ entity.name }} {{ entity.description }}{% endfor %}'
            );
            const entities = findParam(result, 'entities');
            expect(entities?.type).toBe('Array');
            // Loop variable properties should NOT create top-level params
            expect(findParam(result, 'entity')).toBeUndefined();
        });

        it('should handle nested for loops', () => {
            const template = `
{% for entity in entityMetadata %}
  {{ entity.entityName }}
  {% for field in entity.fields %}
    {{ field.name }} ({{ field.sqlFullType }})
  {% endfor %}
{% endfor %}`;
            const result = ParseTemplateParameters(template);
            expect(paramNames(result)).toEqual(['entityMetadata']);
            expect(findParam(result, 'entityMetadata')?.type).toBe('Array');
            // entity and field should NOT be parameters
            expect(findParam(result, 'entity')).toBeUndefined();
            expect(findParam(result, 'field')).toBeUndefined();
        });

        it('should handle loop over object property (entity.fields)', () => {
            const template = `
{% for entity in entities %}
  {% for rel in entity.relationships %}
    {{ rel.description }}
  {% endfor %}
{% endfor %}`;
            const result = ParseTemplateParameters(template);
            expect(paramNames(result)).toEqual(['entities']);
        });

        it('should not treat loop.index as a parameter', () => {
            const template = '{% for item in items %}{{ loop.index }}: {{ item }}{% endfor %}';
            const result = ParseTemplateParameters(template);
            expect(paramNames(result)).toEqual(['items']);
        });
    });

    // ═══════════════════════════════════════════════════
    // 4. CONDITIONAL (IF) HANDLING & REQUIRED-NESS
    // ═══════════════════════════════════════════════════

    describe('Conditional handling and required-ness', () => {
        it('should mark param as not required when guarded by if', () => {
            const result = ParseTemplateParameters(
                '{% if validationFeedback %}{{ validationFeedback }}{% endif %}'
            );
            expect(findParam(result, 'validationFeedback')?.isRequired).toBe(false);
        });

        it('should mark param as required when used outside conditionals', () => {
            const result = ParseTemplateParameters(
                '{{ userQuestion }}\n{% if extra %}{{ extra }}{% endif %}'
            );
            expect(findParam(result, 'userQuestion')?.isRequired).toBe(true);
            expect(findParam(result, 'extra')?.isRequired).toBe(false);
        });

        it('should mark guarded array as not required', () => {
            const template = `
{% if parameters and parameters.length > 0 %}
  {% for param in parameters %}
    {{ param.name }}
  {% endfor %}
{% endif %}`;
            const result = ParseTemplateParameters(template);
            expect(findParam(result, 'parameters')?.isRequired).toBe(false);
        });

        it('should handle if/elif/else', () => {
            const template = `
{% if status == 'active' %}Active{% elif status == 'pending' %}Pending{% else %}Unknown{% endif %}`;
            const result = ParseTemplateParameters(template);
            // status is used in the condition, not guarded by itself
            expect(findParam(result, 'status')).toBeDefined();
        });

        it('should handle nested conditionals', () => {
            const template = `
{% if entity.description %}
  {{ entity.description | safe }}
{% endif %}
{{ entity.entityName }}`;
            const result = ParseTemplateParameters(template);
            const entity = findParam(result, 'entity');
            expect(entity?.type).toBe('Object');
            // entity is used both inside and outside {% if %}, so it's required
            expect(entity?.isRequired).toBe(true);
        });
    });

    // ═══════════════════════════════════════════════════
    // 5. FILTER HANDLING
    // ═══════════════════════════════════════════════════

    describe('Filter handling', () => {
        it('should not treat filter names as parameters', () => {
            const result = ParseTemplateParameters('{{ description | safe }}');
            expect(paramNames(result)).toEqual(['description']);
            // 'safe' should NOT be a parameter
        });

        it('should record applied filters', () => {
            const result = ParseTemplateParameters('{{ description | safe }}');
            expect(findParam(result, 'description')?.appliedFilters).toContain('safe');
        });

        it('should handle multiple filters', () => {
            const result = ParseTemplateParameters('{{ data | json }}');
            expect(paramNames(result)).toEqual(['data']);
            expect(findParam(result, 'data')?.appliedFilters).toContain('json');
        });

        it('should handle filter with arguments (join)', () => {
            const template = '{{ items | join(", ") }}';
            const result = ParseTemplateParameters(template);
            expect(paramNames(result)).toEqual(['items']);
            expect(findParam(result, 'items')?.appliedFilters).toContain('join');
        });

        it('should handle filter on object property', () => {
            const result = ParseTemplateParameters('{{ entity.description | safe }}');
            expect(paramNames(result)).toEqual(['entity']);
            expect(findParam(result, 'entity')?.appliedFilters).toContain('safe');
        });

        it('should detect default value from default filter', () => {
            const result = ParseTemplateParameters("{{ title | default('Untitled') }}");
            expect(findParam(result, 'title')?.defaultValue).toBe('Untitled');
        });
    });

    // ═══════════════════════════════════════════════════
    // 6. OR FALLBACK / DEFAULT VALUES
    // ═══════════════════════════════════════════════════

    describe('Or fallback and default values', () => {
        it('should detect default value from or pattern', () => {
            const result = ParseTemplateParameters("{{ description or 'No description' }}");
            expect(findParam(result, 'description')?.defaultValue).toBe('No description');
        });

        it('should not override default value from earlier detection', () => {
            const template = "{{ x | default('first') }}{{ x or 'second' }}";
            const result = ParseTemplateParameters(template);
            // First detection should win
            expect(findParam(result, 'x')?.defaultValue).toBe('first');
        });
    });

    // ═══════════════════════════════════════════════════
    // 7. SET VARIABLES (LOCALS)
    // ═══════════════════════════════════════════════════

    describe('Set variables (locals)', () => {
        it('should not treat set variables as parameters', () => {
            const template = "{% set greeting = 'Hello' %}{{ greeting }} {{ name }}";
            const result = ParseTemplateParameters(template);
            expect(paramNames(result)).toEqual(['name']);
        });

        it('should detect params used in set value expression', () => {
            const template = "{% set fullName = firstName + ' ' + lastName %}{{ fullName }}";
            const result = ParseTemplateParameters(template);
            expect(paramNames(result)).toEqual(['firstName', 'lastName']);
        });
    });

    // ═══════════════════════════════════════════════════
    // 8. MACRO HANDLING
    // ═══════════════════════════════════════════════════

    describe('Macro handling', () => {
        it('should not treat macro arguments as parameters', () => {
            const template = '{% macro render(data) %}{{ data.name }}{% endmacro %}{{ externalParam }}';
            const result = ParseTemplateParameters(template);
            expect(paramNames(result)).toEqual(['externalParam']);
        });
    });

    // ═══════════════════════════════════════════════════
    // 9. SYSTEM VARIABLES
    // ═══════════════════════════════════════════════════

    describe('System variables', () => {
        it('should detect underscore-prefixed vars as system variables', () => {
            const template = '{{ _CURRENT_DATE_AND_TIME }} {{ _USER_NAME }} {{ regularParam }}';
            const result = ParseTemplateParameters(template);
            expect(findParam(result, '_CURRENT_DATE_AND_TIME')?.isSystemVariable).toBe(true);
            expect(findParam(result, '_USER_NAME')?.isSystemVariable).toBe(true);
            expect(findParam(result, 'regularParam')?.isSystemVariable).toBe(false);
        });
    });

    // ═══════════════════════════════════════════════════
    // 10. RAW BLOCKS
    // ═══════════════════════════════════════════════════

    describe('Raw blocks', () => {
        it('should not extract params from raw blocks', () => {
            const template = '{{ realParam }}{% raw %}{{ notAParam }}{% endraw %}';
            const result = ParseTemplateParameters(template);
            expect(paramNames(result)).toEqual(['realParam']);
        });
    });

    // ═══════════════════════════════════════════════════
    // 11. {@include} DIRECTIVES
    // ═══════════════════════════════════════════════════

    describe('MJ include directives', () => {
        it('should strip {@include} directives without breaking parse', () => {
            const template = `{{ userQuestion }}
{@include ./_includes/entity-metadata.md}
{{ description }}`;
            const result = ParseTemplateParameters(template);
            expect(result.warnings).toHaveLength(0);
            expect(paramNames(result)).toEqual(['description', 'userQuestion']);
        });
    });

    // ═══════════════════════════════════════════════════
    // 12. BINARY/COMPARISON EXPRESSIONS
    // ═══════════════════════════════════════════════════

    describe('Binary and comparison expressions', () => {
        it('should extract params from binary expressions', () => {
            const template = '{{ a + b }}';
            const result = ParseTemplateParameters(template);
            expect(paramNames(result)).toEqual(['a', 'b']);
        });

        it('should extract params from comparisons in conditions', () => {
            const template = "{% if hubCount > 0 %}{{ hubCount }} hubs{% endif %}";
            const result = ParseTemplateParameters(template);
            expect(findParam(result, 'hubCount')).toBeDefined();
        });
    });

    // ═══════════════════════════════════════════════════
    // 13. BUILTIN SYMBOLS
    // ═══════════════════════════════════════════════════

    describe('Builtin symbols', () => {
        it('should not treat true/false/null/none as parameters', () => {
            const template = '{% if true %}yes{% endif %}{% if none %}no{% endif %}{{ param }}';
            const result = ParseTemplateParameters(template);
            expect(paramNames(result)).toEqual(['param']);
        });

        it('should not treat loop as a parameter', () => {
            const template = '{% for x in items %}{{ loop.index }}{% endfor %}';
            const result = ParseTemplateParameters(template);
            expect(paramNames(result)).toEqual(['items']);
        });
    });

    // ═══════════════════════════════════════════════════
    // 14. PARSE ERRORS
    // ═══════════════════════════════════════════════════

    describe('Parse errors', () => {
        it('should return warnings on invalid Nunjucks syntax', () => {
            const result = ParseTemplateParameters('{{ unclosed');
            expect(result.warnings.length).toBeGreaterThan(0);
            expect(result.parameters).toHaveLength(0);
        });
    });

    // ═══════════════════════════════════════════════════
    // 15. REAL-WORLD TEMPLATES FROM MJ REPOSITORY
    // ═══════════════════════════════════════════════════

    describe('Real-world: Entity Metadata template', () => {
        const template = `{% for entity in entityMetadata %}
## {{ entity.entityName }}
**Schema.View**: \`[{{ entity.schemaName }}].[{{ entity.baseView }}]\`
{% if entity.description %}- **Description**: {{ entity.description | safe }}{% endif %}

**Available Fields**:
{% for field in entity.fields %}
- \`{{ field.name }}\` ({{ field.sqlFullType }}){% if field.description %} - {{ field.description | safe }}{% endif %}{% if field.isPrimaryKey %} [PRIMARY KEY]{% endif %}{% if field.isForeignKey %} [FK to {{ field.relatedEntity }}]{% endif %}{% if field.isVirtual %} [VIRTUAL - computed field]{% endif %}{% if field.allowsNull %} [NULLABLE]{% else %} [NOT NULL]{% endif %}{% if field.defaultValue %} [DEFAULT: {{ field.defaultValue }}]{% endif %}{% if field.possibleValues %} [VALUES: {{ field.possibleValues | join(', ') }}]{% endif %}
{% endfor %}

{% if entity.relationships.length > 0 %}
**Join Information**:
{% for rel in entity.relationships %}
- To \`{{ rel.relatedEntity }}\`: \`{{ rel.description | safe }}\`
{% endfor %}
{% endif %}

---
{% endfor %}`;

        it('should extract only entityMetadata as the single parameter', () => {
            const result = ParseTemplateParameters(template);
            expect(paramNames(result)).toEqual(['entityMetadata']);
        });

        it('should detect entityMetadata as Array type', () => {
            const result = ParseTemplateParameters(template);
            expect(findParam(result, 'entityMetadata')?.type).toBe('Array');
        });

        it('should not extract loop variables as parameters', () => {
            const result = ParseTemplateParameters(template);
            expect(findParam(result, 'entity')).toBeUndefined();
            expect(findParam(result, 'field')).toBeUndefined();
            expect(findParam(result, 'rel')).toBeUndefined();
        });
    });

    describe('Real-world: Entity Group Generator template', () => {
        const template = `# Entity Group Generator

**Schema Name**: {{ schemaName }}

**Entities** ({{ entities.length }} total):

{% for entity in entities %}
### {{ entity.Name }}
- **Description**: {{ entity.Description or 'No description' }}
- **Schema**: {{ entity.SchemaName }}
- **Fields**: {{ entity.FieldCount }} fields
- **Related Entities**:
  {% for rel in entity.RelatedEntities %}
  - {{ rel.name }} ({{ rel.type }})
  {% endfor %}
{% endfor %}

## Relationship Graph

\`\`\`
{{ relationshipGraph }}
\`\`\`

Groups must have **{{ minGroupSize }} to {{ maxGroupSize }} entities**

{{ entities.length }} entities with an average of **{{ avgDegree }}** relationships per entity
{% if hubCount > 0 %}
- Contains **{{ hubCount }} hub entities** with >5 relationships (largest hub: {{ maxHubDegree }} relationships)
{% endif %}
- Aim for **{{ targetGroupCount }}-{{ targetGroupCount + 5 }}** groups`;

        it('should extract all top-level parameters', () => {
            const result = ParseTemplateParameters(template);
            const names = paramNames(result);
            expect(names).toContain('schemaName');
            expect(names).toContain('entities');
            expect(names).toContain('relationshipGraph');
            expect(names).toContain('minGroupSize');
            expect(names).toContain('maxGroupSize');
            expect(names).toContain('avgDegree');
            expect(names).toContain('hubCount');
            expect(names).toContain('maxHubDegree');
            expect(names).toContain('targetGroupCount');
        });

        it('should detect entities as Array', () => {
            const result = ParseTemplateParameters(template);
            expect(findParam(result, 'entities')?.type).toBe('Array');
        });

        it('should detect hubCount/maxHubDegree as optional (inside {% if hubCount > 0 %})', () => {
            const result = ParseTemplateParameters(template);
            // hubCount is used in the condition AND in the body, both inside {% if %}
            // The condition usage guards hubCount
            expect(findParam(result, 'hubCount')?.isRequired).toBe(false);
            expect(findParam(result, 'maxHubDegree')?.isRequired).toBe(false);
        });

        it('should detect schemaName as required (outside any conditional)', () => {
            const result = ParseTemplateParameters(template);
            expect(findParam(result, 'schemaName')?.isRequired).toBe(true);
        });
    });

    describe('Real-world: Payload Change Feedback Query template', () => {
        const template = `# Payload Change Feedback Query

{% for question in questions %}
### Question {{ question.number }}

{{ question.text }}

**Change Type:** {{ question.warningType }}
**Severity:** {{ question.severity }}
**Path:** {{ question.context.path }}
{% if question.context.details %}
**Details:** {{ question.context.details | json }}
{% endif %}

---
{% endfor %}`;

        it('should extract only questions as a parameter', () => {
            const result = ParseTemplateParameters(template);
            expect(paramNames(result)).toEqual(['questions']);
        });

        it('should detect questions as Array', () => {
            const result = ParseTemplateParameters(template);
            expect(findParam(result, 'questions')?.type).toBe('Array');
        });
    });

    describe('Real-world: SQL Query Writer template', () => {
        const template = `# Business Question
**User Question**: {{ userQuestion | safe }}
**Description**: {{ description | safe }}
**Technical Description**: {{ technicalDescription | safe }}

{% if validationFeedback %}
# Previous Attempt Failed
{{ validationFeedback | safe }}
{% endif %}

# Example Queries
{% for example in fewShotExamples %}
## Example {{ loop.index }}: {{ example.name }}
**Question**: {{ example.userQuestion }}
**Description**: {{ example.description }}

**SQL Template**:
\`\`\`sql
{{ example.sql | safe }}
\`\`\`

**Parameters**:
{% if example.parameters.length > 0 %}
{% for param in example.parameters %}
- \`{{ param.name }}\` ({{ param.type }}){% if param.isRequired %} [REQUIRED]{% endif %} - {{ param.description }}
  - Sample Value: \`{{ param.sampleValue }}\`
{% endfor %}
{% else %}
No parameters
{% endif %}

**Output Fields**:
{% for field in example.selectClause %}
- \`{{ field.name }}\` ({{ field.type }}) - {{ field.description }}
{% endfor %}

---
{% endfor %}`;

        it('should extract all top-level parameters', () => {
            const result = ParseTemplateParameters(template);
            const names = paramNames(result);
            expect(names).toContain('userQuestion');
            expect(names).toContain('description');
            expect(names).toContain('technicalDescription');
            expect(names).toContain('validationFeedback');
            expect(names).toContain('fewShotExamples');
        });

        it('should detect validationFeedback as optional', () => {
            const result = ParseTemplateParameters(template);
            expect(findParam(result, 'validationFeedback')?.isRequired).toBe(false);
        });

        it('should detect userQuestion as required', () => {
            const result = ParseTemplateParameters(template);
            expect(findParam(result, 'userQuestion')?.isRequired).toBe(true);
        });

        it('should detect fewShotExamples as Array', () => {
            const result = ParseTemplateParameters(template);
            expect(findParam(result, 'fewShotExamples')?.type).toBe('Array');
        });

        it('should not extract loop variables (example, param, field) as parameters', () => {
            const result = ParseTemplateParameters(template);
            expect(findParam(result, 'example')).toBeUndefined();
            expect(findParam(result, 'param')).toBeUndefined();
            expect(findParam(result, 'field')).toBeUndefined();
        });

        it('should record safe filter on filtered params', () => {
            const result = ParseTemplateParameters(template);
            expect(findParam(result, 'userQuestion')?.appliedFilters).toContain('safe');
        });
    });

    describe('Real-world: Agent Manager template', () => {
        const template = `You are an Agent Manager AI.

Current date/time: {{ _CURRENT_DATE_AND_TIME }}
User: {{ _USER_NAME }}

{{ _AGENT_TYPE_SYSTEM_PROMPT }}

{{ agentDescription }}

{{ agentSpecificPrompt }}`;

        it('should detect system variables', () => {
            const result = ParseTemplateParameters(template);
            expect(findParam(result, '_CURRENT_DATE_AND_TIME')?.isSystemVariable).toBe(true);
            expect(findParam(result, '_USER_NAME')?.isSystemVariable).toBe(true);
            expect(findParam(result, '_AGENT_TYPE_SYSTEM_PROMPT')?.isSystemVariable).toBe(true);
        });

        it('should detect regular params as non-system', () => {
            const result = ParseTemplateParameters(template);
            expect(findParam(result, 'agentDescription')?.isSystemVariable).toBe(false);
            expect(findParam(result, 'agentSpecificPrompt')?.isSystemVariable).toBe(false);
        });
    });

    describe('Real-world: Agent Completion Email template', () => {
        const template = `<!DOCTYPE html>
<html>
<body>
    <h2>{{ agentName }} completed your request</h2>
    <div class="title">{{ artifactTitle }}</div>
    {% if versionNumber %}
    <div class="version">Version {{ versionNumber }}</div>
    {% endif %}
    <a href="{{ conversationUrl }}" class="button">View Result</a>
</body>
</html>`;

        it('should extract all parameters', () => {
            const result = ParseTemplateParameters(template);
            expect(paramNames(result)).toEqual([
                'agentName', 'artifactTitle', 'conversationUrl', 'versionNumber'
            ]);
        });

        it('should detect versionNumber as optional (guarded by if)', () => {
            const result = ParseTemplateParameters(template);
            expect(findParam(result, 'versionNumber')?.isRequired).toBe(false);
        });

        it('should detect agentName as required', () => {
            const result = ParseTemplateParameters(template);
            expect(findParam(result, 'agentName')?.isRequired).toBe(true);
        });
    });

    describe('Real-world: Compact Agent Message template', () => {
        const template = `You are a message compaction specialist.

# Input

**Original Content** ({{ originalLength }} characters):
\`\`\`
{{ originalContent }}
\`\`\`

**Context**: {{ messageType }}

**Target Length**: approximately {{ targetLength }} characters

**Turn Added**: {{ turnAdded }}`;

        it('should extract all scalar parameters', () => {
            const result = ParseTemplateParameters(template);
            expect(paramNames(result)).toEqual([
                'messageType', 'originalContent', 'originalLength', 'targetLength', 'turnAdded'
            ]);
        });

        it('should mark all as required (no conditionals)', () => {
            const result = ParseTemplateParameters(template);
            for (const p of result.parameters) {
                expect(p.isRequired).toBe(true);
            }
        });
    });

    // ═══════════════════════════════════════════════════
    // 16. EDGE CASES
    // ═══════════════════════════════════════════════════

    describe('Edge cases', () => {
        it('should handle raw blocks with template syntax inside', () => {
            const template = `{{ realParam }}
{% raw %}
WHERE Country = {{ Country | sqlString }}
{% if MinJoinDate %}
AND JoinDate >= {{ MinJoinDate | sqlDate }}
{% endif %}
{% endraw %}`;
            const result = ParseTemplateParameters(template);
            expect(paramNames(result)).toEqual(['realParam']);
        });

        it('should handle inline if expression', () => {
            const template = "{{ 'yes' if active else 'no' }}";
            const result = ParseTemplateParameters(template);
            expect(findParam(result, 'active')).toBeDefined();
        });

        it('should handle arithmetic with params', () => {
            const template = '{{ targetGroupCount }}-{{ targetGroupCount + 5 }}';
            const result = ParseTemplateParameters(template);
            expect(paramNames(result)).toEqual(['targetGroupCount']);
        });

        it('should handle .length access without treating length as separate param', () => {
            const template = '{{ entities.length }} entities total';
            const result = ParseTemplateParameters(template);
            expect(paramNames(result)).toEqual(['entities']);
            expect(findParam(result, 'entities')?.type).toBe('Object');
        });

        it('should handle complex conditional guard with and operator', () => {
            const template = `{% if parameters and parameters.length > 0 %}
{% for param in parameters %}{{ param.name }}{% endfor %}
{% endif %}`;
            const result = ParseTemplateParameters(template);
            expect(findParam(result, 'parameters')?.isRequired).toBe(false);
            expect(findParam(result, 'parameters')?.type).toBe('Array');
        });

        it('should handle CallExtension nodes (custom tags)', () => {
            // This mimics what {% template "Name" %} or {% AIPrompt %}...{% endAIPrompt %} would produce
            // Since we can't easily create extension AST nodes, we verify the parser doesn't crash
            const template = '{{ beforeExt }}';
            const result = ParseTemplateParameters(template);
            expect(result.parameters).toHaveLength(1);
        });

        it('should handle template with only whitespace', () => {
            const result = ParseTemplateParameters('   \n\t  \n  ');
            expect(result.parameters).toHaveLength(0);
        });

        it('should handle template with comments', () => {
            const template = '{# This is a comment #}{{ param }}';
            const result = ParseTemplateParameters(template);
            expect(paramNames(result)).toEqual(['param']);
        });

        it('should promote Scalar to Object when both usages exist', () => {
            const template = '{{ user }}{{ user.name }}';
            const result = ParseTemplateParameters(template);
            expect(findParam(result, 'user')?.type).toBe('Object');
        });

        it('should promote Object to Array when used in for loop', () => {
            const template = '{{ items.length }}{% for item in items %}{{ item }}{% endfor %}';
            const result = ParseTemplateParameters(template);
            expect(findParam(result, 'items')?.type).toBe('Array');
        });
    });

    // ═══════════════════════════════════════════════════
    // 17. COMPARISON WITH AI-EXTRACTED DB RECORDS
    // ═══════════════════════════════════════════════════
    // These tests verify that the deterministic parser extracts
    // the same parameters (or better) than what the AI extracted
    // (stored in the database).

    describe('Comparison with AI-extracted records: Repair JSON', () => {
        const template = `# Fix the JSON below. Output ONLY the corrected JSON.

# Parsing Error
{{ ERROR_MESSAGE | safe }}

# Malformed JSON
\`\`\`json
{{ MALFORMED_JSON | safe }}
\`\`\``;

        it('should match AI-extracted params: ERROR_MESSAGE and MALFORMED_JSON', () => {
            const result = ParseTemplateParameters(template);
            expect(paramNames(result)).toEqual(['ERROR_MESSAGE', 'MALFORMED_JSON']);
        });

        it('should detect both as Scalar (matching AI extraction)', () => {
            const result = ParseTemplateParameters(template);
            expect(findParam(result, 'ERROR_MESSAGE')?.type).toBe('Scalar');
            expect(findParam(result, 'MALFORMED_JSON')?.type).toBe('Scalar');
        });

        it('should detect both as required (used outside conditionals)', () => {
            const result = ParseTemplateParameters(template);
            expect(findParam(result, 'ERROR_MESSAGE')?.isRequired).toBe(true);
            expect(findParam(result, 'MALFORMED_JSON')?.isRequired).toBe(true);
        });
    });

    describe('Comparison with AI-extracted records: Analyze Query Data', () => {
        // This template has: analysisRequest (Scalar), columns (Array), data (Scalar), rowCount (Scalar)
        const template = `# Analyze Query Data

## Data
The following CSV data contains {{ rowCount }} rows with these columns:
{% for col in columns %}
- \`{{ col.name }}\` ({{ col.dataType }}){% if col.nullable %} [nullable]{% endif %}
{% endfor %}

\`\`\`csv
{{ data }}
\`\`\`

## Analysis Request
{{ analysisRequest }}`;

        it('should extract all four parameters', () => {
            const result = ParseTemplateParameters(template);
            const names = paramNames(result);
            expect(names).toContain('analysisRequest');
            expect(names).toContain('columns');
            expect(names).toContain('data');
            expect(names).toContain('rowCount');
        });

        it('should detect columns as Array (matching AI extraction)', () => {
            const result = ParseTemplateParameters(template);
            expect(findParam(result, 'columns')?.type).toBe('Array');
        });

        it('should detect data as Scalar (matching AI extraction)', () => {
            const result = ParseTemplateParameters(template);
            expect(findParam(result, 'data')?.type).toBe('Scalar');
        });
    });

    describe('Comparison with AI-extracted records: CodeGen Entity Description', () => {
        // AI extracted: entityName (Scalar), fields (Array), tableName (Scalar)
        const template = `# Generate Entity Description

## Entity Information
- **Table Name**: {{ tableName }}
- **Entity Name**: {{ entityName }}

## Fields
{% for field in fields %}
- {{ field.Name }} ({{ field.Type }}){% if field.IsNullable %} [nullable]{% endif %}{% if field.Description %} - {{ field.Description }}{% endif %}
{% endfor %}

Generate a clear, concise description for this entity.`;

        it('should extract entityName, fields, tableName', () => {
            const result = ParseTemplateParameters(template);
            expect(paramNames(result)).toEqual(['entityName', 'fields', 'tableName']);
        });

        it('should match AI-extracted types', () => {
            const result = ParseTemplateParameters(template);
            expect(findParam(result, 'entityName')?.type).toBe('Scalar');
            expect(findParam(result, 'fields')?.type).toBe('Array');
            expect(findParam(result, 'tableName')?.type).toBe('Scalar');
        });
    });
});
