-- PostgreSQL init script: runs automatically on first container start
-- Creates the __mj schema and required extensions

-- MemberJunction core schema (matches SQL Server's __mj schema)
CREATE SCHEMA IF NOT EXISTS __mj;

-- UUID generation (gen_random_uuid is built-in since PG 13, but pgcrypto adds extras)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Full-text search dictionary support (built-in but ensure it's available)
-- No extension needed - tsvector/tsquery are native PG types

-- Grant schema usage to the mj_admin user
GRANT ALL ON SCHEMA __mj TO mj_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA __mj GRANT ALL ON TABLES TO mj_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA __mj GRANT ALL ON SEQUENCES TO mj_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA __mj GRANT ALL ON FUNCTIONS TO mj_admin;
