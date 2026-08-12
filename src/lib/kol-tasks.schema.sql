-- KOL 选号任务表
-- 在 Supabase 控制台 SQL Editor 中执行本文件即可创建。

create table if not exists public.kol_selection_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id bigint not null unique,
  task_name text not null,
  product_name text not null,
  brand text,
  brief_summary text,
  keyword_groups jsonb not null default '[]'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  status text not null default 'running',
  result_data jsonb,
  file_url text,
  mcp_status integer,
  mcp_status_desc text,
  created_at timestamptz not null default now(),
  created_by text
);

create index if not exists idx_kol_selection_tasks_created_at
  on public.kol_selection_tasks (created_at desc);

create index if not exists idx_kol_selection_tasks_created_by
  on public.kol_selection_tasks (created_by);

create index if not exists idx_kol_selection_tasks_status
  on public.kol_selection_tasks (status);

-- 允许匿名（anon_key）读取/写入（如果你的应用对未登录用户也开放）
-- 若已开启 RLS，请根据业务需要按需调整策略：
alter table public.kol_selection_tasks enable row level security;

drop policy if exists "kol_tasks_all_anon" on public.kol_selection_tasks;
create policy kol_tasks_all_anon on public.kol_selection_tasks
  for all
  to anon
  using (true)
  with check (true);

drop policy if exists "kol_tasks_all_auth" on public.kol_selection_tasks;
create policy kol_tasks_all_auth on public.kol_selection_tasks
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "kol_tasks_all_service" on public.kol_selection_tasks;
create policy kol_tasks_all_service on public.kol_selection_tasks
  for all
  to service_role
  using (true)
  with check (true);
