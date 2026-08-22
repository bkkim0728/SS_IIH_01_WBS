/* ==================================================================
   staff.js — 투입인력 계획표
   원본: 투입인력_계획표_외주업체_전체_260821.xlsx 의 '데이터' 시트
   (서비스 · 메가존 시트는 요청에 따라 제외했습니다)
   엑셀의 2단 머리글·TOTAL 행·업체별 요약을 그대로 옮겼습니다.
   photo 는 assets/photos/ 의 파일을 가리킵니다 (전부 흑백).
   ================================================================== */
export const STAFF = [
 {
  "sheet": "데이터",
  "title": "투입계획_데이터 HUB & 시세감시/이벤트",
  "groups": [
   {
    "label": "분석&설계",
    "at": 0,
    "span": 3
   },
   {
    "label": "개발",
    "at": 3,
    "span": 4
   },
   {
    "label": "통합 테스트",
    "at": 7,
    "span": 2
   },
   {
    "label": "안정화",
    "at": 9,
    "span": 1
   }
  ],
  "months": [
   "M1",
   "M2",
   "M3",
   "M4",
   "M5",
   "M6",
   "M7",
   "M8",
   "M9",
   "M10"
  ],
  "rows": [
   {
    "no": 1,
    "vendor": "FnGuide",
    "part": "데이터 HUB",
    "role": "정보기술기획(PM)",
    "photo": "./assets/photos/방동준.jpg",
    "name": "방동준",
    "grade": "부장\n(리더)",
    "phone": "010-7474-8263",
    "total": 9,
    "months": [
     1,
     1,
     1,
     1,
     1,
     1,
     1,
     1,
     1,
     ""
    ],
    "note": ""
   },
   {
    "no": 2,
    "vendor": "FnGuide",
    "part": "데이터 HUB",
    "role": "데이터아키텍처",
    "photo": "./assets/photos/최승산.jpg",
    "name": "최승산",
    "grade": "과장",
    "phone": "010-5628-9112",
    "total": 6,
    "months": [
     1,
     1,
     1,
     1,
     1,
     1,
     "",
     "",
     "",
     ""
    ],
    "note": "리서치 화면 기획"
   },
   {
    "no": 3,
    "vendor": "FnGuide",
    "part": "데이터 HUB",
    "role": "데이터아키텍처",
    "photo": "./assets/photos/김현경.jpg",
    "name": "김현경",
    "grade": "대리",
    "phone": "010-9012-2198",
    "total": 5,
    "months": [
     1,
     1,
     1,
     1,
     1,
     "",
     "",
     "",
     "",
     ""
    ],
    "note": ""
   },
   {
    "no": 4,
    "vendor": "FnGuide",
    "part": "데이터 HUB",
    "role": "데이터아키텍처",
    "photo": "./assets/photos/최민서.jpg",
    "name": "최민서",
    "grade": "사원",
    "phone": "010-8646-3453",
    "total": 5,
    "months": [
     1,
     1,
     1,
     1,
     1,
     "",
     "",
     "",
     "",
     ""
    ],
    "note": "리서치 유지보수"
   },
   {
    "no": 5,
    "vendor": "FnGuide",
    "part": "데이터 HUB",
    "role": "Vetcor DB 개발",
    "photo": "./assets/photos/양봉석.jpg",
    "name": "양봉석",
    "grade": "사원",
    "phone": "010-3566-3938",
    "total": 2,
    "months": [
     "",
     "",
     1,
     1,
     "",
     "",
     "",
     "",
     "",
     ""
    ],
    "note": ""
   },
   {
    "no": 6,
    "vendor": "FnGuide",
    "part": "데이터 HUB",
    "role": "파이프라인 개발",
    "photo": "./assets/photos/이홍규.jpg",
    "name": "이홍규",
    "grade": "과장",
    "phone": "010-8862-6031",
    "total": 8,
    "months": [
     "",
     1,
     1,
     1,
     1,
     1,
     1,
     1,
     1,
     ""
    ],
    "note": "리서치 DB 개발"
   },
   {
    "no": 7,
    "vendor": "FnGuide",
    "part": "데이터 HUB",
    "role": "파이프라인 개발",
    "photo": "./assets/photos/박성권.jpg",
    "name": "박성권",
    "grade": "과장",
    "phone": "010-2308-0624",
    "total": 8,
    "months": [
     "",
     1,
     1,
     1,
     1,
     1,
     1,
     1,
     1,
     ""
    ],
    "note": ""
   },
   {
    "no": 8,
    "vendor": "FnGuide",
    "part": "데이터 HUB",
    "role": "파이프라인 개발",
    "photo": "./assets/photos/백지훈.jpg",
    "name": "백지훈",
    "grade": "차장",
    "phone": "010-9493-3807",
    "total": 7,
    "months": [
     "",
     1,
     1,
     1,
     1,
     1,
     1,
     1,
     "",
     ""
    ],
    "note": ""
   },
   {
    "no": 9,
    "vendor": "FnGuide",
    "part": "데이터 HUB",
    "role": "파이프라인 개발",
    "photo": "./assets/photos/최형준.jpg",
    "name": "최형준",
    "grade": "대리",
    "phone": "010-3046-9154",
    "total": 6,
    "months": [
     "",
     "",
     1,
     1,
     1,
     1,
     1,
     1,
     "",
     ""
    ],
    "note": "26.08.21 교체"
   },
   {
    "no": 10,
    "vendor": "FnGuide",
    "part": "데이터 HUB",
    "role": "UI/UX 개발",
    "photo": "./assets/photos/임종용.jpg",
    "name": "임종용",
    "grade": "대리",
    "phone": "010-6368-8628",
    "total": 4,
    "months": [
     "",
     "",
     "",
     "",
     1,
     1,
     1,
     1,
     "",
     ""
    ],
    "note": ""
   },
   {
    "no": 11,
    "vendor": "한국금융IT",
    "part": "시세 감시/이벤트",
    "role": "해외시세 포착 개발",
    "photo": "./assets/photos/김형길.jpg",
    "name": "김형길",
    "grade": "부장\n(리더)",
    "phone": "010-8711-0771",
    "total": 7.5,
    "months": [
     "",
     "",
     1,
     1,
     1,
     1,
     1,
     1,
     1,
     0.5
    ],
    "note": "프로젝트 관리\n요구사항 분석, 아키텍처 설계\n감시 엔진 설계 및 핵심 기능 개발\n대외 인터페이스 설계\n테스트 및 안정화"
   },
   {
    "no": 12,
    "vendor": "한국금융IT",
    "part": "시세 감시/이벤트",
    "role": "해외시세 포착 개발",
    "photo": "./assets/photos/이성철.jpg",
    "name": "이성철",
    "grade": "차장",
    "phone": "010-9706-1546",
    "total": 7.5,
    "months": [
     "",
     "",
     1,
     1,
     1,
     1,
     1,
     1,
     1,
     0.5
    ],
    "note": "해외시세 수신\nIn-Memory 기반 감시 기능 개발\n이벤트 생성 개발\n테스트 및 안정화"
   }
  ],
  "totals": {
   "total": 75,
   "months": [
    4,
    7,
    11,
    11,
    11,
    9,
    8,
    8,
    5,
    1
   ]
  },
  "summary": [
   {
    "vendor": "FnGuide",
    "total": 60,
    "months": [
     4,
     7,
     9,
     9,
     9,
     7,
     6,
     6,
     3,
     0
    ]
   },
   {
    "vendor": "한국금융IT",
    "total": 15,
    "months": [
     2,
     2,
     2,
     2,
     2,
     2,
     2,
     1,
     0,
     0
    ]
   }
  ]
 }
];
