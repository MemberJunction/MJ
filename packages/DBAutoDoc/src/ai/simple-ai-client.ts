/**
 * Simplified AI client that doesn't depend on MJ AI infrastructure
 * Uses direct HTTP calls to AI providers
 */

export interface AITableDocRequest {
  schema: string;
  table: string;
  columns: Array<{
    name: string;
    type: string;
    nullable: boolean;
    isPK: boolean;
    isFK: boolean;
  }>;
  foreignKeys: Array<{
    column: string;
    referencedTable: string;
  }>;
  sampleData?: Record<string, any>[];
  existingDescription?: string;
  userNotes?: string;
}

export interface AITableDocResponse {
  description: string;
  purpose?: string;
  usageNotes?: string;
  businessDomain?: string;
  confidence: number;
  columns: Array<{
    name: string;
    description: string;
    purpose?: string;
    validValues?: string;
    confidence: number;
  }>;
  relationships?: Array<{
    type: 'parent' | 'child';
    table: string;
    description: string;
  }>;
}

/**
 * Simple AI client - uses fetch() to call OpenAI directly
 * TODO: Add support for other providers (Anthropic, Groq, etc.)
 */
export class SimpleAIClient {
  private provider: string;
  private model: string;
  private apiKey: string;

  constructor() {
    this.provider = process.env.AI_PROVIDER || 'openai';
    this.model = process.env.AI_MODEL || 'gpt-4';
    this.apiKey = process.env.AI_API_KEY || '';

    if (!this.apiKey) {
      throw new Error('AI_API_KEY environment variable is required');
    }
  }

  /**
   * Generate table documentation
   */
  async generateTableDoc(request: AITableDocRequest): Promise<AITableDocResponse & { tokensUsed?: number }> {
    const prompt = this.buildTablePrompt(request);

    if (this.provider === 'openai') {
      return await this.callOpenAI(prompt);
    } else if (this.provider === 'anthropic') {
      return await this.callAnthropic(prompt);
    } else {
      throw new Error(`Unsupported AI provider: ${this.provider}`);
    }
  }

  /**
   * Call OpenAI API
   */
  private async callOpenAI(prompt: string): Promise<AITableDocResponse & { tokensUsed?: number }> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are a database documentation expert. Generate clear, business-friendly descriptions for database tables and columns. Always respond with valid JSON only.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data: any = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content in AI response');
    }

    // Parse JSON response
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
    const doc = JSON.parse(jsonStr) as AITableDocResponse;

    return {
      ...doc,
      tokensUsed: data.usage?.total_tokens || 0,
    };
  }

  /**
   * Call Anthropic API
   */
  private async callAnthropic(prompt: string): Promise<AITableDocResponse & { tokensUsed?: number }> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 2000,
        temperature: 0.3,
        messages: [
          {
            role: 'user',
            content: `You are a database documentation expert. Generate clear, business-friendly descriptions for database tables and columns. Always respond with valid JSON only.\n\n${prompt}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.statusText}`);
    }

    const data: any = await response.json();
    const content = data.content?.[0]?.text;

    if (!content) {
      throw new Error('No content in AI response');
    }

    // Parse JSON response
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
    const doc = JSON.parse(jsonStr) as AITableDocResponse;

    return {
      ...doc,
      tokensUsed: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
    };
  }

  /**
   * Build table documentation prompt
   */
  private buildTablePrompt(request: AITableDocRequest): string {
    const lines: string[] = [];

    lines.push(`# Table: ${request.schema}.${request.table}`);
    lines.push('');
    lines.push('## Columns');

    for (const col of request.columns) {
      const flags: string[] = [];
      if (col.isPK) flags.push('PK');
      if (col.isFK) flags.push('FK');
      if (!col.nullable) flags.push('NOT NULL');

      lines.push(`- ${col.name} (${col.type}) ${flags.join(', ')}`);
    }

    if (request.foreignKeys.length > 0) {
      lines.push('');
      lines.push('## Foreign Keys');
      for (const fk of request.foreignKeys) {
        lines.push(`- ${fk.column} → ${fk.referencedTable}`);
      }
    }

    if (request.sampleData && request.sampleData.length > 0) {
      lines.push('');
      lines.push('## Sample Data');
      lines.push(JSON.stringify(request.sampleData.slice(0, 3), null, 2));
    }

    if (request.existingDescription) {
      lines.push('');
      lines.push('## Existing Description');
      lines.push(request.existingDescription);
    }

    if (request.userNotes) {
      lines.push('');
      lines.push('## User Notes');
      lines.push(request.userNotes);
    }

    lines.push('');
    lines.push('## Task');
    lines.push('Generate documentation for this table. Return ONLY a JSON object with this exact structure:');
    lines.push('```json');
    lines.push('{');
    lines.push('  "description": "What this table stores (2-3 sentences)",');
    lines.push('  "purpose": "Why this table exists (1 sentence)",');
    lines.push('  "businessDomain": "e.g., Sales, HR, Inventory",');
    lines.push('  "confidence": 0.85,');
    lines.push('  "columns": [');
    lines.push('    {');
    lines.push('      "name": "ColumnName",');
    lines.push('      "description": "What this column contains",');
    lines.push('      "confidence": 0.9');
    lines.push('    }');
    lines.push('  ]');
    lines.push('}');
    lines.push('```');

    return lines.join('\n');
  }
}
