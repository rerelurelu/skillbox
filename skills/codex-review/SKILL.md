---
name: codex-review
description: |
  Codex CLI に独立レビューを依頼し、返ってきた指摘を main agent が 1 件ずつ検証して採否を決める。修正が一意に決まるものはその場で直し、方針の判断が要るものは選択肢を添えて報告する。`codex` CLI が必要。
  Triggers on: "レビュー", "レビューして", "review", "code review", "codex review", "/codex-review"
  Use when: a change is ready for an independent reviewer — your own uncommitted work, a branch, or someone else's pull request.
user-invocable: true
argument-hint: "[レビュー対象。空欄で未コミットの変更]"
license: "GPL-3.0"
---

# Codex Review

役割は非対称である。**Codex は reviewer であって決定権を持たない。main agent がコードの owner であり、各指摘を採用するかどうかを決める。** 変更の意図、ユーザーと確定した設計判断、承認済みの実装計画を持っているのは main agent だけであり、Codex はそれを知らない。

Codex が落ちた場合、main agent が代わりにレビューするフォールバックは置かない。別モデルによる独立レビューという目的が失われるためである。一時的な失敗なら、もう一度実行すればよい。

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

`<レビュー対象>` は、`$ARGUMENTS` の指定があればそれを書く。無ければ `the uncommitted changes in this repository` とする。ブランチや他人の pull request をレビューするときは、その内容を先にチェックアウトしたうえで `the changes on this branch against the base branch <branch>` のように書く。

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

日本語で報告する。まず全件を 1 つの表にして、そのあと説明が要るものだけ詳細を書く。

```
レビュー対象: <範囲>
検証: lint <結果> / typecheck <結果> / test <結果>

| # | 優先度 | 指摘 | 場所 | 判定 | 対応 |
|---|---|---|---|---|---|
| 1 | P1 | <1 行で> | `src/a.ts:42` | ACCEPT | 修正した |
| 2 | P2 | <1 行で> | `src/b.ts:10` | ACCEPT | 要判断 |
| 3 | P2 | <1 行で> | `src/c.ts:88` | REJECT | <却下の根拠を 1 行で> |
| 4 | P3 | <1 行で> | `src/d.ts:14` | DEFER | <スコープ外と判断した理由を 1 行で> |
```

表のあとに、次の 3 種類だけ詳細を書く。表で足りるものは繰り返さない。

**修正した指摘**

```
### 1. <title>  `src/a.ts:42`
修正前: <具体的な入力・状態> のとき <具体的な結果>
修正後: 同じ入力で <具体的な結果>
変更内容: <何を編集したか>
```

**要判断**

```
### 2. <title>  `src/b.ts:10`
現在の挙動: <具体的な入力・状態> のとき <具体的な結果>
選択肢:
- A: <案> — <トレードオフ>
- B: <案> — <トレードオフ>
判断が必要な理由: <理由>
```

却下と見送りは、表の「対応」列に理由を書くだけでよい。詳細の節は作らない。

挙動を書く行には具体的な値を入れる。「正しく動くようになった」は報告ではない。「空配列を渡すと `TypeError: cannot read length of undefined` で落ちていたのが、`0` を返すようになった」が報告である。
