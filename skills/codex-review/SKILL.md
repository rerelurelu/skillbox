---
name: codex-review
description: |
  Codex CLI に独立レビューを依頼し、返ってきた指摘を main agent が 1 件ずつ検証して採否を決める。修正が一意に決まるものはその場で直し、方針の判断が要るものは選択肢を添えて報告する。`codex` CLI が必要。
  Triggers on: "レビュー", "レビューして", "review", "code review", "codex review", "/codex-review"
  Use when: implementation and self-check are done and the change is ready for an independent reviewer.
user-invocable: true
argument-hint: "[レビュー対象。空欄で未コミットの変更]"
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

リポジトリのルートで `codex review` を実行し、次のプロンプトを渡す。`Bash` の `timeout` に `600000` を指定する。数分かかる。

```
Review <レビュー対象>.

In addition to the usual defect review, check conformance to this project's
architecture rules: responsibilities placed in the wrong layer, dependencies
pointing the wrong way, duplicated implementations of the same rule, and
changes that contradict the conventions written in AGENTS.md or CLAUDE.md.
Report architecture deviations as findings in the same format as other findings.
```

`<レビュー対象>` は、`$ARGUMENTS` の指定があればそれを書く。無ければ `the uncommitted changes in this repository` とする。ベースブランチとの差分なら `the changes on this branch against the base branch <branch>` のように書く。

**`--uncommitted` / `--base` / `--commit` フラグは使わない。** これらはプロンプト引数と併用できず、フラグを使うとアーキテクチャ観点を足せない。対象はプロンプトの文章で指定する。

過去のコミットをレビュー対象にしない。Phase 2 と Phase 3 はワークツリーのファイルを読んで編集するため、チェックアウトされているものと別のリビジョンをレビューすると、見ている内容と直す対象が食い違う。

Phase 3 の修正まで、ワークツリーを変更しない。

**レビューの観点そのものは書き足さない。** `codex review` は判定条件と優先度の定義を自分で持っている（`~/.codex/skills/.system/review-agent/`）。`approval-policy: never` と `sandbox: read-only` も自動で付く。上のプロンプトが足しているのはアーキテクチャ観点 1 つだけで、それ以外を上書きすると Codex 側が更新されても追従しなくなる。

出力にはコマンド実行ログが混ざり、最後の指摘ブロックが 2 回出力されることがある。指摘は 1 回分だけ読む。

出力が空、またはコマンドが失敗した場合は、その事実を報告して停止する。再実行はユーザーの判断に任せる。

## Phase 2: 裁定

**指摘をそのまま適用しない。** 1 件ずつ、該当ファイルを自分で読んで判定する。

| 判定 | 条件 |
|---|---|
| **ACCEPT** | evidence がコード上で確認でき、今回の変更範囲に関係し、修正が妥当 |
| **REJECT** | evidence が成立しない、今回の変更と無関係な既存の問題、確定済みの設計判断と矛盾、実際には起きない |
| **DEFER** | 指摘は正しいが、今回のスコープ外 |

REJECT の理由には根拠を書く。反証したコードの箇所（`file:line`）、承認済み実装計画の該当節、会話で確定した発言のいずれかを示す。「自分がそう設計したから」は根拠にならない。迷ったら REJECT せず、報告に回す。

バージョンに関する指摘（この API は非推奨だ、削除済みだ）は、lockfile で実際に解決されているバージョンを確認してから判定する。確認できなければ REJECT せず、未検証として報告に回す。

## Phase 3: 修正

**修正するのは ACCEPT した指摘だけである。** ついでの整理もしない。

**優先度で修正するかどうかを決めない。** `P0`〜`P3` はどれも「直す価値がある」ものに付く緊急度であり、直せるかどうかとは別の軸である。P1 でも設計判断が要るものはあるし、P3 でも 1 行で直るものはある。

判断するのは、修正が一意に決まるかどうかである。次のどれかに当たるものは修正せず報告に回す。

- 妥当な修正が複数あり、どれを選ぶかで挙動が変わる
- 修正がレビュー範囲の外に及ぶ
- 新しい依存・スキーマ変更・公開 API の変更が必要
- Phase 2 で evidence を確認できなかった

修正したら、プロジェクトに存在する lint / typecheck / 関連する test を実行して確認する。

## Phase 4: 報告

日本語で、次の節を書く。該当が無い節は省く。

- **レビュー結果** — 対象範囲、指摘件数（ACCEPT / REJECT / DEFER の内訳）
- **修正した指摘** — title、`file:line`、優先度、指摘内容、修正前の挙動、修正後の挙動、変更内容
- **方針を決める必要があるもの** — title、`file:line`、優先度、指摘内容、現在の挙動、選択肢とそれぞれのトレードオフ、修正しなかった理由
- **却下した指摘** — 指摘と、却下の根拠
- **今回は対応しないもの（DEFER）** — 指摘と、スコープ外と判断した理由
- **検証** — lint / typecheck / test の結果

挙動を書く行には具体的な値を入れる。「正しく動くようになった」は報告ではない。「空配列を渡すと `TypeError: cannot read length of undefined` で落ちていたのが、`0` を返すようになった」が報告である。
