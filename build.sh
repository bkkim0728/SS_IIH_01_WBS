#!/usr/bin/env bash
# Render 빌드 단계에서 실행됩니다.
set -e

# 1) 대시보드 Environment 값을 정적 파일로 굽습니다.
#    URL 뒤에 붙은 슬래시나 /rest/v1 은 여기서 미리 잘라냅니다.
CLEAN_URL="$(printf '%s' "${SUPABASE_URL:-}" | sed -E 's#/rest/v1.*$##; s#/+$##')"
cat > assets/js/config.js <<CFG
window.__WBS_ENV__ = {
  SUPABASE_URL: "${CLEAN_URL}",
  SUPABASE_ANON_KEY: "${SUPABASE_ANON_KEY:-}"
};
CFG
echo "config.js 생성 완료 (URL: ${CLEAN_URL:-미설정})"

# 2) 배포 버전 스탬프로 브라우저 캐시를 확실히 갱신합니다.
VER="${RENDER_GIT_COMMIT:-$(date +%s)}"
VER="${VER:0:8}"

#   2-a) index.html 이 부르는 CSS/JS
sed -i -E "s#(\./assets/(css|js)/[A-Za-z0-9_.-]+)(\?v=[A-Za-z0-9]+)?#\1?v=${VER}#g" index.html

#   2-b) JS 안의 ES 모듈 import 경로
#        이걸 빼먹으면 app.js 만 새것이고 store.js/seed.js 는 옛 캐시가 쓰입니다.
sed -i -E "s#(from '\./[A-Za-z0-9_-]+\.js)(\?v=[A-Za-z0-9]+)?(')#\1?v=${VER}\3#g" assets/js/*.js

#   2-c) CSS 안의 폰트 경로 (폰트는 내용이 안 바뀌므로 버전 없이 둡니다)

echo "자산 버전 스탬프: ${VER}"
echo "--- index.html ---"
grep -o 'assets/[a-z]*/[A-Za-z0-9_.-]*?v=[A-Za-z0-9]*' index.html
echo "--- module imports ---"
grep -ho "from '\./[A-Za-z0-9_.-]*\.js?v=[A-Za-z0-9]*'" assets/js/*.js
