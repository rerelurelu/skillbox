---
name: self-check
description: |
  実装した本人が、レビューに出す前に自分の変更を見直す。要件との突合、変更漏れ、意図しない diff、TODO や debug code の残り、lint / typecheck / test の結果を確認する。
  Triggers on: "セルフチェック", "self check", "self-check", "実装完了前の確認", "/self-check"
  Use when: an implementation is finished and about to be reported as complete, or before handing the change to an independent reviewer.
user-invocable: true
argument-hint: "[scope]"
license: "GPL-3.0"
---

# Self Check

実装を終えた main agent が、自分の変更を「レビューに出せる状態か」という 1 点だけで見直す。実装完了の報告には、このチェックまで含める。

これはレビューではない。答える問いは「第三者として、この実装に問題はないか」ではなく、**「実装者としてやるべきことを終えたか」**である。correctness・security・architecture・performance の掘り下げは `codex-review` の担当であり、ここではやらない。両方で同じことをすると、レビューを 2 セット行うだけになる。観点別の subagent も起動しない。起動した時点でセルフチェックではなくレビューになる。main agent 自身が diff を読み返す。

## 対象範囲

`$ARGUMENTS` があればそれを対象にする。無ければ未コミットの変更すべて（`git diff`、`git diff --cached`、`git ls-files --others --exclude-standard` の 3 つとも確認する）。

## 1. 要件との突合

依頼された内容と、承認済みの実装計画がある場合はその各項目を、実際の変更と 1 件ずつ照合する。実装していない項目があれば、それが意図的な見送りなのか、単なる漏れなのかを区別する。

## 2. diff の読み返し

変更を最初から最後まで読む。確認するのは次の 2 つだけである。

- **意図しない変更が混ざっていないか** — 別件の修正、エディタや formatter が入れた無関係な整形、デバッグ中に変えて戻し忘れた値
- **明らかな実装漏れが無いか** — null / 空配列 / 空文字の扱い、追加した分岐の else 側、エラー時の戻り値

「明らかな」で止める。入力の組み合わせを網羅的に追ったり、並行性や競合を検討したりはしない。それは独立レビューの仕事である。

## 3. 残骸の確認

`TODO`、`FIXME`、`console.log`、`print`、`debugger`、コメントアウトした旧実装、動作確認用に作った一時ファイルが残っていないか確認する。

意図して残す場合は、報告にその旨と理由を書く。

## 4. 検証の実行

プロジェクトに存在するものだけを実行する。無い check を新しく導入しない。探す順序は `package.json` / `pyproject.toml` / `Makefile` / `justfile` などの実行定義、次に `CLAUDE.md` / `AGENTS.md` / `CONTRIBUTING.md`、最後に README。

対象は lint、typecheck、変更に関連する test。フルテストスイートの実行がプロジェクト規約で必須なら、それに従う。

## 見つけたものの扱い

このスキルで見つかる問題は、実装者が自分で直すべきものである。見つけたら直して、直したことを報告に書く。

ただし、修正が設計判断になる場合（要件の解釈が割れる、複数の直し方があってどれを選ぶかで挙動が変わる）は直さず、報告に書いて止まる。

## 完了報告

4 つのステップそれぞれで何をしたかを書く。存在しない check の行は書かない。判断が必要で直さなかったものは最後に書く。

検証が失敗した状態で「完了」と報告してはならない。何を変更し、どの check がどう失敗したかを書く。
