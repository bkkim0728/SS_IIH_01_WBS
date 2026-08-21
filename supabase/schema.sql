-- =====================================================================
--  WBS HUB / Supabase schema
--  프로젝트: SS-SIIIDS 투자정보 HUB + 해외시세 감시
--  실행 위치: Supabase Dashboard > SQL Editor > New query
--  실행 순서: 1) schema.sql   2) seed.sql
-- =====================================================================

-- 재실행 가능하도록 정리 (운영 데이터가 있으면 이 블록을 지우고 쓰세요)
drop view   if exists v_task_rollup;
drop table  if exists task_log     cascade;
drop table  if exists tasks        cascade;
drop table  if exists milestones   cascade;
drop table  if exists projects     cascade;

-- ---------------------------------------------------------------------
-- 1. 프로젝트
-- ---------------------------------------------------------------------
create table projects (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  version     text default 'v0.4',
  start_date  date not null,
  end_date    date not null,
  created_at  timestamptz default now()
);

-- ---------------------------------------------------------------------
-- 2. WBS Task (L1~L4 계층, parent_code 로 자기참조)
-- ---------------------------------------------------------------------
create table tasks (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  code        text not null,                    -- 2.1.1.3
  level       smallint not null check (level between 1 and 4),
  parent_code text,                             -- 2.1.1
  name        text not null,
  deliverable text default '',
  owner       text default '',
  plan_start  date,
  plan_end    date,
  days        integer default 0,
  progress    smallint default 0 check (progress between 0 and 100),
  status      text default 'not_started'
              check (status in ('not_started','in_progress','done','blocked')),
  date_source text default 'auto'               -- file | auto | rollup
              check (date_source in ('file','auto','rollup')),
  note        text default '',
  updated_at  timestamptz default now(),
  unique (project_id, code)
);

create index tasks_project_idx on tasks (project_id);
create index tasks_parent_idx  on tasks (project_id, parent_code);
create index tasks_level_idx   on tasks (project_id, level);

-- ---------------------------------------------------------------------
-- 3. 마일스톤
-- ---------------------------------------------------------------------
create table milestones (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  name        text not null,
  start_date  date,
  end_date    date,
  note        text default '',
  sort_order  smallint default 0
);

create index milestones_project_idx on milestones (project_id);

-- ---------------------------------------------------------------------
-- 4. 변경 이력 (진척률/상태가 바뀔 때만 기록)
-- ---------------------------------------------------------------------
create table task_log (
  id           bigserial primary key,
  task_id      uuid references tasks(id) on delete cascade,
  task_code    text,
  from_progress smallint,
  to_progress   smallint,
  from_status   text,
  to_status     text,
  changed_by    text default 'anon',
  changed_at    timestamptz default now()
);

create index task_log_task_idx on task_log (task_id, changed_at desc);

-- security definer 가 반드시 필요합니다.
-- 이게 없으면 트리거가 호출자(anon) 권한으로 돌면서 task_log 의 RLS 에 막히고,
-- 그 여파로 tasks 의 UPDATE 까지 통째로 실패합니다.
create or replace function log_task_change() returns trigger as $$
begin
  if (new.progress is distinct from old.progress)
     or (new.status is distinct from old.status) then
    insert into public.task_log (task_id, task_code, from_progress, to_progress,
                                 from_status, to_status)
    values (new.id, new.code, old.progress, new.progress, old.status, new.status);
  end if;
  new.updated_at := now();
  return new;
end;
$$ language plpgsql
   security definer
   set search_path = public, pg_temp;

create trigger tasks_change_log
  before update on tasks
  for each row execute function log_task_change();

-- ---------------------------------------------------------------------
-- 5. 진척 롤업 뷰 (L4 리프의 평균을 상위 레벨로 올림)
-- ---------------------------------------------------------------------
create view v_task_rollup as
with leaves as (
  select project_id,
         split_part(code, '.', 1)                                as phase_code,
         split_part(code, '.', 1) || '.' || split_part(code,'.',2) as l2_code,
         split_part(code, '.', 1) || '.' || split_part(code,'.',2)
           || '.' || split_part(code,'.',3)                      as l3_code,
         progress, status, plan_start, plan_end
  from tasks
  where level = 4
)
select project_id,
       phase_code,
       count(*)                                          as leaf_count,
       round(avg(progress))                              as avg_progress,
       count(*) filter (where status = 'done')           as done_count,
       count(*) filter (where status = 'blocked')        as blocked_count,
       count(*) filter (where status = 'in_progress')    as wip_count,
       min(plan_start)                                   as phase_start,
       max(plan_end)                                     as phase_end
from leaves
group by project_id, phase_code;

-- ---------------------------------------------------------------------
-- 6. RLS
--    A안(기본): 사내 링크 공유용. anon 키로 읽기 + 쓰기 허용.
--    B안: 로그인 사용자만 쓰기. 아래 A안 정책을 지우고 B안 주석을 해제하세요.
-- ---------------------------------------------------------------------
alter table projects   enable row level security;
alter table tasks      enable row level security;
alter table milestones enable row level security;
alter table task_log   enable row level security;

-- --- A안: 링크를 아는 사람은 보고 고칠 수 있음 -----------------------
create policy "read all"   on projects   for select using (true);
create policy "read all"   on tasks      for select using (true);
create policy "read all"   on milestones for select using (true);
create policy "read all"   on task_log   for select using (true);

create policy "write all"  on tasks      for update using (true) with check (true);
create policy "write all"  on milestones for update using (true) with check (true);

-- 엑셀 업로드로 Task 를 추가·삭제하려면 필요합니다.
create policy "insert tasks" on tasks    for insert with check (true);
create policy "delete tasks" on tasks    for delete using (true);

-- 트리거가 남기는 로그. security definer 와 별개로 한 겹 더 열어 둡니다.
create policy "insert log"   on task_log for insert with check (true);

-- --- B안: 로그인한 사람만 수정 (A안 write 정책을 먼저 drop) ----------
-- drop policy "write all" on tasks;
-- drop policy "write all" on milestones;
-- create policy "auth write" on tasks
--   for update to authenticated using (true) with check (true);
-- create policy "auth write" on milestones
--   for update to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------
-- 7. Realtime (여러 명이 같이 볼 때 화면 자동 갱신)
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table tasks;
alter publication supabase_realtime add table milestones;

-- ---------------------------------------------------------------------
-- 8. 권한 확인 (Supabase 기본값이 있지만 명시해 둡니다)
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on tasks      to anon, authenticated;
grant select, update                 on milestones to anon, authenticated;
grant select                         on projects   to anon, authenticated;
grant select, insert                 on task_log   to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

-- ---------------------------------------------------------------------
-- 9. 설치 확인
-- ---------------------------------------------------------------------
-- select level, count(*) from tasks group by level order by level;
-- select proname, prosecdef from pg_proc where proname = 'log_task_change';
-- select tablename, policyname, cmd from pg_policies where schemaname='public' order by 1,3;
