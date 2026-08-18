#!/usr/bin/env bash
# cross-review スキルが Codex を安全に呼び出すためのラッパー。
#
# 使い方:
#   run-codex-review.sh <tmpdir> <project-dir>
#
#   <tmpdir>       mktemp -d "${TMPDIR:-/tmp}/cross-review.XXXXXX" が返したディレクトリ。
#                  呼び出し側が Write ツールで <tmpdir>/request.md を書いてから渡す。
#   <project-dir>  レビュー対象プロジェクトの絶対パス。
#
# 標準出力: Codex の最終メッセージのみ。失敗時は "CODEX_FAILED ..." の 1 行のみ。
# 副作用: 終了時に <tmpdir> を丸ごと削除する。
#
# cleanup で削除してよい対象は、次の 4 条件をすべて満たすディレクトリだけ:
#   1. basename が cross-review.?????? の形
#   2. symlink ではない
#   3. 実在するディレクトリ
#   4. 親ディレクトリの canonical path が ${TMPDIR:-/tmp} の canonical path と一致する
# 1 つでも満たさない場合は削除せず CODEX_FAILED reason=invalid_tmpdir を返す。
#
# 検証済みの前提（codex-cli 0.147.0）:
# - `--full-auto` は `codex exec` に存在せず、付けると呼び出し自体が失敗する。
#   `--sandbox read-only` で書き込みは既に防いでいるので付けない。
# - Codex は実行ログ（バナー・hook・ツール呼び出しの経過）を標準出力と標準エラー出力の
#   両方に流し、最終メッセージはその末尾に埋もれる。標準出力だけを捨てると標準エラー
#   出力の分がそのまま呼び出し元のコンテキストに流れ込み、実測で 100KB を超える
#   ノイズになる。両方を捨て、-o が別ファイルに書いた最終メッセージだけを返す。
# - このスクリプトは bash として実行されるため、呼び出し元の対話シェルが zsh でも
#   影響しない。ただし変数名 `status` は zsh で $? の読み取り専用エイリアスになって
#   おり、`status=$?` は他の場所にコピーされたときに壊れやすいので、ここでも避けて
#   `rc` を使う。
# - 議論の各ラウンドも `codex exec resume <session-id>` ではなく、この毎回ステート
#   レスな `codex exec` を使う。実機検証で、resume した 2 回目の呼び出しが 1 回目の
#   `--sandbox read-only` を引き継がず、ワークツリーへの書き込みが成功した。resume
#   がサンドボックスモードを安全に継承すると公式に確認できない限り、この方式は変えない。

set -u

tmpdir="${1:?tmpdir を渡す}"
project_dir="${2:?project-dir を渡す}"

# realpath が無い環境（一部の macOS）でも動く canonical path 解決。
canonical() {
  if command -v realpath >/dev/null 2>&1; then
    realpath -- "$1" 2>/dev/null
  else
    ( cd -- "$1" 2>/dev/null && pwd -P )
  fi
}

# このスクリプトが作ったのではないディレクトリを誤って削除しないための確認。
# basename の形だけでなく、実際に ${TMPDIR:-/tmp} の直下にある実在ディレクトリで、
# symlink ではないことまで確認する。cleanup からも同じ関数で再確認する。
is_safe_tmpdir() {
  case "$(basename -- "$1")" in
    cross-review.??????) ;;
    *) return 1 ;;
  esac
  [ -L "$1" ] && return 1
  [ -d "$1" ] || return 1
  expected_root="$(canonical "${TMPDIR:-/tmp}")"
  actual_parent="$(canonical "$(dirname -- "$1")")"
  [ -n "$expected_root" ] && [ -n "$actual_parent" ] && [ "$expected_root" = "$actual_parent" ]
}

if ! is_safe_tmpdir "$tmpdir"; then
  echo "CODEX_FAILED reason=invalid_tmpdir"
  exit 0
fi

cleanup() {
  is_safe_tmpdir "$tmpdir" && rm -rf -- "$tmpdir"
}
trap cleanup EXIT INT TERM

request="$tmpdir/request.md"
output="$tmpdir/codex.md"

if [ ! -s "$request" ]; then
  echo "CODEX_FAILED reason=missing_request"
  exit 0
fi

codex exec --sandbox read-only --cd "$project_dir" \
  -o "$output" - < "$request" > /dev/null 2>&1
rc=$?

if [ "$rc" -ne 0 ] || [ ! -s "$output" ]; then
  echo "CODEX_FAILED status=$rc"
  exit 0
fi

cat "$output"
