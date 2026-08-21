#!/usr/bin/env bash
# Render 빌드 단계에서 실행됩니다.
set -e

# 1) 대시보드 Environment 값을 정적 파일로 굽습니다.
cat > assets/js/config.js <<CFG
window.__WBS_ENV__ = {
  SUPABASE_URL: "${SUPABASE_URL:-}",
  SUPABASE_ANON_KEY: "${SUPABASE_ANON_KEY:-}"
};
CFG
echo "config.js 생성 완료 (URL 설정됨: ${SUPABASE_URL:+yes})"

# 2) CSS/JS 에 배포 버전을 붙여 브라우저 캐시를 확실히 갱신합니다.
#    (폰트를 바꿨는데 옛 app.css 가 캐시돼 그대로 보이는 문제 방지)
VER="${RENDER_GIT_COMMIT:-$(date +%s)}"
VER="${VER:0:8}"
sed -i -E "s#(\./assets/(css|js)/[A-Za-z0-9_.-]+)(\?v=[A-Za-z0-9]+)?#\1?v=${VER}#g" index.html
echo "자산 버전 스탬프: ${VER}"
grep -o 'assets/[a-z]*/[A-Za-z0-9_.-]*?v=[A-Za-z0-9]*' index.html || true
