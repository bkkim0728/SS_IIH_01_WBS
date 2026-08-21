#!/usr/bin/env bash
# Render 빌드 단계에서 실행됩니다.
# Render 대시보드의 Environment 에 넣은 값을 정적 파일로 굽습니다.
set -e
cat > assets/js/config.js <<CFG
window.__WBS_ENV__ = {
  SUPABASE_URL: "${SUPABASE_URL:-}",
  SUPABASE_ANON_KEY: "${SUPABASE_ANON_KEY:-}"
};
CFG
echo "config.js 생성 완료 (URL 설정됨: ${SUPABASE_URL:+yes})"
