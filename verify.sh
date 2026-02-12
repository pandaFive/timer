#!/usr/bin/env bash
# 全品質チェックを一括実行するスクリプト
# コミット前・PR作成前に使用する

set -euo pipefail

# --- スクリプトのディレクトリに移動 ---
cd "$(dirname "$0")"

# --- 色定義 ---
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
BOLD='\033[1m'
RESET='\033[0m'

# --- 設定 ---
TOTAL_STEPS=5
CURRENT_STEP=0
START_TIME=$(date +%s)

# --- ユーティリティ関数 ---
step() {
  CURRENT_STEP=$1
  echo -e "\n${BLUE}${BOLD}[$1/${TOTAL_STEPS}]${RESET} ${BOLD}$2${RESET}"
}

pass() {
  echo -e "  ${GREEN}✓ $1${RESET}"
}

fail() {
  echo -e "  ${RED}✗ $1${RESET}" >&2
  exit 1
}

# --- 失敗時のサマリー表示 ---
cleanup() {
  local exit_code=$?
  if [ "$exit_code" -ne 0 ]; then
    local end_time
    end_time=$(date +%s)
    local elapsed=$((end_time - START_TIME))
    echo -e "\n${RED}${BOLD}========================================${RESET}" >&2
    echo -e "${RED}${BOLD}  ステップ ${CURRENT_STEP}/${TOTAL_STEPS} で失敗 (${elapsed}秒)${RESET}" >&2
    echo -e "${RED}${BOLD}========================================${RESET}" >&2
  fi
}
trap cleanup EXIT

# --- 前提条件チェック ---
if [ ! -f "package.json" ]; then
  echo -e "${RED}${BOLD}エラー: package.json が見つかりません。プロジェクトルートから実行してください。${RESET}" >&2
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo -e "${RED}${BOLD}エラー: node_modules が見つかりません。先に 'npm install' を実行してください。${RESET}" >&2
  exit 1
fi

# --- チェック実行関数 ---
run_check() {
  local n="$1" label="$2" pass_msg="$3" fail_msg="$4"
  shift 4
  step "$n" "$label"
  if "$@"; then
    pass "$pass_msg"
  else
    fail "$fail_msg"
  fi
}

echo -e "${BOLD}========================================${RESET}"
echo -e "${BOLD}  品質チェック開始${RESET}"
echo -e "${BOLD}========================================${RESET}"

# --- チェック実行 ---
run_check 1 "TypeScript 型チェック" "型チェック完了" "型チェック失敗" \
  npx --no-install tsc --noEmit
run_check 2 "ESLint" "Lint完了" "Lint失敗" \
  npm run --silent lint
run_check 3 "Prettier フォーマットチェック" "フォーマットチェック完了" "フォーマットチェック失敗（npm run format で修正可能）" \
  npm run --silent format:check
run_check 4 "テスト" "テスト完了" "テスト失敗" \
  npm run --silent test
run_check 5 "ビルド" "ビルド完了" "ビルド失敗" \
  npx --no-install vite build

# --- サマリー ---
END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo -e "\n${GREEN}${BOLD}========================================${RESET}"
echo -e "${GREEN}${BOLD}  全チェック完了 (${ELAPSED}秒)${RESET}"
echo -e "${GREEN}${BOLD}========================================${RESET}"
