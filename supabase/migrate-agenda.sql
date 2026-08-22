-- =====================================================================
--  WBS HUB / 공유 안건 테이블 추가
--
--  이걸 실행하지 않아도 앱은 동작합니다. 다만 안건이 각자 브라우저에만
--  저장되어 팀원끼리 공유되지 않습니다.
--  실행하면 진척 현황 화면의 [공유 안건]이 팀 전체에 공유됩니다.
--
--  실행 위치: Supabase Dashboard > SQL Editor > New query
--  여러 번 실행해도 안전합니다.
-- =====================================================================

create table if not exists agenda (
  id           uuid primary key default gen_random_uuid(),
  project_code text not null,
  text         text not null,
  sort_order   smallint default 0,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create index if not exists agenda_project_idx on agenda (project_code, sort_order);

-- 수정 시각 자동 갱신
create or replace function touch_agenda() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql
   security definer
   set search_path = public, pg_temp;

drop trigger if exists agenda_touch on agenda;
create trigger agenda_touch before update on agenda
  for each row execute function touch_agenda();

-- ---------------------------------------------------------------------
-- 권한
--  A안(기본): 링크를 아는 사람이 읽고 쓸 수 있음
--  B안: 로그인한 사람만 쓰기. 아래 주석을 참고하세요.
-- ---------------------------------------------------------------------
alter table agenda enable row level security;

drop policy if exists "read agenda"   on agenda;
drop policy if exists "insert agenda" on agenda;
drop policy if exists "update agenda" on agenda;
drop policy if exists "delete agenda" on agenda;

create policy "read agenda"   on agenda for select using (true);
create policy "insert agenda" on agenda for insert with check (true);
create policy "update agenda" on agenda for update using (true) with check (true);
create policy "delete agenda" on agenda for delete using (true);

-- B안으로 바꾸려면 위 insert/update/delete 를 지우고 아래를 쓰세요.
-- create policy "auth write agenda" on agenda
--   for all to authenticated using (true) with check (true);

grant select, insert, update, delete on agenda to anon, authenticated;

-- ---------------------------------------------------------------------
-- 초기 안건 (원본 시트 상단에 적혀 있던 항목)
--  이미 들어 있으면 건너뜁니다.
-- ---------------------------------------------------------------------
insert into agenda (project_code, text, sort_order)
select 'SS-SIIIDS', v.text, v.ord
from (values
  ('마일스톤 공유', 0),
  ('어닝콜 조기 오픈 관련 Task, Risk 구체화', 1),
  ('선/후행 Task 합리성 확인', 2),
  ('월별 투입인력과 Task 정합성 확인', 3),
  ('이행, 인수인계, 안정화 Task는 PMO로 통합 검토', 4)
) as v(text, ord)
where not exists (select 1 from agenda where project_code = 'SS-SIIIDS');

-- ---------------------------------------------------------------------
-- 확인
-- ---------------------------------------------------------------------
-- select sort_order, text from agenda order by sort_order;
-- select tablename, policyname, cmd from pg_policies where tablename = 'agenda';
