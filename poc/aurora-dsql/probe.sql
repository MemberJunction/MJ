\set ON_ERROR_STOP off
\echo == schema
CREATE SCHEMA __mj;
\echo == table w/ uuid default + FK
CREATE TABLE __mj.p (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, "__mj_UpdatedAt" timestamptz NOT NULL DEFAULT now(), meta jsonb);
CREATE TABLE __mj.c (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pid uuid REFERENCES __mj.p(id));
\echo == view
CREATE VIEW __mj.vp AS SELECT * FROM __mj.p;
\echo == plpgsql function
CREATE FUNCTION __mj.f1() RETURNS int AS $$ BEGIN RETURN 1; END; $$ LANGUAGE plpgsql;
\echo == sql function returning setof view with DML
CREATE FUNCTION __mj."spCreateP"(p_name text) RETURNS SETOF __mj.vp AS $$ INSERT INTO __mj.p(name) VALUES (p_name); SELECT * FROM __mj.vp WHERE name = p_name; $$ LANGUAGE sql;
\echo == sql function pure
CREATE FUNCTION __mj.f3(x int) RETURNS int AS $$ SELECT x + 1 $$ LANGUAGE sql;
SELECT __mj.f3(1);
\echo == trigger
CREATE TRIGGER t BEFORE UPDATE ON __mj.p FOR EACH ROW EXECUTE FUNCTION __mj.f1();
\echo == extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;
\echo == tsvector col
CREATE TABLE __mj.ts (id int PRIMARY KEY, v tsvector);
\echo == temp table
CREATE TEMP TABLE tt (x int);
\echo == call sql CRUD fn
SELECT * FROM __mj."spCreateP"('a');
\echo == multi-DDL txn
BEGIN; CREATE TABLE __mj.x1 (id int PRIMARY KEY); CREATE TABLE __mj.x2 (id int PRIMARY KEY); COMMIT;
\echo == savepoint
BEGIN; SAVEPOINT s1; ROLLBACK;
\echo == advisory lock
SELECT pg_advisory_unlock_all();
\echo == RETURNING + ON CONFLICT
INSERT INTO __mj.p(name) VALUES ('b') RETURNING id;
\echo == array col
CREATE TABLE __mj.arr (id int PRIMARY KEY, a text[]);
\echo == information_schema / pg_catalog introspection
SELECT count(*) FROM information_schema.columns WHERE table_schema='__mj';
SELECT count(*) FROM pg_catalog.pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='__mj' AND contype='f';
