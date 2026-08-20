---
name: delegating-implementation
description: |
  設計・実装計画は main agent（opus 想定）が持ったまま、承認済みの実装計画に沿った実装作業だけを sonnet の subagent に委譲する。実装計画を自己完結したドキュメントに圧縮して渡し、実装結果レポート（変更ファイル・計画項目との対応・逸脱・判断・実行したテスト・未解決事項）を受け取ったあと、main agent が計画との整合だけを確認する Plan Compliance Review を行う。
  Triggers on: "実装して", "実装おねがい", "実装お願い", "修正お願い", "反映お願い", "この計画で実装して", "sonnetに実装させて", "plan通りに実装", "implement this plan", "/delegating-implementation"
  Use when a reviewed implementation plan already exists (from Plan Mode or the conversation) and the remaining work is a substantial multi-file implementation with its own read/edit/test loop — not a one- or two-line edit.
version: "1.0.0"
user-invocable: true
license: "GPL-3.0"
---

# Delegating Implementation

main agent は要件整理・設計・実装計画までを担当し、まとまった実装作業だけを `sonnet` の subagent に渡す。subagent は独立したコンテキストで動くため、実装中に発生する大量の Read / Grep / Edit / テストログは main agent の会話に積み上がらない。

## このスキルを使う場面

実装作業が複数ファイルの Read + Edit + テストのループになる場合に使う。`plan.md` の 1 箇所を直す、typo を直す、設定値を 1 個変える程度の変更は、このスキルを経由せず main agent が直接 `Edit` する方が速く、トークンも少ない。subagent の起動そのものに固定コストがかかるため、小さい変更にまで使うと逆に消費が増える。

## 前提: 実装計画を確定させる

subagent は main agent の会話履歴を一切持たない。渡すのは会話の要約ではなく、それだけで実装が完了できる自己完結した実装計画である。

- **Plan Mode で承認済みの計画がある場合**: その内容をそのまま使う。書き直さない。
- **ない場合**: ここまでの会話から実装計画を組み立てる。要件・設計判断・却下した案・制約を確認し、以下の形式にまとめる。ユーザーに承認された設計判断だけを書く。まだ決まっていない点が残っているなら、先にユーザーと詰める。未決定のまま subagent に渡すと、subagent がその場で設計判断をしてしまう。

```markdown
## Goal
<何を達成するか。1〜2 文>

## Changes
- `<file>`
  - <変更内容>
- `<file>`
  - <変更内容>

## Constraints
- <変更してはならない範囲>
- <追加してはならない依存>
- <守るべき既存の設計判断>

## Verification
- <既存テストが通ること>
- <追加すべきテスト>
- <typecheck / lint の要否>

## Decision policy
実装計画と既存コードが矛盾した場合、独自に設計変更せず、その内容を報告する。
```

`Constraints` には、レビューやユーザーとの会話で「今回はやらない」と決めた事項も書く。書かないと、subagent や後続のレビュアーがそこを再提案してくる。

## Phase 1: subagent を起動する

`Agent` ツールで起動する。**`subagent_type: "fork"` は使わない。** fork は親の会話コンテキストをすべて引き継ぐうえ、常に親と同じモデルで動き `model` 指定を無視する。model を `sonnet` に固定できず、コンテキストを分離するという目的の両方を外すことになる。`subagent_type` は省略するか `"general-purpose"` を指定し、`model: "sonnet"` を明示する。

プロンプトには実装計画の全文と、以下の指示をそのまま含める。

```
You are responsible for implementation, not architecture decisions.

Follow the provided implementation plan exactly.
If the plan is ambiguous or conflicts with the existing codebase,
do not make a significant architectural decision yourself — report
the conflict in your final report instead and stop that part of the work.

When you finish (or when you stop because of a conflict), report back
in exactly this format:

## Implementation Result

### Changed files
- <file>: <何をどう変更したか>

### Plan mapping
- <Planの各項目>: done / partially done / skipped — <理由>

### Deviations from the plan
- <計画から外れた箇所と、そう判断した理由。無ければ「なし」>

### Judgment calls made
- <計画に書かれていなかったが、実装のために自分で決めた小さな判断>

### Tests run
- <実行したコマンドと結果>

### Open issues
- <未解決の事項。無ければ「なし」>
```

計画に絶対パスで参照すべきファイル（設計ドキュメント、ADR など）があれば、それも絶対パスで渡す。subagent の作業ディレクトリは対象リポジトリだが、相対パスは呼び出し元の変数を解決できない。

起動したら、結果を待つ間に自分で実装を始めない。subagent が独立したコンテキストで作業している間、そのメリットを享受できるのは main agent が手を出さないときだけである。

## Phase 2: Plan Compliance Review

subagent から結果が届いたら、**コードベースを再調査しない。** 実装を Sonnet に逃がした意味は、Read / Edit / テストのループを main agent のコンテキストに積まないことにある。全変更ファイルを読み直すと、その意味が失われる。

見るのは次の 2 つだけである。

1. **Implementation Result のレポート** — Plan mapping と Deviations を実装計画と突き合わせる。
2. **変更されたファイルだけの diff**（`git diff` を変更ファイルに絞って実行する）— レポートの記述が実際の変更と一致しているかを確認する。

確認する観点:

- Plan の各項目が計画どおりに実装されているか
- Deviations が正当な理由を伴っているか（単なる手抜きではないか）
- Constraints に書いた制約を破っていないか
- Open issues がユーザーへの報告に必要な情報を含んでいるか

計画とレポートが一致していれば次のフェーズへ進む。一致しない、または Deviations に納得できない場合は、具体的な差分を示して同じ subagent に再指示する（新しい subagent を起動し直す必要はない）。

## Phase 3: 報告して止まる

ユーザーに日本語で報告し、そこで止まる。後続のコードレビュー（`cross-review` など）を自動では起動しない。ユーザーが望めば、その場でレビューを依頼するかどうかは別途判断する。

```markdown
## 実装結果

### 変更ファイル
<Implementation Result の Changed files をそのまま>

### 計画との対応
<Plan mapping をそのまま>

### 計画からの逸脱
<Deviations をそのまま。Plan Compliance Review で問題ないと判断した理由も添える>

### 実行したテスト
<Tests run をそのまま>

### 未解決事項
<Open issues をそのまま>
```

該当が無い節は省く。
