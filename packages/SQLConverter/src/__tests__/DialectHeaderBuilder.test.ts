import { describe, it, expect } from 'vitest';
import {
  PostgreSQLHeaderBuilder,
  getHeaderBuilder,
  registerHeaderBuilder,
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

  it('should include implicit integer->boolean cast', () => {
    const header = builder.BuildHeader('__mj');
    expect(header).toContain("castsource = 'integer'::regtype");
    expect(header).toContain("casttarget = 'boolean'::regtype");
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
    const builder = getHeaderBuilder('postgres');
    expect(builder).toBeDefined();
    expect(builder!.TargetDialect).toBe('postgres');
  });

  it('should be case-insensitive', () => {
    const builder = getHeaderBuilder('POSTGRES');
    expect(builder).toBeDefined();
  });

  it('should return undefined for unknown dialects', () => {
    expect(getHeaderBuilder('oracle')).toBeUndefined();
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
    registerHeaderBuilder(customBuilder);

    const builder = getHeaderBuilder('mysql');
    expect(builder).toBeDefined();
    expect(builder!.BuildHeader('test')).toBe('-- MySQL header for test\n');
  });
});
