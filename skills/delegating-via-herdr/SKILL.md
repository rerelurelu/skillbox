---
name: delegating-via-herdr
description: |
  Delegates a task to another coding agent (Codex, Claude Code, etc.) in a visible herdr pane and waits for completion in the background, so the user can watch progress live while the conversation stays responsive.
  Triggers on: "herdr で", "ペインで", "delegate", "隣で動かして", "Codex にやらせて", "バックグラウンドでレビュー", "/delegating-via-herdr".
  Use when the user asks to hand work to another coding agent inside herdr, or wants an agent's progress visible in a split pane. Requires HERDR_ENV=1.
user-invocable: true
license: "GPL-3.0"
allowed-tools: "Bash Read"
---

# Delegating via herdr

別の coding agent を herdr のペインで起動してタスクを委譲し、完了待ちだけをバックグラウンドに回す。ユーザーは隣のペインで作業経過をリアルタイムに見られ、こちらの会話はブロックされない。

## 前提チェック

```bash
test "${HERDR_ENV:-}" = 1
```

失敗したら「herdr 管理下のペインではない」と伝えて中止する。herdr の外からセッションを操作しない。

## ペインの再利用ポリシー

新しいペインを開く前に、対象エージェントが既に対話状態で開いているペインがないか確認する（`herdr pane list` の `agent` / `agent_status`）。

- **直前に自分が委譲したタスクの続き**（追加質問・修正依頼）→ そのペインに `pane run` で追送する。文脈が残っていることが利点になる。
- **別のタスク** → 新しいペインを開くのが既定。前タスクの文脈が混ざると、回答が引っ張られたりどのタスクへの応答か曖昧になる。ペインを増やしたくないとユーザーが言った場合は、エージェントのコンテキストリセットコマンド（Codex / Claude Code なら `/new`）を送って初期化してから使い回してよい。
- **自分（このスキル）が開いたのではないペイン** → ユーザーのセッションかもしれないので、ユーザーが明示的に指定したときだけ使う。

## フロー

### 1. ペインを作る

現在ペインの形から分割方向を決める。横長（width > height×2 目安）なら `right`、それ以外は `down`。

```bash
herdr pane layout --pane "$HERDR_PANE_ID"
herdr pane split --pane "$HERDR_PANE_ID" --direction <right|down> --no-focus --cwd <作業ディレクトリ>
```

- ユーザーの集中を奪わないため `--no-focus` を必ず付ける。
- レスポンス JSON の `result.pane.pane_id` を読む。ID を推測で組み立てない。
- 対象リポジトリが指定されているときは `--cwd` で合わせる。

### 2. エージェントを起動する

```bash
herdr pane rename <pane_id> "<役割ラベル>"
herdr pane run <pane_id> "<エージェントの実行コマンド>"
herdr wait agent-status <pane_id> --status idle --timeout 45000
```

実行コマンドは通常の対話起動のみ（Codex: `codex`、Claude Code: `claude`、OpenCode: `opencode`）。ユーザーが明示しない限り、タスクを argv で渡したり非対話フラグを付けたりしない。

### 3. タスク文を組み立てる

タスク文には作業内容に加えて、委譲先への安全上の最低条件を含める（タスク内容に応じて取捨してよい）:

- 作業範囲（対象ファイル・ディレクトリ）を明示する
- 依頼していない commit / push はしない
- 無関係なファイルを変更しない
- レビュー・調査タスクなら「修正はしない」と明記する

シェル経由で渡すため、タスク文は**シングルクォートで囲み**、文中のシングルクォートは `'\''` にエスケープする。`$`・バッククォート・二重引用符を含む文をダブルクォートで囲まない（呼び出し元シェルで展開されて壊れる）。

```bash
herdr pane run <pane_id> 'タスク文...'
```

### 4. タスクを投入し、投入を確認する

送信前に `herdr pane get <pane_id>` で `agent_status` が `idle` であることを確認する。`unknown` の場合はエージェントが起動していない（シェルに戻っている）可能性があり、**そのまま送るとタスク文がシェルコマンドとして実行される**。ステップ 2 からやり直す。

`idle` でも TUI の初期化直後は入力が黙って破棄されることがある。**送りっぱなしにせず、必ず確認する**:

```bash
herdr pane run <pane_id> '<タスク文>'
herdr wait agent-status <pane_id> --status working --timeout 10000
```

`working` に遷移すれば投入成功。タイムアウトしたら `herdr pane read <pane_id> --source visible --lines 30` で画面を見る。タスク文が会話欄に入っていなければ再送する。エージェントが起動時に自動アップデートして終了している場合もここで気づける（その場合はステップ 2 からやり直す）。

### 5. バックグラウンドで完了を待つ

完了待ちを**バックグラウンド実行**に回してターンを終える（Claude Code なら Bash ツールの `run_in_background`。他エージェントでは相当するバックグラウンド実行機能を使い、`pane_id` を報告文に残して追跡できるようにする）。同期で待つと会話がブロックされる。

`blocked`（承認待ち）を素早く検知するため、単一の長い wait ではなく短い wait のループで待つ:

```bash
for i in $(seq 1 60); do
  herdr wait agent-status <pane_id> --status idle --timeout 5000 && break
  herdr wait agent-status <pane_id> --status done --timeout 1000 && break
  herdr wait agent-status <pane_id> --status blocked --timeout 1000 && break
done
```

- `idle` と `done` はどちらも完了。違いは結果をユーザーが見たかどうかだけ（ペインが見えていれば `idle`、バックグラウンドのタブなら `done`）。
- ループ回数の目安: レビューや小タスクは 10 分相当、重いタスクはユーザーと相談して延ばす。

待っている間、会話・別作業は普通に続けてよい。ユーザーに「隣のペインで経過が見える」ことを一言伝えておく。

### 6. 完了通知が来たら結果を回収する

まず `herdr pane get <pane_id>` で最終状態を確認する。

**`blocked` だった場合**: エージェントが確認プロンプトで止まっている。`pane read --source visible` で内容を読み、**代理で応答しない**。承認・許可を求めるプロンプト（ファイル変更、コマンド実行、外部通信など）は内容を要約してユーザーに判断を仰ぐ。

**`idle` / `done` だった場合**: 結果を読む。

```bash
herdr pane read <pane_id> --source recent-unwrapped --lines 120
```

TUI の描画混じりの出力から本文を読み取り、要点をまとめてユーザーに報告する。ログや長文には `recent-unwrapped` を使う（ソフト折り返しが結合される）。委譲先の指摘や結論は鵜呑みにせず、明らかな誤解がないか自分でも評価してから報告する。

## 後片付け

- タスク完了後もペインは**残す**。ユーザーが直接続きを話せるようにするため。閉じるのはユーザーが頼んだときだけ: `herdr pane close <pane_id>`
- 自分が作っていないペイン・タブ・ワークスペースは閉じない。

## 既知の落とし穴

- **起動時自動アップデート**: Codex は起動時に brew 経由で自動アップデートすると「Please restart Codex」と表示して終了する。その間に送ったプロンプトはアップデーターに食われる。ステップ 4 の投入確認で検出し、再起動してやり直す。
- **idle 直後の入力欠落**: `wait agent-status --status idle` が返った直後は入力を受け付けていないことがある。投入確認（ステップ 4）を省略しない。
- **`herdr server stop` / メインプロセスの kill は絶対にしない**。ペイン内の全プロセスが巻き添えになる。
