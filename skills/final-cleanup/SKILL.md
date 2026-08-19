---
name: final-cleanup
description: >
  実装・レビュー・simplification対応がすべて完了したコードを最終整理する。dead codeの削除、コメントと実装の整合性確認、
  deslop-commentsによるコメント品質整理を順に行い、最後にlint/typecheck/testなどの検証を実行する。
  「最終クリーンアップ」「final cleanup」「仕上げ処理」「/final-cleanup」と言われたときに使う。
  cross-reviewとlean-review（simplification判断）への対応が終わり、実装内容そのものは確定しているコードが対象。
user-invocable: true
argument-hint: "[scope]"
license: "GPL-3.0"
---

# Final Cleanup

実装内容が確定したコードに残った不要物とコメントを整理する。新しい設計判断は行わない。

**このSkillが呼ばないもの**: `cross-review`、`lean-review`、`ponytail-review`。これらはユーザー判断や修正相談を挟む独立工程であり、`final-cleanup` からは実行しない。architecture simplification、YAGNI判断、correctness/security/performanceレビューもこのSkillの対象外。ユーザーが直接 `/final-cleanup` を実行した場合も、これらを自動実行せず自分の責務だけを行う。

## 対象範囲 (scope)

`$ARGUMENTS` が指定されていればそれを対象範囲にする。指定が無ければ `git status` の modified / staged / untracked ファイルを対象にする。

## 手順

Copy this checklist and track progress:

```
Final Cleanup Progress:
- [ ] Step 1: Dead code cleanup
- [ ] Step 2: Comment consistency
- [ ] Step 3: deslop-comments
- [ ] Step 4: Final verification
```

### Step 1: Dead code cleanup

コメント処理より先に行う。削除されるコードのコメントを後で評価しても無駄になるため。

確認対象: 未使用import、未使用のローカル変数、参照されなくなったprivate関数/helper、到達不能な分岐、リファクタ後に残ったコード。

次のケースは「未使用に見えても」削除しない。

- public API
- frameworkのエントリポイント（reflection・命名規約経由で呼ばれるもの含む）
- 外部から参照される可能性のあるexport
- 意図的なfallback
- tooling/frameworkのmagic convention

利用可能ならlinter・typechecker・symbol参照・grepで未使用を確認する。無ければcall siteを読んで確認する。判断できない場合は削除せず、完了報告にその旨を書く。

### Step 2: Comment consistency

Dead code削除後の状態を前提に、残ったコメントが今のコードと矛盾していないかを確認する。対象はline comment、block comment、JSDoc/TSDoc、docstring。

確認する内容: 実際の挙動と一致しているか、引数の説明が現在のシグネチャと一致しているか、戻り値・例外・挙動の説明が正しいか、リファクタ前の実装や削除済みのコードパスについて説明していないか。

このStepで扱うのは「内容が実装と食い違っているコメント」のみ。内容が正しいが冗長・自明なコメントの整理はStep 3に委譲し、ここでは判断しない。

修正方針: 現在の実装について正しい内容に書き直せるなら修正する。コメントが説明している対象（処理・分岐・引数など）自体が現在のコードに存在しないなら削除する。実装の意図が判断できない場合はコメントの意味を勝手に補完せず、その旨を報告する。

「正しいが冗長・自明」というだけの理由でコメントを削除しない。それはStep 3の判断であり、Step 2では扱わない。

`eslint-disable`、`ts-ignore`、`ts-expect-error`、`istanbul ignore`、`prettier-ignore`、ライセンスヘッダー、生成ファイルマーカーなど、tooling・実行に意味を持つコメントは、文章として冗長に見えても削除・書き換えの対象にしない。意味を確認してから扱う。

### Step 3: deslop-comments

Step 2完了後に `deslop-comments` Skillを実行する。Step 2の対象範囲をそのまま渡す。

`deslop-comments` が利用できない場合は、Step 1・Step 2までを実行したうえで「deslop-comments: unavailable」と明示する。独自のコメント品質判定へフォールバックしない。

### Step 4: Final verification

project-appropriate checksを実行する。存在するものだけを使う。プロジェクトに無いcheckを新しく導入しない。

検証方法は次の優先順位で探す。

1. `package.json` / `pyproject.toml` / `Makefile` / `justfile` などの実行定義
2. `CLAUDE.md` / `CONTRIBUTING.md` など開発規約ドキュメント
3. 1・2で分からない場合だけREADME

対象のcheckは次の2段階で扱う。

- 必須優先: lint、typecheck、関連するtest（dead code削除やコメント変更が触れたファイルの範囲で十分。フルテストスイートの実行が規約で必須の場合はそれに従う）
- プロジェクト規約で要求される場合のみ: format check、build。dead code削除とコメント変更しか行っていない変更に対して、規約に無いbuildを新たに走らせない。

## 自動変更してよい範囲

このSkillの実行時点で、次の変更は承認されているものとして扱う。

- 明確なdead codeの削除
- 古くなったコメントの修正・削除
- `deslop-comments` によるコメントのみの変更

次は自動実行しない。必要になった場合は作業を止めてユーザーに報告する。

- public APIの変更
- 挙動の変更
- 新規依存の追加
- schemaの変更
- architectureの変更
- 大きなrefactor
- 削除の是非が判断できないコードの削除

## 検証失敗時の扱い

Step 4のcheckが失敗した場合、成功として報告しない。何を変更したか、どのcheckが失敗したか、失敗内容を報告する。失敗の原因が自分のcleanup変更に明確にある場合は、元の意図を変えない範囲で修正し再検証してよい。設計判断が必要な失敗はユーザーに返す。

## 完了報告

```
最終クリーンアップ完了

Dead code:
- <削除内容 or 検出なし>

コメント整合性:
- <修正内容 or 問題なし>

Deslop comments:
- <deslop-commentsの結果、またはunavailable>

Verification:
- lint: <結果>
- typecheck: <結果>
- test: <結果>
```

存在しないcheckの行は書かない。
