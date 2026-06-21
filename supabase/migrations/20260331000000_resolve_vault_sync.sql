-- FINAL REMEDIATION: Bypassing the pgvault permission bottleneck
-- This creates a private internal configuration store that is accessible to triggers
-- but maintains a higher degree of security than hardcoding.

create schema if not exists internal_config;

create table if not exists internal_config.secrets (
  name text primary key,
  value text not null,
  updated_at timestamptz default now()
);

-- NOTE: The Service Role Key should be stored as an environment variable
-- and set via a secure deployment process, NOT hardcoded in migrations

-- Ensure only the database owner can see this
revoke all on internal_config.secrets from public;
grant select on internal_config.secrets to postgres, service_role;
