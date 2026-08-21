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
6. **Project URL 과 API 키를 복사합니다.** 아래 "키를 못 찾을 때" 참고.
7. 앱의 **설정** 화면에 붙여넣고 **연결하고 새로고침**을 누릅니다.

### 키를 못 찾을 때

Supabase 가 대시보드를 개편해서, 예전에 `Settings > API` 한 화면에 같이 있던 것이
**`Settings > Data API`(URL)** 와 **`Settings > API Keys`(키)** 로 갈라졌습니다.
옛 튜토리얼을 따라가면 안 나옵니다.

**가장 빠른 길: 프로젝트 상단의 `Connect` 버튼.** URL 과 키가 한 화면에 같이 나옵니다.

직접 찾으려면:

| 필요한 값 | 위치 |
|---|---|
| Project URL | `Settings > Data API` → **Project URL** |
| API 키 | `Settings > API Keys` → **Publishable key** |
| (레거시) anon 키 | `Settings > API Keys` → **Legacy API Keys** 탭 |

URL 은 주소창에서도 알 수 있습니다. 대시보드 주소가
`https://supabase.com/dashboard/project/abcdefgh...` 라면
Project URL 은 `https://abcdefgh....supabase.co` 입니다.

**Publishable 키가 안 보이면** `Settings > API Keys` 에서 **Create new API keys** 를 누르세요.
기존 anon 키는 그대로 살아 있으니 안전합니다.

### 어느 키를 넣어야 하나

| 키 | 형식 | 이 앱에 |
|---|---|---|
| **Publishable** | `sb_publishable_...` | ✅ 권장 |
| anon (레거시) | `eyJhbGciOi...` | ✅ 됨 (2026년 말 지원 종료 예정) |
| Secret | `sb_secret_...` | ❌ 절대 금지 |
| service_role (레거시) | `eyJhbGciOi...` | ❌ 절대 금지 |

Secret 계열은 RLS 를 통째로 우회하므로 브라우저에 넣으면 DB 전체가 열립니다.

> 앱은 두 형식을 자동으로 구분합니다. 새 publishable 키는 JWT 가 아니라서
> `Authorization: Bearer` 헤더에 넣으면 Supabase 가 거부하기 때문에, JWT 로 시작하는
> 레거시 키일 때만 그 헤더를 붙입니다.

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
   | `SUPABASE_ANON_KEY` | `sb_publishable_...` 또는 `eyJhbGciOi...` |

4. **Apply** 를 누르면 `build.sh` 가 이 값들을 `assets/js/config.js` 로 구워 넣습니다.
   접속하는 모두가 별도 설정 없이 Supabase 모드로 들어옵니다.

정적 사이트라 슬립이 없고, main 브랜치에 push하면 자동 재배포됩니다.

### 배포 후 문제가 생길 때

앱의 **설정** 화면 오른쪽 **진단** 카드를 먼저 보세요. 글꼴이 내려왔는지, 지금 보고 있는
CSS 가 몇 번째 배포인지, Supabase 가 어떤 URL 로 붙고 있는지가 한 줄씩 나옵니다.

**`PGRST125 Invalid path specified in request URL`**

Project URL 모양이 깨진 경우입니다. 아래 둘 중 하나입니다.

| 잘못 넣은 값 | 만들어지는 경로 |
|---|---|
| `https://xxx.supabase.co/` (끝 슬래시) | `//rest/v1/...` |
| `https://xxx.supabase.co/rest/v1` | `/rest/v1/rest/v1/...` |

앱이 이제 두 경우를 모두 자동으로 잘라내지만, Render 환경변수는
`https://xxx.supabase.co` 형태로 넣는 것이 정확합니다.

진단 카드의 **코드 버전(store.js)** 이 "실패" 로 나오면, `app.js` 는 새것인데
`store.js` 가 옛 캐시인 상태입니다. 강력 새로고침 한 번이면 풀립니다.

**스타일이나 글꼴이 바뀌지 않을 때**

브라우저가 옛 `app.css` 를 붙들고 있는 경우입니다. `render.yaml` 이 이제
CSS/JS/HTML 에 `no-cache` 를 주고, `build.sh` 가 배포마다 `?v=커밋해시` 를 붙입니다.

버전 스탬프는 세 곳 모두에 붙습니다. **셋 중 하나라도 빠지면 옛 파일이 섞여 돕니다.**

1. `index.html` → `app.css`, `app.js`, `config.js`
2. `app.js` 안의 `import './store.js'`
3. `store.js` 안의 `import './seed.js'`

이미 캐시된 브라우저는 한 번만 강력 새로고침 하세요.

- Windows: `Ctrl` + `Shift` + `R`
- Mac: `Cmd` + `Shift` + `R`

진단 카드에서 **글꼴 파일 경로**가 실패로 나오면 캐시가 아니라 파일이 안 올라간 것입니다.
`git status` 로 `assets/fonts/*.woff2` 4개가 커밋됐는지 확인하세요.

### Blueprint 오류가 날 때

**`services[0].plan no such plan free for service type web`**

정적 사이트(`runtime: static`)에는 `plan` 필드를 쓰지 않습니다. 요금제 개념이 없어 항상 무료이고,
`plan` 이 있으면 Render 가 웹 서비스 요금제 목록에서 값을 찾다가 실패합니다.
`render.yaml` 에서 `plan:` 줄을 지우세요.

**`./build.sh: permission denied`**

git 에 실행 권한(+x)이 실리지 않은 경우입니다. `buildCommand` 를 `bash build.sh` 로 두면 해결됩니다.
현재 `render.yaml` 은 이미 그렇게 되어 있습니다.

> **이 키를 공개해도 되나요?**
> 됩니다. publishable / anon 키는 브라우저에 노출되도록 설계된 값이고, 실제 접근 통제는 RLS 정책이 합니다.
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

## 8. 글꼴

본문은 **페이퍼로지(Paperlogy)** 를 자체 호스팅합니다. 배포본 TTF 를 웹용 woff2 로
포맷만 바꿔 `assets/fonts/` 에 넣었고, 디자인과 자족 이름은 그대로입니다.
SIL Open Font License 1.1 이라 이대로 재배포해도 됩니다 (`assets/fonts/LICENSE.txt`).

| 웨이트 | 파일 | 쓰이는 곳 |
|---|---|---|
| 400 Regular | `Paperlogy-400.woff2` | 본문, 설명 |
| 500 Medium | `Paperlogy-500.woff2` | L3 작업명, 마일스톤 이름 |
| 600 SemiBold | `Paperlogy-600.woff2` | 카드 제목, L2 작업명 |
| 700 Bold | `Paperlogy-700.woff2` | 화면 제목, L1 단계명 |

원본 9종 중 4종만 씁니다. 한글 11,172자를 모두 담아 웨이트당 약 160KB,
합계 약 640KB 입니다. 400 과 600 은 `preload` 로 먼저 받고 나머지는 필요할 때 받습니다.

### 손본 것

페이퍼로지는 space 글리프가 0.22em 으로 좁고 한글 자면이 0.88em 으로 촘촘합니다.
그대로 쓰면 단어가 붙어 보여서 두 가지를 조정했습니다.

- `word-spacing: .04em` 을 본문에 적용
- 제목·작업명의 음수 자간을 절반으로 완화 (앞서 쓰던 가변 글꼴 기준값이었습니다)

### 숫자와 코드

WBS 코드, 날짜, 수치는 **JetBrains Mono** 로 두어 표가 세로로 정렬되게 했습니다.
이 글꼴만 구글 폰트 CDN 에서 받습니다.

**사내망에서 CDN 이 막혀도 정렬은 유지됩니다.** 페이퍼로지 숫자가 전부 0.667em
고정폭이라 대체 글꼴로 들어가도 열이 어긋나지 않습니다 (차단 상태로 확인 완료).

완전히 오프라인으로 쓰려면 두 곳만 지우면 됩니다.

1. `index.html` 의 구글 폰트 `<link>` 와 `preconnect` 줄
2. `app.css` 의 `--mono` 값에서 `'JetBrains Mono',`

---

## 9. 파일 구조

```
wbs-hub/
├── index.html                  앱 셸
├── assets/
│   ├── fonts/                  페이퍼로지 woff2 4종 + OFL 고지
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
