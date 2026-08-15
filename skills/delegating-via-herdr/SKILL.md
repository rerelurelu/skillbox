---
name: delegating-via-herdr
description: |
  Delegates a task to another coding agent (Codex, Claude Code, etc.) in a visible herdr pane and waits for completion in the background, so the user can watch progress live while the conversation stays responsive.
  Triggers on: "herdr で", "ペインで", "delegate", "隣で動かして", "Codex にやらせて", "バックグラウンドでレビュー", "/delegating-via-herdr".
  Use when the user asks to hand work to another coding agent inside herdr, or wants an agent's progress visible in a split pane. Requires HERDR_ENV=1.
version: "1.1.0"
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

新しいペインを開く前に、対象エージェントが既に対話状態で開いているペインがないか確認する。`herdr agent list` はエージェントが動いているペインだけを返すので、`pane list` を絞り込むより短い。各要素の `agent` / `agent_status` / `pane_id` を見る。

- **直前に自分が委譲したタスクの続き**（追加質問・修正依頼）→ そのペインに `agent prompt` で追送する。文脈が残っていることが利点になる。
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
herdr agent start <役割ラベル> --kind <claude|codex|opencode|...> --pane <pane_id>
herdr agent wait <pane_id> --until idle --timeout 45000
```

`--kind` は herdr が対応しているエージェント種別を指定する（`claude` / `codex` / `gemini` / `cursor` / `opencode` など。一覧は `herdr agent start --help`）。`agent start` はシェルに実行コマンドを打つのではなく、herdr がエージェントの起動と状態追跡を引き受ける。

`pane run` でシェルにコマンドを打つ方式は使わない。起動に失敗してシェルプロンプトに戻っていた場合、次に送るタスク文がそのままシェルコマンドとして実行されるためである。

ユーザーが明示しない限り、タスクを argv で渡したり非対話フラグを付けたりしない。

### 3. タスク文を組み立てる

タスク文には作業内容に加えて、委譲先への安全上の最低条件を含める（タスク内容に応じて取捨してよい）:

- 作業範囲（対象ファイル・ディレクトリ）を明示する
- 依頼していない commit / push はしない
- 無関係なファイルを変更しない
- レビュー・調査タスクなら「修正はしない」と明記する

シェル経由で渡すため、タスク文は**シングルクォートで囲み**、文中のシングルクォートは `'\''` にエスケープする。`$`・バッククォート・二重引用符を含む文をダブルクォートで囲まない（呼び出し元シェルで展開されて壊れる）。

**この段階では送信しない。** エスケープ済みのタスク文を保持し、ステップ 4 で 1 回だけ送る。ここで送ってステップ 4 でも送ると、委譲先が同じタスクを 2 回実行する（ファイル変更・外部送信・課金処理が二重になる）。

### 4. タスクを投入し、投入を確認する

送信前に `herdr agent get <pane_id>` で `agent_status` が `idle` であることを確認する。`unknown` の場合はエージェントが起動していない。ステップ 2 からやり直す。

`idle` でも TUI の初期化直後は入力が黙って破棄されることがある。**送りっぱなしにせず、投入と確認を 1 コマンドで行う**:

```bash
herdr agent prompt <pane_id> '<タスク文>' --wait --until working --timeout 10000
```

`working` に遷移すれば投入成功。タイムアウトしたら `herdr pane read <pane_id> --source visible --lines 30` で画面を見る。タスク文が会話欄に入っていなければ再送する。エージェントが起動時に自動アップデートして終了している場合もここで気づける（その場合はステップ 2 からやり直す）。

### 5. バックグラウンドで完了を待つ

完了待ちを**バックグラウンド実行**に回してターンを終える（Claude Code なら Bash ツールの `run_in_background`。他エージェントでは相当するバックグラウンド実行機能を使い、`pane_id` を報告文に残して追跡できるようにする）。同期で待つと会話がブロックされる。

`--until` は繰り返し指定できる。ただし **1 回呼んで終わりにしない**:

```bash
deadline=$((SECONDS + 1800))
while (( SECONDS < deadline )); do
  herdr agent wait <pane_id> --until idle --until done --until blocked --timeout 60000 >/dev/null 2>&1
  st=$(herdr agent get <pane_id> | ...agent_status...)
  case "$st" in
    blocked) echo blocked; exit 2 ;;
    idle|done) <成果物が揃ったかを確認して、揃っていれば> echo done; exit 0 ;;
  esac
  sleep 5
done
echo "timed out"; exit 1
```

- `idle` と `done` はどちらも完了を示すが、**サブエージェントを使うエージェントは処理の合間に一瞬 `done` になる**。1 回の `agent wait` はそれを掴んで、作業途中で「完了」を返す。
- `herdr agent wait` は既に該当状態にいると**即座に返る**（実測 0.006 秒）。`sleep` を入れないとループが一瞬で空回りする。
- 可能なら状態ではなく**成果物**（出力ファイル、コミット、PR）で完了を判定する。状態は「見に行くべきか」の合図として使う。
- `blocked` は承認待ちで止まっている状態。ステップ 6 で対応する。
- `--timeout` は必ず指定する。省略すると無期限に待つ。

待っている間、会話・別作業は普通に続けてよい。ユーザーに「隣のペインで経過が見える」ことを一言伝えておく。

### 6. 完了通知が来たら結果を回収する

まず `herdr agent get <pane_id>` で最終状態を確認する。

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
- **idle 直後の入力欠落**: `agent wait --until idle` が返った直後は入力を受け付けていないことがある。`agent prompt --wait --until working`（ステップ 4）を省略しない。
- **`herdr wait` というコマンドは存在しない**: 待機は `herdr agent wait <target> --until <status>` である。状態を指定するフラグは `--status` ではなく `--until` で、繰り返し指定できる。
- **`herdr server stop` / メインプロセスの kill は絶対にしない**。ペイン内の全プロセスが巻き添えになる。
