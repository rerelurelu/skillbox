---
name: herdr-panes
description: |
  Herdr のアプリで、Codex（`codex`）と Antigravity（`agy`）を別ペインで動かすための手順。ペインを開く位置、起動直後の確認画面の処理、会話のリセット、依頼の送り方、完了の待ち方、結果の読み方、後片付けを定める。
  qstack、arena、interrogate がペインを使うときに読む。単独では使わない。
disable-model-invocation: true
license: "GPL-3.0"
---

# Herdr panes

このファイルを読むスキル（呼び出し元）は、次の 2 つを決めて渡す。

- run: 今回の作業を見分ける文字列。qstack は開始時のコミットの先頭 7 文字を使う
- role: ペインの役割の名前（`sol`、`attack-astra` など）

前提: `test -n "${HC_TERMINAL_SOCKET:-}"` が成功する（Herdr のアプリの中で動いている）。

## 起動コマンド

`herdr-app do pane.split` の `--argv` に JSON で渡す。`<dir>` はペインが作業するフォルダの絶対パス。

| 種類 | `--argv` |
|---|---|
| Codex（書き込みあり） | `["codex","--no-daemon","-C","<dir>","-m","<model>","-c","model_reasoning_effort=<effort>","-c","sandbox_workspace_write.network_access=true","-s","workspace-write","-a","never"]` |
| Antigravity | `["sh","-c","cd '<dir>' && exec agy --model <model>"]` |

- Codex は `--no-daemon` を付ける。付けないと、Codex のコマンドが Herdr の外で動く
- Codex が書き込めるのは `<dir>` の中だけ。`<dir>` が変わるなら、ペインを開き直す
- Antigravity の effort はモデル名に含める（例: `gemini-4-neon-high`）

## 開く位置

メインのペインは左端に置き、上下には割らない。新しい列はメインのすぐ右にでき、古い列は右へ押される。1 列に入るペインは上下 2 つまで。

1. 自分のペインの ID を調べる。`herdr-app ls` の出力から、`terminal` が `$HC_TERMINAL_ID` と同じ項目の `pane` を取る。同じタブのターミナルの一覧もこのとき取っておく。
2. 同じタブの中で、ラベル `hp.col` を持つ生きたターミナルを `hc get <t> --json` で集める。
3. `hp.col` が一番大きい列（`<n>`）を見る。
   - 列が無い: `herdr-app do pane.split --direction right --pane <メインのペイン> --argv '<JSON>'`。ラベルは `hp.col=1 hp.slot=top`
   - 列 `<n>` に `top` しか無い: その `top` のペインを `--direction down` で割る。ラベルは `hp.col=<n> hp.slot=bottom`
   - 列 `<n>` に `top` と `bottom` がある: メインのペインを `--direction right` で割る。ラベルは `hp.col=<n+1> hp.slot=top`
4. 開いたら `hc label <t> hp.run=<run> hp.role=<role> hp.col=<列> hp.slot=<top|bottom>` を付ける。

## 開いた直後

`hc read <t> --lines 0` で画面を読み、入力欄が出るまで次を処理する。Codex の 2 つの確認は状態が `blocked` にならないため、画面の文字で判断する。

| 画面 | 送るキー |
|---|---|
| Codex の「Update available」 | `hc keys <t> esc` |
| Codex のフォルダの信頼の確認（Trust and continue） | `hc keys <t> enter` |
| Antigravity の「Trust this folder?」（状態 `blocked`、種類 `permission`） | `hc keys <t> enter` |

入力欄が出た目印は、Codex が「Ask Codex to do anything」、Antigravity が状態 `idle`。

## 使い回し

- 同じタブに、`hp.run` と `hp.role` が同じ生きたペインがあれば、新しく開かずに使う。`hp.run` が違うペイン（前の作業の残り）は使わない。
- 使う前に、`hc get <t> --json` の状態が `working` でないことを確かめる。
- 前の会話を消してから依頼する。コマンドは `hc keys` で 1 文字ずつ打つ。`hc send` の文は `<hc from=…>` で包まれて届き、コマンドとして扱われない。
  - Codex: `hc keys <t> / n e w` → `hc keys <t> enter` → 「Where should the new conversation run?」が出たら `hc keys <t> enter`（Use current Git worktree）
  - Antigravity: `hc keys <t> / c l e a r` → `hc keys <t> enter`

## 依頼、完了の待ち方、結果の読み方

- 依頼は `hc send <t> "<依頼文>"` で送る。依頼文の最後に「`=== RESULT ===` の行から書き始め、`=== END ===` の行で終えてください」を入れる。
- 完了は Bash の `run_in_background: true` で `hc wait <t> --timeout 1800` を走らせて待つ。終わると通知が来る。`reason: timeout` なら同じコマンドで待ち直す。
- 状態が `blocked` になったら画面を読む。フォルダの信頼なら Enter で進める。それ以外の許可の確認なら、内容をユーザーに伝えて止まる。
- 結果は `hc read <t> --lines 3000` で読み、画面の中で最後に出てくる `=== RESULT ===` から、その後の最初の `=== END ===` までを取り出す。依頼文にも同じ文字列が入っているため、最初に出てくるものを使うと依頼文を拾う。`[hc] incomplete` と出て目印が欠けていたら、`--lines` を増やして読み直す。

## 後片付け

- 閉じるときは `herdr-app do pane.close --pane <pane>` を使う。
- 呼び出し元が作業を終えたら、`hp.run` が今回の値のペインを全部閉じる。前の作業の残りは閉じない。
