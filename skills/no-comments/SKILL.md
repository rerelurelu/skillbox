---
name: no-comments
description: |
  差分のコメントを comment-reviewer の subagent に読ませ、消すコメントと、コメントが要らなくなるように直すコードの一覧を作る。指摘を点検して、受け入れたものを直す（または呼び出し元に直させる）。
  qstack が実装のあとに呼ぶ。`/no-comments` で単独でも使える。
disable-model-invocation: true
user-invocable: true
argument-hint: "[差分の開始のコミット]"
license: "GPL-3.0"
---

# No comments

## 範囲

呼び出し元が差分の範囲を渡す。単独で呼ばれたときは `$ARGUMENTS` のコミットから HEAD まで。`$ARGUMENTS` が無ければ、`main` から分かれた地点から HEAD まで。

## 手順

1. Agent ツールで `subagent_type: "relubox:comment-reviewer"`、`run_in_background: true` の subagent を起動し、次を渡す。
   - 意図（目的、完了条件、変えない範囲、仮定した業務ルール）。単独で呼ばれて意図が無ければ、コミットメッセージから 1〜2 文で書く
   - 作業フォルダの絶対パス
   - 差分の範囲
   - no-overbuild の SKILL.md の絶対パス（このファイルのフォルダから見て `../no-overbuild/SKILL.md`）
2. 結果を点検する。次の指摘は捨てる。
   - no-overbuild の「当てはめないもの」に当たるコメントを消そうとしている
   - 差分の範囲の外を指している
   - コメント以外のコードの書き方を指摘している（「直す対象」を除く）
3. 残った指摘を直す。
   - qstack から呼ばれたとき: 指摘の一覧を qstack に返す。直すのは qstack の実装役
   - 単独で呼ばれたとき: 自分でコメントを消し、「直す対象」は名前の変更、関数への切り出し、型での表現、設計の変更のうち指摘された方法で直す。直したら、プロジェクトの lint、typecheck、関連するテストを実行する

## 返答

- qstack から呼ばれたとき: 受け入れた指摘の一覧（消すコメント、直す対象）と、捨てた指摘と理由
- 単独で呼ばれたとき: 消したコメントの数、直したコード（場所と直し方）、実行した lint、typecheck、テストの結果、捨てた指摘と理由
