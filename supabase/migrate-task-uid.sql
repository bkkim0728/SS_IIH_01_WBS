-- =====================================================================
--  WBS HUB / Task 고정 ID (uid) 추가
--
--  WBS 코드는 번호 정리로 바뀝니다. 코드를 신원으로 쓰면, 번호가 바뀐 뒤에
--  예전 엑셀을 올렸을 때 값이 엉뚱한 Task 에 들어갑니다.
--  그래서 코드와 무관한 고정 ID 를 따로 둡니다.
--
--  실행하지 않아도 앱은 동작합니다(브라우저에서 ID 를 만들어 씁니다).
--  팀이 Supabase 를 함께 쓰신다면 실행해 주세요.
--
--  실행 위치: Supabase Dashboard > SQL Editor > New query
--  여러 번 실행해도 안전합니다.
-- =====================================================================

alter table tasks add column if not exists uid text;

-- 아직 비어 있는 행에 코드 순서대로 T0001 … 을 붙입니다.
with numbered as (
  select id,
         'T' || lpad(row_number() over (
           order by string_to_array(code, '.')::int[]
         )::text, 4, '0') as new_uid
  from tasks
  where uid is null or uid = ''
)
update tasks t
   set uid = n.new_uid
  from numbered n
 where t.id = n.id;

-- 같은 ID 가 두 번 생기지 않게 합니다.
drop index if exists tasks_uid_key;
create unique index if not exists tasks_uid_key on tasks (project_id, uid);

-- 확인
do $$
declare
  n_total int;
  n_uid   int;
begin
  select count(*), count(uid) into n_total, n_uid from tasks;
  if n_total = n_uid then
    raise notice '설치 완료 — Task % 건 모두 고정 ID 를 가졌습니다', n_total;
  else
    raise notice '주의 — Task % 건 중 % 건만 ID 가 있습니다', n_total, n_uid;
  end if;
end $$;

-- select uid, code, name from tasks order by uid limit 10;
