-- =====================================================================
--  WBS HUB / 마일스톤 Main·Sub 구분 + 등록·삭제 허용
--
--  이걸 실행하지 않아도 앱은 동작합니다. 다만 마일스톤이 각자 브라우저에만
--  저장되어 팀원끼리 공유되지 않습니다.
--
--  실행 위치: Supabase Dashboard > SQL Editor > New query
--  데이터를 지우지 않습니다. 여러 번 실행해도 안전합니다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 종류 컬럼 (main = 큰 마디, sub = 작은 마디)
-- ---------------------------------------------------------------------
alter table milestones add column if not exists kind text not null default 'main';

-- 값을 먼저 정리한 뒤에 제약조건을 겁니다.
-- (순서를 바꾸면 이상한 값이 하나라도 있을 때 제약조건 추가에서 막힙니다)
update milestones set kind = 'main' where kind not in ('main', 'sub');

alter table milestones drop constraint if exists milestones_kind_chk;
alter table milestones add constraint milestones_kind_chk
  check (kind in ('main', 'sub'));

-- ---------------------------------------------------------------------
-- 2. 등록·삭제 권한
--    지금까지는 읽기와 수정만 열려 있어 새 마일스톤을 만들 수 없었습니다.
-- ---------------------------------------------------------------------
drop policy if exists "insert milestones" on milestones;
create policy "insert milestones" on milestones for insert with check (true);

drop policy if exists "delete milestones" on milestones;
create policy "delete milestones" on milestones for delete using (true);

grant select, insert, update, delete on milestones to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. 확인 — 아래가 함께 실행되어 결과를 알려줍니다.
-- ---------------------------------------------------------------------
do $$
declare
  n_main int;
  n_sub  int;
  n_pol  int;
  proj    uuid;
  test_id uuid;
begin
  select count(*) filter (where kind = 'main'),
         count(*) filter (where kind = 'sub')
    into n_main, n_sub
    from milestones;

  select count(*) into n_pol
    from pg_policies
   where schemaname = 'public' and tablename = 'milestones'
     and cmd in ('INSERT', 'DELETE');

  -- 실제로 등록·삭제가 되는지 한 건 넣었다 지웁니다.
  select id into proj from projects limit 1;

  if proj is null then
    raise notice '설치 완료 — main % 건 / sub % 건, insert·delete 정책 % 개. '
                 '(projects 가 비어 있어 쓰기 테스트는 건너뜁니다. seed.sql 을 먼저 실행하세요)',
      n_main, n_sub, n_pol;
    return;
  end if;

  insert into milestones (project_id, name, start_date, end_date, note, kind, sort_order)
  values (proj, '__연결확인__', null, null, '', 'sub', 999)
  returning id into test_id;

  delete from milestones where id = test_id;

  if test_id is null then
    raise notice '주의 — 등록은 통과했지만 새 행 id 를 받지 못했습니다. 정책을 다시 확인하세요.';
  else
    raise notice '설치 완료 — main % 건 / sub % 건, insert·delete 정책 % 개, 쓰기 테스트 성공',
      n_main, n_sub, n_pol;
  end if;
exception when others then
  raise notice '문제 발생 — % (%)', sqlerrm, sqlstate;
end $$;

-- 직접 확인하고 싶으실 때
-- select kind, count(*) from milestones group by kind;
-- select policyname, cmd from pg_policies where tablename = 'milestones' order by cmd;
