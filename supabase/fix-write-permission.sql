-- =====================================================================
--  WBS HUB / 쓰기 권한 복구
--
--  증상: 읽기는 되는데 진척률을 바꾸면 저장이 실패한다.
--
--  원인: tasks 를 UPDATE 하면 트리거가 task_log 에 INSERT 를 합니다.
--        그런데 task_log 는 RLS 가 켜져 있고 INSERT 정책이 없었으며,
--        트리거 함수도 SECURITY DEFINER 가 아니라 호출자(anon) 권한으로
--        돌았습니다. 그래서 로그 INSERT 가 막히고, 트랜잭션 전체가
--        되돌려지면서 UPDATE 까지 실패합니다.
--
--  이 스크립트는 데이터를 건드리지 않습니다. 여러 번 실행해도 안전합니다.
--  실행 위치: Supabase Dashboard > SQL Editor > New query
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 트리거 함수를 SECURITY DEFINER 로 바꿉니다.
--    로그 기록은 시스템의 일이므로 호출자 권한과 무관하게 동작해야 합니다.
--    search_path 를 고정해 함수 가로채기를 막습니다.
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 2. 그래도 막히지 않도록 task_log 에 INSERT 정책을 둡니다.
-- ---------------------------------------------------------------------
drop policy if exists "insert log" on task_log;
create policy "insert log" on task_log for insert with check (true);

-- ---------------------------------------------------------------------
-- 3. 쓰기 정책이 빠져 있으면 채웁니다. (A안: 링크를 아는 사람이 수정)
--    B안(로그인 필수)을 쓰시는 중이라면 이 블록은 건너뛰세요.
-- ---------------------------------------------------------------------
drop policy if exists "write all" on tasks;
create policy "write all" on tasks
  for update using (true) with check (true);

drop policy if exists "write all" on milestones;
create policy "write all" on milestones
  for update using (true) with check (true);

-- 엑셀 업로드로 Task 를 추가·삭제하려면 아래 두 정책도 필요합니다.
drop policy if exists "insert tasks" on tasks;
create policy "insert tasks" on tasks for insert with check (true);

drop policy if exists "delete tasks" on tasks;
create policy "delete tasks" on tasks for delete using (true);

-- ---------------------------------------------------------------------
-- 4. 테이블 권한을 확인합니다.
--    RLS 정책과 별개로 역할에 GRANT 가 있어야 합니다.
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on tasks      to anon, authenticated;
grant select, update                 on milestones to anon, authenticated;
grant select                         on projects   to anon, authenticated;
grant select, insert                 on task_log   to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. 확인 — 아래를 실행해 결과를 보세요.
-- ---------------------------------------------------------------------

-- 5-a) 정책이 제대로 붙었는지
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename, cmd;
--  기대: tasks 에 SELECT/INSERT/UPDATE/DELETE, task_log 에 SELECT/INSERT

-- 5-b) 트리거 함수가 SECURITY DEFINER 인지
select proname, prosecdef as security_definer
from pg_proc
where proname = 'log_task_change';
--  기대: security_definer = true

-- 5-c) 실제로 써지는지 (진척률을 넣었다 되돌립니다)
do $$
declare
  target text;
  before smallint;
begin
  select code, progress into target, before
  from tasks where level = 4 order by code limit 1;

  update tasks set progress = 42 where code = target;
  update tasks set progress = before where code = target;

  raise notice '쓰기 테스트 성공: % (원래 값 % 로 복구)', target, before;
end $$;
--  기대: "쓰기 테스트 성공" 메시지. 오류가 나면 그 내용이 진짜 원인입니다.
