---
name: herdr-panes
description: |
  Herdr のアプリで Codex（`codex`）と Antigravity（`agy`）を別ペインで動かすための手順。ペインを開く位置、起動直後の確認画面の処理、会話のリセット、依頼の送り方、完了の待ち方、結果の読み方、後片付けを定める。
  qstack、arena、interrogate がペインを使うときに読む。単独では使わない。
disable-model-invocation: true
license: "GPL-3.0"
---

# Herdr panes

このファイルを読むスキル（呼び出し元）は次の 2 つを決めて渡す。

- run: 今回の作業を見分ける文字列。qstack は開始時のコミットの先頭 7 文字を使う
- role: ペインの役割の名前（`sol`、`attack-astra` など）

前提: `test -n "${HC_TERMINAL_SOCKET:-}"` が成功する（Herdr のアプリの中で動いている）。

## 起動コマンド

ペインは必ず付属の起動スクリプト [scripts/open-pane.mjs](scripts/open-pane.mjs) で開く。`herdr-app do pane.split` を直接呼ばない。`<dir>` はペインが作業するフォルダの絶対パス、`<script>` はこのファイルのフォルダから見た `scripts/open-pane.mjs` の絶対パス。

| 種類 | 実行コマンド |
|---|---|
| Codex（書き込みあり） | `node <script> --tool codex --dir <dir> --model <model> --effort <effort> --direction <right\|down> --pane <pane>` |
| Antigravity | `node <script> --tool agy --dir <dir> --model <model> --direction <right\|down> --pane <pane>` |

起動スクリプトは次のガードレールを自動で付ける。

- AWS 認証の環境変数を無効化する（`AWS_PROFILE` などを `unset`、`AWS_CONFIG_FILE=/dev/null`、`AWS_SHARED_CREDENTIALS_FILE=/dev/null`、`AWS_EC2_METADATA_DISABLED=true`）。環境変数の無効化は誤操作を防ぐためのもので、意図的な回避はネットワーク遮断とサンドボックスで防ぐ
- Codex は `--no-daemon`、`workspace-write`、`-a never`、`sandbox_workspace_write.network_access=false` で起動する。`--no-daemon` を付けないと Codex のコマンドが Herdr の外で動く。ユーザーから明示的な指示が無い限り `--online` は付けない
- Codex が書き込めるのは `<dir>` の中だけ。`<dir>` が変わるなら、ペインを開き直す
- Antigravity は `--sandbox` と `--settings '{"allowNonWorkspaceAccess":false}'` を付けて起動する
- Antigravity の effort はモデル名に含める（例: `gemini-4-neon-high`）

## 開く位置

メインのペインは左端に置き、上下には割らない。新しい列はメインのすぐ右にでき、古い列は右へ押される。1 列に入るペインは上下 2 つまで。

1. 自分のペインの ID を調べる。`herdr-app ls` の出力から、`terminal` が `$HC_TERMINAL_ID` と同じ項目の `pane` を取る。同じタブのターミナルの一覧もこのとき取っておく。
2. 同じタブの中で、ラベル `hp.col` を持つ生きたターミナルを `hc get <t> --json` で集める。
3. `hp.col` が一番大きい列（`<n>`）を見る。いずれの分岐でも `scripts/open-pane.mjs` を使って開く。
   - 列が無い: `scripts/open-pane.mjs` に `--direction right --pane <メインのペイン>` を渡して開く。ラベルは `hp.col=1 hp.slot=top`
   - 列 `<n>` に `top` しか無い: `scripts/open-pane.mjs` に `--direction down --pane <top のペイン>` を渡して開く。ラベルは `hp.col=<n> hp.slot=bottom`
   - 列 `<n>` に `top` と `bottom` がある: `scripts/open-pane.mjs` に `--direction right --pane <メインのペイン>` を渡して開く。ラベルは `hp.col=<n+1> hp.slot=top`。割る前と後に「メインの幅を保つ」を行う
4. 開いたら `hc label <t> hp.run=<run> hp.role=<role> hp.col=<列> hp.slot=<top|bottom>` を付ける。

### メインの幅を保つ

最初の列を作るときはメインが半分になるまま使う。2 列目からは、メインを割ってもメインの幅を割る前と同じ列数に戻す。

ペインの幅は `hc get <t> --json` の `cols`（列数）で測る。メインは `<t>` に `$HC_TERMINAL_ID` を使う。`herdr-app do pane.resize --pane <pane> --direction <right|left> --px <px>` は、そのペインとすぐ隣のペインの間の境界だけを動かす。

1. 割る前に、メインの `cols`（`<w>`）を記録する。
2. 割ったあと、メイン（`<m>`）、新しい列（`<a>`）、列 `<n>` の `top`（`<b>`）の `cols` を読む。新しい列のペインを `--direction right` で resize し、新しい列の `cols` を `<d> + (<a> + <b> - <d>) / 2` に近づける。`<d>` は `<w> - <m>`。手順 3 でメインに `<d>` 列を返したあと、新しい列と列 `<n>` がほぼ同じ幅になる。メインを先に広げると、新しい列が最小の幅まで縮んでメインが `<w>` まで戻らない。
3. メインのペインを resize し、メインの `cols` を `<w>` に合わせる。足りなければ `right`、多すぎれば `left`。
4. 2 と 3 では、1 列を 9px として px を計算し、resize のたびに `cols` を読み直す。1 列あたりの px は一定でないため、目標の列数になるまで最大 5 回繰り返す。

## 開いた直後

ペインを開いたら、別のペインを開く、依頼文を作るなどのほかの作業に移る前に、この節の処理を終える。確認画面を残したまま先へ進むと、ペインは確認画面で止まったままになる。

`hc read <t> --lines 0` で画面を読み、入力欄の目印が出るまで、数秒おきに読み直しながら次を処理する。Codex の 2 つの確認は状態が `blocked` にならないため、画面の文字で判断する。

ペインを起動したフォルダの信頼の確認は、ユーザーに確かめずに下の表のキーで進める。ユーザーはこのスキルを使う時点で、起動したフォルダを信頼することに同意している。

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
  - Codex: `hc keys <t> / n e w` を打ち、`hc keys <t> enter` を送る。「Where should the new conversation run?」が出たら、`hc keys <t> enter` で Use current Git worktree を選ぶ
  - Antigravity: `hc keys <t> / c l e a r` を打ち、`hc keys <t> enter` を送る

## 依頼、完了の待ち方、結果の読み方

- 依頼を送る前に `hc read <t> --lines 0` で画面を読み、入力欄の目印が出ていることを確かめる。確認画面が出ていたら、「開いた直後」の表のキーで進めてから送る。
- 依頼は `hc send <t> "<依頼文>"` で送る。
  - Antigravity の確認画面が出ている間は、`hc send` が `<t> is blocked (permission)` のエラーで送信を断る。このエラーが出たら画面を読み、表のキーで進めてから送り直す。
  - Codex の確認画面には `hc send` がエラーを出さない。送った Enter が確認画面の選択肢を選び、依頼文は捨てられる。そのあと `hc wait` は依頼が終わったときと同じように `idle` で返るため、送る前の画面の確認を省かない。依頼文の最後に「`=== RESULT ===` の行から書き始め、`=== END ===` の行で終えてください」を入れる。
- 完了は Bash の `run_in_background: true` で `hc wait <t> --timeout 1800` を走らせて待つ。終わると通知が来る。`reason: timeout` なら同じコマンドで待ち直す。
- 状態が `blocked` になったら画面を読む。ペインを起動したフォルダの信頼の確認なら、ユーザーに確かめずに Enter で進める。それ以外の許可の確認（別のフォルダの信頼、コマンドの実行など）なら、内容をユーザーに伝えて止まる。
- 結果は `hc read <t> --lines 3000` で読み、画面の中で最後に出てくる `=== RESULT ===` から、その後の最初の `=== END ===` までを取り出す。依頼文にも同じ文字列が入っているため、最初に出てくるものを使うと依頼文を拾う。`[hc] incomplete` と出て目印が欠けていたら、`--lines` を増やして読み直す。

## 後片付け

- 閉じるときは `herdr-app do pane.close --pane <pane>` を使う。
- 呼び出し元が作業を終えたら、`hp.run` が今回の値のペインを全部閉じる。前の作業の残りは閉じない。
