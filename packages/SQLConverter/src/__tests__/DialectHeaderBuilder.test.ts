import { describe, it, expect } from 'vitest';
import {
  PostgreSQLHeaderBuilder,
  GetHeaderBuilder,
  RegisterHeaderBuilder,
} from '../rules/DialectHeaderBuilder.js';
import type { DialectHeaderBuilder } from '../rules/DialectHeaderBuilder.js';

describe('PostgreSQLHeaderBuilder', () => {
  const builder = new PostgreSQLHeaderBuilder();

  it('should have TargetDialect = "postgres"', () => {
    expect(builder.TargetDialect).toBe('postgres');
  });

  it('should include pgcrypto extension', () => {
    const header = builder.BuildHeader('__mj');
    expect(header).toContain('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
  });

  it('should include uuid-ossp extension', () => {
    const header = builder.BuildHeader('__mj');
    expect(header).toContain('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  });

  it('should create the target schema', () => {
    const header = builder.BuildHeader('my_schema');
    expect(header).toContain('CREATE SCHEMA IF NOT EXISTS my_schema');
  });

  it('should set search_path to the target schema', () => {
    const header = builder.BuildHeader('my_schema');
    expect(header).toContain('SET search_path TO my_schema, public');
  });

  it('should NOT emit pg_cast UPDATE (managed-PG safety)', () => {
    // Earlier converter versions emitted an UPDATE pg_cast statement to make
    // INTEGER to BOOLEAN implicit so SS-style INSERT INTO bool_col VALUES (1)
    // would work. That UPDATE requires pg_catalog modify privileges, which
    // managed PG (RDS, Aurora, Cloud SQL, Azure) does not grant. As of v5.30
    // all bulk INSERTs use TRUE/FALSE directly, so the pg_cast modification
    // is no longer needed and was removed to support managed-PG installs.
    const header = builder.BuildHeader('__mj');
    expect(header).not.toContain('UPDATE pg_cast');
    expect(header).not.toContain("castsource = 'integer'::regtype");
    expect(header).not.toContain("casttarget = 'boolean'::regtype");
  });

  it('should use the schema parameter (not hardcoded __mj)', () => {
    const header = builder.BuildHeader('custom');
    expect(header).toContain('CREATE SCHEMA IF NOT EXISTS custom');
    expect(header).toContain('SET search_path TO custom, public');
    expect(header).not.toContain('__mj');
  });
});

describe('getHeaderBuilder', () => {
  it('should return the PostgreSQL builder for "postgres"', () => {
    const builder = GetHeaderBuilder('postgres');
    expect(builder).toBeDefined();
    expect(builder!.TargetDialect).toBe('postgres');
  });

  it('should be case-insensitive', () => {
    const builder = GetHeaderBuilder('POSTGRES');
    expect(builder).toBeDefined();
  });

  it('should return undefined for unknown dialects', () => {
    expect(GetHeaderBuilder('oracle')).toBeUndefined();
  });
});

describe('registerHeaderBuilder', () => {
  it('should allow registering a custom header builder', () => {
    const customBuilder: DialectHeaderBuilder = {
      TargetDialect: 'mysql',
      BuildHeader(schema: string): string {
        return `-- MySQL header for ${schema}\n`;
      },
    };
    RegisterHeaderBuilder(customBuilder);

    const builder = GetHeaderBuilder('mysql');
    expect(builder).toBeDefined();
    expect(builder!.BuildHeader('test')).toBe('-- MySQL header for test\n');
  });
});
