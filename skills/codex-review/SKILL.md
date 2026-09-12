---
name: codex-review
description: |
  Codex CLI に独立レビューを依頼し、返ってきた指摘を main agent が 1 件ずつ検証して採否を決める。優先度の高い指摘を修正し、修正内容と、方針を決める必要が残ったものを報告する。`codex` CLI が必要。
  Triggers on: "レビュー", "レビューして", "review", "code review", "codex review", "/codex-review"
  Use when: implementation and self-check are done and the change is ready for an independent reviewer.
user-invocable: true
argument-hint: "[--base <branch> | --commit <sha> | 空欄で未コミットの変更]"
license: "GPL-3.0"
---

# Codex Review

役割は非対称である。**Codex は reviewer であって決定権を持たない。main agent がコードの owner であり、各指摘を採用するかどうかを決める。** 変更の意図、ユーザーと確定した設計判断、承認済みの実装計画を持っているのは main agent だけであり、Codex はそれを知らない。

このスキルの前に `self-check` が終わっていることを前提にする。要件の実装漏れ、TODO の残り、lint / typecheck / test の失敗は、独立レビューへ出す前に本人が潰しておく範囲である。

## 扱わないもの

不要コード・YAGNI・過剰な抽象化・「もっと単純に書ける」は扱わない。`lean-review` の担当である。Codex がその種の指摘を返してきた場合は、裁定で落とす。

## 前提条件

```bash
command -v codex
```

無ければその旨を伝えて停止する。このスキルには Codex の代わりに main agent 自身がレビューするフォールバックを置かない。別モデルによる独立レビューという目的が失われるためである。一時的な失敗なら、もう一度実行すればよい。

## Phase 1: Codex の実行

レビュー対象に応じてコマンドを選ぶ。`$ARGUMENTS` に指定が無ければ `--uncommitted` を使う。リポジトリのルートで実行する。

| 対象 | コマンド |
|---|---|
| 未コミットの変更（既定） | `codex review --uncommitted` |
| ベースブランチとの差分 | `codex review --base <branch>` |
| 特定のコミット | `codex review --commit <sha>` |

Phase 3 の修正まで、ワークツリーを変更しない。

`Bash` の `timeout` に `600000` を指定する。数分かかる。

**プロンプトを渡さない。** `codex review` はレビュー用の指示と判定条件を自分で持っている（`~/.codex/skills/.system/review-agent/`）。`approval-policy: never` と `sandbox: read-only` も自動で付く。ここで独自のレビュー観点を上書きすると、Codex 側が更新されても追従しなくなる。

出力にはコマンド実行ログが混ざり、最後の指摘ブロックが 2 回出力されることがある。指摘は 1 回分だけ読む。

出力が空、またはコマンドが失敗した場合は、その事実を報告して停止する。再実行はユーザーの判断に任せる。

## Phase 2: 裁定

**指摘をそのまま適用しない。** 1 件ずつ、該当ファイルを自分で読んで判定する。

| 判定 | 条件 |
|---|---|
| **ACCEPT** | evidence がコード上で確認でき、今回の変更範囲に関係し、修正が妥当 |
| **REJECT** | evidence が成立しない、今回の変更と無関係な既存の問題、確定済みの設計判断と矛盾、実際には起きない |
| **DEFER** | 指摘は正しいが、今回のスコープ外 |

REJECT の理由には根拠を書く。承認済み実装計画の該当節か、会話で確定した発言を引用する。「自分がそう設計したから」は根拠にならない。迷ったら REJECT せず、報告に回す。

バージョンに関する指摘（この API は非推奨だ、削除済みだ）は、lockfile で実際に解決されているバージョンを確認してから判定する。確認できなければ REJECT せず、未検証として報告に回す。

## Phase 3: 修正

**修正するのは、ACCEPT かつ `P0` または `P1` の指摘だけである。** ついでの整理もしない。

そのうえで、次のどれかに当たるものは修正せず報告に回す。

- 妥当な修正が複数あり、どれを選ぶかで挙動が変わる
- 修正がレビュー範囲の外に及ぶ
- 新しい依存・スキーマ変更・公開 API の変更が必要

修正したら、プロジェクトに存在する lint / typecheck / 関連する test を実行して確認する。

## Phase 4: 報告

日本語で、次の節を書く。該当が無い節は省く。

- **レビュー結果** — 対象範囲、指摘件数（ACCEPT / REJECT / DEFER の内訳）
- **修正した指摘** — title、`file:line`、優先度、指摘内容、修正前の挙動、修正後の挙動、変更内容
- **方針を決める必要があるもの** — title、`file:line`、優先度、指摘内容、現在の挙動、選択肢とそれぞれのトレードオフ、判断が必要な理由
- **却下した指摘** — 指摘と、却下の根拠（実装計画の節見出し、または会話中の発言）
- **今回は対応しないもの（DEFER）** — 指摘と、スコープ外と判断した理由
- **検証** — lint / typecheck / test の結果

挙動を書く行には具体的な値を入れる。「正しく動くようになった」は報告ではない。「空配列を渡すと `TypeError: cannot read length of undefined` で落ちていたのが、`0` を返すようになった」が報告である。
