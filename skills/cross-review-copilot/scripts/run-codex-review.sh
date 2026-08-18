#!/usr/bin/env bash
# cross-review-copilot スキルが Codex を安全に呼び出すためのラッパー。
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

set -u

tmpdir="${1:?tmpdir を渡す}"
project_dir="${2:?project-dir を渡す}"

# このスクリプトが作ったのではないディレクトリを誤って削除しないための確認。
case "$(basename -- "$tmpdir")" in
  cross-review.??????) ;;
  *)
    echo "CODEX_FAILED reason=invalid_tmpdir"
    exit 0
    ;;
esac

cleanup() {
  [ -d "$tmpdir" ] && rm -rf -- "$tmpdir"
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
