create table if not exists public.enterprise_sso_configs (
    company_id text primary key,
    config jsonb not null default '{}'::jsonb,
    updated_by text,
    updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.enterprise_sso_audit_logs (
    id uuid primary key default gen_random_uuid(),
    company_id text not null references public.enterprise_sso_configs(company_id) on delete cascade,
    event text not null,
    provider_id text,
    level text not null default 'info',
    message text not null,
    actor text,
    created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_enterprise_sso_audit_logs_company_id
    on public.enterprise_sso_audit_logs(company_id, created_at desc);

alter table public.enterprise_sso_configs enable row level security;
alter table public.enterprise_sso_audit_logs enable row level security;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'enterprise_sso_configs'
          and policyname = 'Enterprise SSO configs service role full access'
    ) then
        create policy "Enterprise SSO configs service role full access"
            on public.enterprise_sso_configs
            for all
            using (auth.role() = 'service_role')
            with check (auth.role() = 'service_role');
    end if;
end
$$;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'enterprise_sso_audit_logs'
          and policyname = 'Enterprise SSO audit logs service role full access'
    ) then
        create policy "Enterprise SSO audit logs service role full access"
            on public.enterprise_sso_audit_logs
            for all
            using (auth.role() = 'service_role')
            with check (auth.role() = 'service_role');
    end if;
end
$$;

grant select, insert, update on public.enterprise_sso_configs to authenticated;
grant select, insert on public.enterprise_sso_audit_logs to authenticated;
