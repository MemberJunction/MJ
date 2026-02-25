import type { IConversionRule, ConversionContext, StatementType } from './types.js';
import {
  convertIdentifiers, convertDateFunctions, convertCharIndex,
  convertStringConcat, convertTopToLimit, convertIIF,
  removeNPrefix, convertCommonFunctions,
} from './ExpressionHelpers.js';
import { resolveType } from './TypeResolver.js';

export class FunctionRule implements IConversionRule {
  Name = 'FunctionRule';
  SourceDialect = 'tsql';
  TargetDialect = 'postgres';
  AppliesTo: StatementType[] = ['CREATE_FUNCTION'];
  Priority = 35;
  BypassSqlglot = true;

  PostProcess(sql: string, _originalSQL: string, context: ConversionContext): string {
    const upper = sql.toUpperCase();

    // Check for hand-written function replacements
    const handwritten = context.HandWrittenFunctions.get(this.extractFunctionName(upper));
    if (handwritten) return handwritten;

    // Check built-in hand-written functions
    const builtin = getHandwrittenFunction(upper);
    if (builtin) return builtin;

    let result = convertIdentifiers(sql);
    result = removeNPrefix(result);

    // Replace @@ROWCOUNT/@@ERROR first
    result = result.replace(/@@ROWCOUNT/gi, '_v_row_count');
    result = result.replace(/@@ERROR/gi, '0');

    // Replace @var with p_var
    result = result.replace(/@(\w+)/g, 'p_$1');

    // Type conversions
    result = result.replace(/\buniqueid(?:entifier)?\b/gi, 'UUID');
    result = result.replace(/\bnvarchar\s*\(\s*max\s*\)/gi, 'TEXT');
    result = result.replace(/\bnvarchar\s*\(\s*(\d+)\s*\)/gi, 'VARCHAR($1)');
    result = result.replace(/\bdatetimeoffset\b/gi, 'TIMESTAMPTZ');
    result = result.replace(/\bdatetime\b/gi, 'TIMESTAMPTZ');
    result = result.replace(/\bbit\b/gi, 'BOOLEAN');
    result = result.replace(/\btinyint\b/gi, 'SMALLINT');

    // Common functions
    result = convertCommonFunctions(result);
    result = convertTopToLimit(result);
    result = convertStringConcat(result);
    result = convertDateFunctions(result);
    result = result.replace(/\bLEN\s*\(/gi, 'LENGTH(');
    result = convertCharIndex(result);

    // Inline table-valued functions
    if (/RETURNS\s+TABLE\s+AS\s+RETURN/i.test(result)) {
      result = this.convertInlineTVF(result);
    } else {
      result = this.convertScalarFunction(result);
    }

    return result + '\n';
  }

  private extractFunctionName(upper: string): string {
    const m = upper.match(/CREATE\s+FUNCTION\s+\[?__MJ\]?\.\[?(\w+)\]?/);
    return m ? m[1].toLowerCase() : '';
  }

  private convertInlineTVF(sql: string): string {
    const m = sql.match(
      /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(__mj\."?\w+"?)\s*\(([^)]*)\)\s*RETURNS\s+TABLE\s+AS\s+RETURN\s*\(\s*([\s\S]*)\s*\)/i
    );
    if (m) {
      const funcName = m[1];
      const params = m[2];
      let query = m[3].trim().replace(/;$/, '');

      // Add WITH RECURSIVE if recursive CTE
      if (/\bWITH\s+\w+\s+AS\s*\(/i.test(query) && query.toUpperCase().includes('UNION ALL')) {
        query = query.replace(/\bWITH\b/i, 'WITH RECURSIVE');
      }

      // Determine return type
      let returnsClause = 'RETURNS SETOF RECORD';
      if (/GetRootID/i.test(funcName)) {
        returnsClause = 'RETURNS TABLE("RootID" UUID)';
      } else {
        const colDefs = this.extractColumnDefs(query);
        if (colDefs) returnsClause = `RETURNS TABLE(${colDefs})`;
      }

      return `CREATE OR REPLACE FUNCTION ${funcName}(${params})\n${returnsClause} AS $$\n${query}\n$$ LANGUAGE sql;`;
    }
    return sql;
  }

  private extractColumnDefs(query: string): string | null {
    const selectMatch = query.match(/SELECT\s+([\s\S]*?)(?:\s+FROM\b|\s*$)/i);
    if (!selectMatch) return null;
    const cols: string[] = [];
    for (const col of selectMatch[1].split(',')) {
      const aliasMatch = col.trim().match(/\bAS\s+"?(\w+)"?/i);
      if (aliasMatch) cols.push(`"${aliasMatch[1]}" TEXT`);
    }
    return cols.length > 0 ? cols.join(', ') : null;
  }

  private convertScalarFunction(sql: string): string {
    const m = sql.match(
      /(CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+__mj\."?\w+"?\s*\([^)]*\)\s*RETURNS\s+[\w\s()]+?)\s*\bAS\b\s*(?:BEGIN\b)?\s*([\s\S]*?)(?:\s*END\s*;?\s*$)/i
    );

    if (m) {
      const header = m[1].trim();
      let body = m[2].trim();
      const declares: string[] = [];

      // WHILE ... BEGIN ... END → WHILE ... LOOP ... END LOOP
      body = body.replace(/\bWHILE\s+(.*?)\s+BEGIN\b/gi, 'WHILE $1 LOOP');
      body = body.replace(/\bEND\s*;\s*\n/g, 'END LOOP;\n');

      // SET p_var = value → p_var := value
      body = body.replace(/\bSET\s+(p_\w+)\s*=\s*/gi, '$1 := ');

      // NCHAR → CHAR
      body = body.replace(/\bNCHAR\s*\(/gi, 'CHAR(');

      // Extract DECLARE statements
      body = body.replace(
        /DECLARE\s+(p_\w+)\s+([\w\(\),\s]+?)(?:\s*=\s*(.+?))?\s*;/gi,
        (_m: string, name: string, type: string, def?: string) => {
          let decl = `    ${name} ${this.mapType(type.trim())}`;
          if (def) decl += ` := ${def.trim()}`;
          decl += ';';
          declares.push(decl);
          return '';
        }
      );

      // IF ... BEGIN ... END → IF ... THEN ... END IF (simple conversion)
      body = body.replace(/\bIF\s+(.*?)\s+BEGIN\b/gi, 'IF $1 THEN');
      body = body.replace(/\bEND\s*(?=\s*(?:ELSE|$))/gi, 'END IF');

      // String concat
      body = convertStringConcat(body);
      body = body.replace(/\bISNULL\s*\(/gi, 'COALESCE(');

      const declareBlock = declares.length > 0 ? 'DECLARE\n' + declares.join('\n') + '\n' : '';
      return `${header}\nAS $$\n${declareBlock}BEGIN\n${body.trim()}\nEND;\n$$ LANGUAGE plpgsql;`;
    }

    // Fallback: basic wrapping
    sql = sql.replace(/\bAS\s*\n\s*BEGIN\b/i, 'AS $$\nBEGIN');
    if (!sql.includes('$$ LANGUAGE')) {
      sql = sql.replace(/\bEND\s*$/i, 'END\n$$ LANGUAGE plpgsql;');
    }
    if (sql.includes('AS $$') && !sql.includes('$$ LANGUAGE')) {
      sql = sql.trimEnd().replace(/;$/, '') + '\nEND;\n$$ LANGUAGE plpgsql;';
    }
    return sql;
  }

  /**
   * Map a T-SQL type to its PostgreSQL equivalent.
   * Delegates to the centralized TypeResolver.
   */
  private mapType(typeStr: string): string {
    return resolveType(typeStr);
  }
}

/** Hand-written PostgreSQL implementations for utility functions */
function getHandwrittenFunction(upper: string): string | null {
  if (upper.includes('STRIPTOALPHANUMERIC') && upper.includes('CREATE FUNCTION')) {
    return `CREATE OR REPLACE FUNCTION __mj."StripToAlphanumeric"(
    IN "p_InputString" TEXT
)
RETURNS TEXT AS $$
DECLARE
    p_Result TEXT := '';
    p_i INTEGER;
    p_c CHAR(1);
BEGIN
    IF "p_InputString" IS NULL THEN
        RETURN NULL;
    END IF;
    FOR p_i IN 1..LENGTH("p_InputString") LOOP
        p_c := SUBSTRING("p_InputString" FROM p_i FOR 1);
        IF p_c ~ '[A-Za-z0-9]' THEN
            p_Result := p_Result || p_c;
        END IF;
    END LOOP;
    RETURN p_Result;
END;
$$ LANGUAGE plpgsql;
`;
  }
  if (upper.includes('GETPROGRAMMATICNAME') && upper.includes('CREATE FUNCTION')) {
    return `CREATE OR REPLACE FUNCTION __mj."GetProgrammaticName"(
    IN "p_InputString" TEXT
)
RETURNS TEXT AS $$
DECLARE
    p_Result TEXT := '';
    p_i INTEGER;
    p_c CHAR(1);
BEGIN
    IF "p_InputString" IS NULL THEN
        RETURN NULL;
    END IF;
    FOR p_i IN 1..LENGTH("p_InputString") LOOP
        p_c := SUBSTRING("p_InputString" FROM p_i FOR 1);
        CASE
            WHEN p_c ~ '[A-Za-z0-9]' THEN
                p_Result := p_Result || p_c;
            WHEN p_c = ' ' THEN
                NULL;
            WHEN p_c = '_' THEN
                p_Result := p_Result || p_c;
            ELSE
                NULL;
        END CASE;
    END LOOP;
    RETURN p_Result;
END;
$$ LANGUAGE plpgsql;
`;
  }
  if (upper.includes('TOTITLECASE') && upper.includes('CREATE FUNCTION')) {
    return `CREATE OR REPLACE FUNCTION __mj."ToTitleCase"(
    IN "p_InputString" TEXT
)
RETURNS TEXT AS $$
BEGIN
    IF "p_InputString" IS NULL THEN
        RETURN NULL;
    END IF;
    RETURN INITCAP("p_InputString");
END;
$$ LANGUAGE plpgsql;
`;
  }
  if (upper.includes('TOPROPERCASE') && upper.includes('CREATE FUNCTION')) {
    return `CREATE OR REPLACE FUNCTION __mj."ToProperCase"(
    IN "p_InputString" TEXT
)
RETURNS TEXT AS $$
BEGIN
    IF "p_InputString" IS NULL THEN
        RETURN NULL;
    END IF;
    RETURN INITCAP("p_InputString");
END;
$$ LANGUAGE plpgsql;
`;
  }
  if (upper.includes('EXTRACTVERSIONCOMPONENTS') && upper.includes('CREATE FUNCTION')) {
    return `CREATE OR REPLACE FUNCTION __mj."ExtractVersionComponents"(
    IN "p_VersionString" TEXT
)
RETURNS TABLE("Major" INTEGER, "Minor" INTEGER, "Patch" INTEGER) AS $$
DECLARE
    p_Parts TEXT[];
BEGIN
    IF "p_VersionString" IS NULL OR TRIM("p_VersionString") = '' THEN
        RETURN QUERY SELECT 0::INTEGER, 0::INTEGER, 0::INTEGER;
        RETURN;
    END IF;
    p_Parts := STRING_TO_ARRAY(TRIM("p_VersionString"), '.');
    RETURN QUERY SELECT
        COALESCE(NULLIF(p_Parts[1], '')::INTEGER, 0),
        COALESCE(NULLIF(p_Parts[2], '')::INTEGER, 0),
        COALESCE(NULLIF(p_Parts[3], '')::INTEGER, 0);
END;
$$ LANGUAGE plpgsql;
`;
  }
  if (upper.includes('PARSEEMAIL') && upper.includes('CREATE FUNCTION')) {
    return `CREATE OR REPLACE FUNCTION __mj."parseEmail"(
    IN "p_Email" TEXT
)
RETURNS TEXT AS $$
DECLARE
    p_Domain TEXT;
BEGIN
    IF "p_Email" IS NULL OR TRIM("p_Email") = '' THEN
        RETURN NULL;
    END IF;
    p_Domain := SUBSTRING("p_Email" FROM POSITION('@' IN "p_Email") + 1);
    RETURN p_Domain;
END;
$$ LANGUAGE plpgsql;
`;
  }
  if (upper.includes('PARSEDOMAIN') && upper.includes('CREATE FUNCTION')) {
    return `CREATE OR REPLACE FUNCTION __mj."parseDomain"(
    IN "p_url" TEXT
)
RETURNS TEXT AS $$
DECLARE
    p_domain TEXT;
    p_clean TEXT;
    p_slash_pos INTEGER;
BEGIN
    IF "p_url" IS NULL OR TRIM("p_url") = '' THEN
        RETURN NULL;
    END IF;
    p_clean := "p_url";
    p_clean := REGEXP_REPLACE(p_clean, '^https?://', '', 'i');
    p_clean := REGEXP_REPLACE(p_clean, '^www\\.', '', 'i');
    p_slash_pos := POSITION('/' IN p_clean);
    IF p_slash_pos > 0 THEN
        p_clean := SUBSTRING(p_clean FROM 1 FOR p_slash_pos - 1);
    END IF;
    RETURN p_clean;
END;
$$ LANGUAGE plpgsql;
`;
  }
  if (upper.includes('FNINITIALS') && upper.includes('CREATE FUNCTION')) {
    return `CREATE OR REPLACE FUNCTION __mj."fnInitials"(
    IN "p_InputString" TEXT
)
RETURNS TEXT AS $$
DECLARE
    p_Result TEXT := '';
    p_Words TEXT[];
    p_Word TEXT;
BEGIN
    IF "p_InputString" IS NULL OR TRIM("p_InputString") = '' THEN
        RETURN '';
    END IF;
    p_Words := STRING_TO_ARRAY(TRIM("p_InputString"), ' ');
    FOREACH p_Word IN ARRAY p_Words LOOP
        IF LENGTH(TRIM(p_Word)) > 0 THEN
            p_Result := p_Result || UPPER(SUBSTRING(TRIM(p_Word) FROM 1 FOR 1));
        END IF;
    END LOOP;
    RETURN p_Result;
END;
$$ LANGUAGE plpgsql;
`;
  }
  return null;
}
