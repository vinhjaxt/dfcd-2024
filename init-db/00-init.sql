-- NOTE: change to your own passwords for production environments
\set pgpass `echo "$POSTGRES_PASSWORD"`

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '"$user", public', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

create schema if not exists extensions;
create schema if not exists super_extensions;
create schema if not exists pgsodium;
create extension if not exists dblink with schema super_extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pgjwt with schema extensions; -- depends on pgcrypto, so load after
create extension if not exists citext;
create extension if not exists http with schema extensions;
create extension if not exists pgsodium with schema pgsodium;
create extension if not exists pg_background with schema extensions;
-- create extension if not exists pg_cron with schema pg_catalog;
-- create extension if not exists pg_repack with schema extensions;

-- public user/no auth
create role anon_role nologin noinherit;

CREATE ROLE authenticator LOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOSUPERUSER password :'pgpass';
ALTER USER authenticator WITH PASSWORD :'pgpass';

grant anon_role to authenticator;

ALTER ROLE authenticator SET statement_timeout TO '30s';
ALTER ROLE anon_role SET statement_timeout TO '12s';

alter role "postgres" with bypassrls; -- Bypassing Row Level Security
alter role "authenticator" with bypassrls;

-- clear default roles privileges
alter default privileges revoke all on functions from anon_role, public;
alter default privileges revoke all on TABLES from anon_role, public;
alter default privileges revoke all on SEQUENCES from anon_role, public;
alter default privileges revoke all on ROUTINES from anon_role, public;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM public;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM public;

-- Revoke privileges on all
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon_role, public;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon_role, public;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM anon_role, public;
REVOKE ALL PRIVILEGES ON ALL PROCEDURES IN SCHEMA public FROM anon_role, public;
REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public FROM anon_role, public;

grant usage on schema public,extensions to anon_role; -- for public reads
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO anon_role, public; -- for inserts data

GRANT select,insert,update ON ALL TABLES IN SCHEMA public TO anon_role;
GRANT select,update ON ALL SEQUENCES IN SCHEMA public TO anon_role;
GRANT execute ON ALL FUNCTIONS IN SCHEMA extensions TO anon_role;
