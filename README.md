# WBS HUB

삼성증권 **SS-SIIIDS 투자정보 HUB + 해외시세 감시** 프로젝트의 WBS 진척 관리 도구입니다.
`template_SS-SIIIDS_WBS_v0_4.xlsx` 를 그대로 옮겨 담았습니다.

| 항목 | 값 |
|---|---|
| Task | 151건 (L1 5 · L2 5 · L3 31 · **L4 리프 110**) |
| 마일스톤 | 8개 |
| 기간 | 2026.09.01 → 2027.07.02 (**44주**) |
| 산출물 | 34종 |
| 단계 가중치 | 분석/설계 25% · 개발 40% · 테스트 20% · 이행 5% · 안정화 5% |

**스택**: 정적 HTML/CSS/JS (빌드 없음) · Supabase(Postgres) · Render(정적 호스팅) · GitHub

---

## 1. 지금 바로 보기

Supabase 없이도 돕니다. 진척은 브라우저에만 저장됩니다.

```bash
npx http-server .        # 또는
python -m http.server 8000
```

브라우저에서 `http://localhost:8000` 을 엽니다.

> `index.html` 을 더블클릭하면 열리지 않습니다. ES 모듈은 `file://` 에서 차단되므로
> 위 명령 중 하나로 로컬 서버를 띄워야 합니다.

---

## 2. GitHub에 올리기

```bash
git init
git add .
git commit -m "WBS HUB 최초 커밋"
git branch -M main
git remote add origin https://github.com/<계정>/wbs-hub.git
git push -u origin main
```

---

## 3. Supabase 연결하기

팀이 같은 진척을 보려면 이 단계가 필요합니다.

1. [supabase.com](https://supabase.com) 에서 새 프로젝트를 만듭니다. 리전은 **Northeast Asia (Seoul)** 을 고르세요.
2. 좌측 **SQL Editor > New query** 로 이동합니다.
3. `supabase/schema.sql` 전체를 붙여넣고 **Run**.
4. 새 쿼리를 열어 `supabase/seed.sql` 전체를 붙여넣고 **Run**.
5. 확인:
   ```sql
   select level, count(*) from tasks group by level order by level;
   -- 1|5  2|5  3|31  4|110
   select * from v_task_rollup;
   ```
6. **Project Settings > API** 에서 두 값을 복사합니다.
   - `Project URL` → `https://xxxxxxxx.supabase.co`
   - `anon` `public` 키 (`service_role` 키는 절대 쓰지 마세요)
7. 앱의 **설정** 화면에 붙여넣고 **연결하고 새로고침**을 누릅니다.

### 권한 정책 고르기

`schema.sql` 안에 두 가지가 들어 있습니다. 기본은 A안입니다.

| | 누가 볼 수 있나 | 누가 고칠 수 있나 | 언제 쓰나 |
|---|---|---|---|
| **A안** (기본) | 링크를 아는 사람 | 링크를 아는 사람 | 사내 공유, 빠른 시작 |
| **B안** | 링크를 아는 사람 | 로그인한 사람만 | 고객사 공유, 감사 대응 |

B안으로 바꾸려면 `schema.sql` 6번 섹션에서 A안 `write all` 정책을 지우고
B안 주석을 해제한 뒤, Supabase **Authentication** 에서 사용자를 초대하세요.

---

## 4. Render에 배포하기

1. [render.com](https://render.com) 로그인 → **New > Blueprint**
2. 방금 올린 GitHub 저장소를 선택합니다. `render.yaml` 을 자동으로 읽습니다.
3. **Environment** 에 두 값을 넣습니다.

   | Key | Value |
   |---|---|
   | `SUPABASE_URL` | `https://xxxxxxxx.supabase.co` |
   | `SUPABASE_ANON_KEY` | `eyJhbGciOi...` |

4. **Apply** 를 누르면 `build.sh` 가 이 값들을 `assets/js/config.js` 로 구워 넣습니다.
   접속하는 모두가 별도 설정 없이 Supabase 모드로 들어옵니다.

무료 플랜으로 충분합니다. 정적 사이트라 슬립이 없고, main 브랜치에 push하면 자동 재배포됩니다.

> **anon 키를 공개해도 되나요?**
> 됩니다. anon 키는 브라우저에 노출되도록 설계된 값이고, 실제 접근 통제는 RLS 정책이 합니다.
> 다만 A안 정책은 링크를 아는 사람이 수정할 수 있다는 뜻이므로, 외부 공유 전에는 B안으로 바꾸세요.

---

## 5. 화면

| 화면 | 하는 일 |
|---|---|
| **진척 현황** | 가중치 반영 전체 진척, 계획 대비 실적 격차, 단계별 막대, 다음 마일스톤, 공유 안건 |
| **WBS 트리** | L1~L4 계층, 진척 슬라이더, 상태 변경, 검색, 상태/레벨 필터, CSV 내보내기 |
| **일정 간트** | 44주 레일, L1~L4 깊이 전환, 오늘 선, 마일스톤 세로선 |
| **산출물** | 34종 문서별 진척과 관련 Task |
| **변경 이력** | 진척/상태 변경 기록 (Supabase 모드에서는 DB 트리거가 기록) |
| **설정** | Supabase 연결, 저장 위치 확인, CSV/JSON 내보내기, 초기화 |

단축키: `/` 로 검색창에 바로 들어갑니다.

---

## 6. 원본 데이터에서 손본 것

투명하게 남겨 둡니다. 화면과 `seed.sql` 에도 표시됩니다.

### 마일스톤 연도 보정 (5건)

원본 H:K 열의 마일스톤 5건이 **2026년으로 잘못 적혀** 있습니다.
개발 종료가 `2026-03-19`인데 시작이 `2026-11-16` 이라 앞뒤가 맞지 않습니다.
주차 헤더(BM열 = `2027-07-02`)를 기준으로 2027년으로 보정했습니다.

| 마일스톤 | 원본 | 보정 |
|---|---|---|
| 개발 종료 | 2026-03-19 | **2027**-03-19 |
| 테스트 | 2026-03-22 ~ 05-14 | **2027**-03-22 ~ 05-14 |
| Cutover | 2026-05-17 ~ 05-28 | **2027**-05-17 ~ 05-28 |
| Grand Open | 2026-05-31 ~ 06-07 | **2027**-05-31 ~ 06-07 |
| 안정화, 검수 | 2026-06-07 ~ 06-30 | **2027**-06-07 ~ 06-30 |

### 계획일 자동 배치 (106건)

원본 M/N 열에 계획일이 들어 있는 Task는 **110건 중 4건**뿐입니다
(`2.1.1.3`, `2.1.5.2`, `2.1.6.1`, `2.1.9.2`).

나머지는 각 단계의 마일스톤 구간 안에서 영업일 기준으로 순서대로 배치했습니다.
트리 화면에서 **흐린 날짜**가 자동 배치분, 밝은 날짜가 원본입니다.
DB의 `tasks.date_source` 컬럼(`file` / `auto` / `rollup`)으로도 구분됩니다.

실제 일정이 정해지면 그대로 덮어쓰면 됩니다. 자동값은 아무것도 잠그지 않습니다.

### 작업명 빈 칸 (5건)

`3.1.2.1`, `3.1.2.2`, `3.1.2.3`, `6.1.3.2`, `6.1.3.3` 은 원본에 작업명이 비어 있어
`(작업명 미정)` 으로 표시됩니다. 채워야 할 자리로 남겨 두었습니다.

### 가중치

전체 비중(O열)의 합이 **0.95** 입니다. 0.05가 비어 있고, 원본 15행에 `L1 = 0` 인 빈 행이
있는 것으로 보아 착수 단계 몫으로 보입니다. 임의로 채우지 않고 원본 그대로 두었으며,
전체 진척률은 존재하는 가중치 합(0.95)으로 정규화해 계산합니다.

---

## 7. 원본 엑셀이 갱신되면

`seed.js` 와 `seed.sql` 은 자동 생성 파일입니다. 손으로 고치지 마세요.
새 버전의 xlsx가 나오면 같은 추출 과정을 다시 돌려 두 파일을 교체하고,
Supabase 에서는 `seed.sql` 재실행 전에 `tasks` 를 비우거나
`on conflict ... do update` 로 바꿔 쓰세요.

---

## 8. 파일 구조

```
wbs-hub/
├── index.html                  앱 셸
├── assets/
│   ├── css/app.css             디자인 토큰과 전체 스타일
│   └── js/
│       ├── seed.js             xlsx에서 추출한 WBS 데이터 (자동 생성)
│       ├── store.js            Supabase / 브라우저 저장소 어댑터
│       ├── app.js              화면 6개와 상호작용
│       └── config.js           배포 시 build.sh 가 덮어씀
├── supabase/
│   ├── schema.sql              테이블, RLS, 롤업 뷰, 이력 트리거, Realtime
│   └── seed.sql                Task 151건 + 마일스톤 8건 (자동 생성)
├── render.yaml                 Render Blueprint
├── build.sh                    환경변수를 config.js 로 굽는 스크립트
└── .github/workflows/check.yml 문법 검사
```
