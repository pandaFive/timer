#!/usr/bin/env bash
# 全品質チェックを一括実行するスクリプト
# コミット前・PR作成前に使用する

set -e

# --- 色定義 ---
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
BOLD='\033[1m'
RESET='\033[0m'

# --- ユーティリティ関数 ---
step() {
  echo -e "\n${BLUE}${BOLD}[$1/5]${RESET} ${BOLD}$2${RESET}"
}

pass() {
  echo -e "  ${GREEN}✓ $1${RESET}"
}

fail() {
  echo -e "  ${RED}✗ $1${RESET}"
  exit 1
}

# --- 実行時間の計測開始 ---
START_TIME=$(date +%s)

echo -e "${BOLD}========================================${RESET}"
echo -e "${BOLD}  品質チェック開始${RESET}"
echo -e "${BOLD}========================================${RESET}"

# --- 1. TypeScript 型チェック ---
step 1 "TypeScript 型チェック"
if npx tsc -b --noEmit; then
  pass "型チェック完了"
else
  fail "型チェック失敗"
fi

# --- 2. ESLint ---
step 2 "ESLint"
if npx eslint src/ tests/; then
  pass "Lint完了"
else
  fail "Lint失敗"
fi

# --- 3. Prettier ---
step 3 "Prettier フォーマットチェック"
if npx prettier --check 'src/**/*.{ts,tsx,css}' 'tests/**/*.{ts,tsx}'; then
  pass "フォーマットチェック完了"
else
  fail "フォーマットチェック失敗（npx prettier --write で修正可能）"
fi

# --- 4. テスト ---
step 4 "テスト"
if npx vitest run; then
  pass "テスト完了"
else
  fail "テスト失敗"
fi

# --- 5. ビルド ---
step 5 "ビルド"
if npx vite build; then
  pass "ビルド完了"
else
  fail "ビルド失敗"
fi

# --- サマリー ---
END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo -e "\n${GREEN}${BOLD}========================================${RESET}"
echo -e "${GREEN}${BOLD}  全チェック完了 (${ELAPSED}秒)${RESET}"
echo -e "${GREEN}${BOLD}========================================${RESET}"
