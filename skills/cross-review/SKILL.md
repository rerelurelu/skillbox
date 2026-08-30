---
name: cross-review
description: |
  コード、実装計画、設計、pull request を Claude と Codex で独立レビューし、指摘を相互検証して最終判断する。`codex` CLI が必要。GitHub Copilot CLI 環境では cross-review-copilot を使う。
  Triggers on: "review", "code review", "review this", "レビュー", "レビューして", "/cross-review"
  Use when: reviewing code, implementation plans, or architecture/design decisions.
version: "7.0.0"
user-invocable: true
argument-hint: "[scope]"
license: "GPL-3.0"
---

# Cross Review

役割別のレビュアー（最大 5 人）が同じレビュー範囲を並列に、別々の観点で独立に調べる。レビュー対象は各レビュアーが、ローカルの Git スナップショットまたは指定された文書から自分で取得する。main agent は自分の手で Codex も動かし、レビュアー全員と Codex の指摘を集めて評価する。会話の文脈——要件、設計判断、承認済みの実装計画——を持っているのは main agent だけなので、指摘の要否を最終的に決めるのも main agent だけである。

## main agent の責務

**main agent はレビュアーの調査を代行せず、レビュー全体の調整・裁定・報告を担う。**

指摘をそのまま集約するだけで満足してはならない。会話が持っている設計文脈を使って、能動的に評価する。

### このレビューが扱わないもの

扱わないのは「今の挙動も変更時のコストも変わらない、書き方の好み」だけである。不要コード・YAGNI・過剰な実装や抽象化・「もっと単純に書ける」を理由とする指摘は引き続き扱わない（`lean-review` スキルの担当範囲である）。

**責務の配置・依存の向き・重複実装・保守運用上の問題は、このレビューの対象に含める。** ただし、変更時・運用時・障害時に成立する具体的な誤りを evidence に書けるものに限る。「なんとなく汚い」「将来困るかもしれない」で終わる指摘は対象外である。

線引きは 1 文で書ける。`lean-review` が扱うのは消せるコードであり、`cross-review` が扱うのは置き場所が違うコードである。

いずれかのレビュアーまたは Codex が simplicity のみを理由とする finding を返した場合、Phase 3 のトリアージでこのスコープに当てはめ、最終結果には残さない。

| 役割 | モデル | やること |
|------|--------|----------|
| **main agent** | ユーザーの設定のまま | 判定 · レビュアーへの委譲 · Codex の実行 · トリアージ · 編集 · 報告 |
| `review-implementation`（subagent） | `opus` | 境界値・異常系・並行性・状態管理・バージョン整合性・変更の波及を確認する |
| `review-security`（subagent） | `opus` | 信頼できない入力の流れ・認証認可の分離・機密情報の扱い・安全でない依存を確認する |
| `review-architecture`（subagent） | `opus` | 責務の配置・依存の向き・重複実装・変更の集中点・既存パターンとの整合を確認する |
| `review-maintainability`（subagent） | `opus` | 可観測性・障害時の挙動・テスタビリティ・dead code・設定と環境差を確認する |
| `review-plan-alignment`（subagent） | `sonnet` | Code レビューで、レビュー対象とは別に比較対象の実装計画が渡された場合にだけ起動。計画との整合を確認する |

**Codex だけは main agent 自身が実行する。** Codex は `codex exec` という別プロセスであり、`Agent` ツールで委譲できないためである。

レビュー対象のファイルを変更するのは main agent だけ。

## 前提条件

```bash
command -v codex
```

`codex` が無い場合はその旨を伝え、Claude 側のレビュアーだけで続けるかをユーザーに聞く。同じモデル系統だけでレビューするのは、このスキルが前提にしている相互チェックではないので、続行はユーザーの判断とする。

## ワークツリーの保護

既定のレビュー範囲は未コミットの作業である。ツリーを「きれいにする」操作は、レビュー対象そのものを破壊する。

**どのフェーズでも、HEAD・index・レビュー対象ワークツリーのパスを変更するコマンドを実行してはならない。** Git コマンドだけでなく、シェルのファイル操作、フォーマッタ、コード生成、ビルドも含む。以下は例であって全部ではない。

```
git stash（すべての形式）   git clean（-n / --dry-run を除く）
git reset（すべての形式）   git switch
git checkout               git restore
gh pr checkout             rm / mv / 上書きする cp
```

例外は Phase 4 step 1 だけで、そこで main agent がユーザーの承認した修正を適用する。

レビュアーは `Bash` を持つ。未コミットの変更や、fetch 済みの PR オブジェクトをローカルの Git コマンドで自分で読むために必要だからである。`Edit` はツール許可リストに無いため実行できない。`Write` は結果ファイルを書くために許可してあり、**出力先の 1 パスに限るという制限はツール権限ではなくプロンプトの指示である。** `Bash` 経由の破壊的コマンドも同じくツール権限では防げない。上の禁止コマンド一覧、`Write` の許可パス制限、`Bash` の許可コマンド一覧は、各 `agents/review-*.md` にも同じ内容が書いてある。書き換えるときは両方を確認する。レビュアーには lint・型チェックも実行させない。読み取り専用に見えても、キャッシュや `.tsbuildinfo` のような生成物をワークツリーに書くことがある。

`references/…` のパスは、ハーネスが起動時に伝えるスキルのベースディレクトリ（`Base directory for this skill: …`）を基準に解決する。カレントディレクトリを基準にしてはならない。

## Phase 1: 判定

main agent はこのフェーズで、レビュー種別・判定基準・レビュー対象の指定を決める。**レビュー対象のテキストは取得しない。**

### 1. レビュー種別の判定

- **Plan** — 実装計画、タスクリスト、他のエージェントが実行する手順書
- **Design** — アーキテクチャ文書、設計判断
- **Code** — ソースコード（既定）

**ドメイン**はパスと拡張子をヒントに見当をつける。絶対分類ではない。

- **fe** — `.tsx`/`.jsx`/`.vue`/`.svelte`、`components/`、`styles/`、`.css`/`.scss`
- **be** — `server/`、`api/`、`controllers/`、`models/`、`.sql`、ORM・マイグレーション
- **infra** — `Dockerfile`、`docker-compose*`、`*.tf`、k8s マニフェスト、`.github/workflows/`

Next.js の route handler や server component、edge で動くコード、CI 専用の TypeScript のように、パスと拡張子だけでは決まらないものもある。ヒントに当てはまらなくても変更内容から該当すると判断できるなら、そのドメインの `references/domains/<domain>.md` を役割別レビュアーの観点に追加する情報として扱う。

**レビュー対象の指定は 3 通りある。** どれに当たるかを最初に決める。

| 指定 | レビュー対象 |
|------|------------|
| ユーザーが PR 番号を渡した | その PR |
| ユーザーが文書のパスを渡した、または会話に文書を貼った | その文書。Git の差分は見ない |
| どれも無い | 未コミットの変更すべて |

種別判定のために、変更されたファイルのパスと拡張子だけ確認してよい。未コミットなら `git diff HEAD --name-only` と `git ls-files --others --exclude-standard`、PR なら `gh pr view <n> --json files`。**この結果をレビュアーへ渡さない。**

対象が空なら、その旨を報告して停止する。

### 2. 判定基準ファイルの絶対パスの確定

`references/<type>.md`、`references/deepwiki.md`、該当すれば `references/domains/<domain>.md`。

### 3. PR スナップショットの固定と、実装計画の有無の確認

PR レビューの場合、レビュアーを起動する前に PR の中身をローカルへ取り込む。**この 2 つのコマンドはワークツリー・HEAD・index を変更しない。**

```bash
gh pr view <n> --json baseRefOid,headRefOid,baseRefName
git fetch origin "pull/<n>/head" "<baseRefName>"
```

fetch したあと、両方の OID がローカルに存在することを確認する。

```bash
git cat-file -e "<baseRefOid>^{commit}" && git cat-file -e "<headRefOid>^{commit}"
```

どちらかが失敗したら、OID の取得と fetch を 1 組としてもう一度やり直す。2 回目も失敗したら、PR が更新され続けている可能性を報告して停止する。**OID が解決できないまま参加者を起動してはならない。** 全員の `git diff` が `bad object` で失敗し、その失敗は「指摘なし」と区別がつかない。

`baseRefOid` と `headRefOid` を全参加者へ渡す。**渡したあとに PR が更新されても、参加者が読むのは fetch 済みのオブジェクトなので、全員が同じ内容を見る。**

実装計画の有無は、会話またはユーザーが渡したパスから確認する。

### 4. 未コミット変更の digest を記録する

レビュー対象が未コミットの変更のとき、レビュアーを起動する前に内容の digest を取る。

```bash
{ git diff HEAD; git ls-files --others --exclude-standard | while read -r f; do printf '%s\n' "$f"; cat "$f"; done; } | shasum -a 256
```

この値を自分の手元に残す。Phase 3 の冒頭で同じコマンドを実行して比較する。

## Phase 2: 並列レビュー

### レビュアーの出力先を作る

レビュアーを起動する前に、結果を書かせるディレクトリを 1 つ作る。

```bash
mktemp -d "${TMPDIR:-/tmp}/cross-review-out.XXXXXX"
```

**レビュアーの結果は `Agent` ツールの戻り値では回収しない。** 戻り値が親セッションへ届かないことがある。ファイルを正本にする。

各レビュアーには、このディレクトリの下の**自分専用の絶対パスを 1 つだけ**渡す。ファイル名は `<出力先>/<役割名>.md` にする。

このディレクトリは削除しない。`$TMPDIR` の下にあり、OS が回収する。Codex 用の一時ディレクトリとは別に作る。`run-codex-review.sh` は渡されたディレクトリを終了時に丸ごと削除するため、同じディレクトリを使うとレビュアーの書き込み中に消える。

**1 回のメッセージで、起動条件を満たすレビュアー全員の `Agent` 呼び出しをすべて同時に行う。** そのうえで、同じターンのうちに Codex を実行する。

**このフェーズの間、ワークツリーを変更してはならない。** レビュアーと Codex は、それぞれ別のタイミングで差分を取得するため、途中でファイルが変わると別々の状態をレビューすることになる。

修正は Phase 4 まで行わない。レビュー中に、ユーザーとの並行した別件の会話や、別のタスクのコード変更もしない。

レビュアー: `review-implementation` / `review-security` / `review-architecture` / `review-maintainability` / `review-plan-alignment`（Code レビューで、比較対象の実装計画が別途渡された場合のみ）。`subagent_type` は各エージェント定義の `name`。名前が衝突する場合は `relubox:review-<role>`。

`model` とツール許可はエージェント定義ファイル側にあるので、呼び出し側で指定し直さない。

### 絶対パスだけを渡す

**subagent のプロンプトに書くパスは、すべて絶対パスに展開する。** シェル変数も、相対パスも、subagent に埋めさせる `<プレースホルダ>` も書かない。subagent は別プロセスなので、相対パスの `references/…` は存在しないパスに解決される。レビュアーは Severity 基準を持たないままレビューし、そのことを報告もしない。

### 各レビュアーへ渡すもの

- **結果の出力先の絶対パス**（`<出力先>/<役割名>.md`）。レビュアーごとに異なる
- レビュー種別（Plan / Design / Code）と、判定基準ファイルの**絶対パス**
- 「指摘が 0 件でも `問題なし` の 1 行を必ず返すこと。無言でターンを終えないこと」を毎回書く
- `references/deepwiki.md` の絶対パス
- 該当すれば `references/domains/<domain>.md` の絶対パス
- レビュー対象の指定。次のいずれか 1 つ
  - `PR 番号: <n> / baseRefOid: <base> / headRefOid: <head>`（fetch 済み）
  - `レビュー対象の文書: <絶対パス>`（パスが無ければ本文そのもの）
  - `PR 番号なし。未コミットの変更が対象`
- `review-plan-alignment` にだけ、実装計画のパスまたは本文

Plan / Design レビューでは、判定基準ファイルの観点を役割ごとに分担する。担当表は各 `agents/review-*.md` にある。1 つの役割が不在になると、その担当分の観点は誰も確認していないことになる。報告の警告行にはその旨も書く。

**渡してはならないもの**（この構成の要点である）: 変更ファイルの一覧、diff のテキスト、リポジトリの構造説明、「この設計は合意済み」などの設計判断の説明。

subagent が権限プロンプトに当たると、このセッションに表示される。ユーザーに渡す。subagent の代わりに承認してはならない。

### Codex の実行

Codex は main agent が自分で実行する。レビュアーへ委譲したあと、結果を待たずに続けて実行する。数分かかり、その数分はレビュアーが読んでいる時間と並行する。

Codex には役割を割らない。範囲全体を 1 人で見る、別モデルとしての交差チェックとして扱う。役割で分割すると、Claude 側の分担と重複する。

#### 1. Codex を動かす

まず一時ディレクトリを作り、リクエストを `Write` ツールでその中に書く。

```bash
mktemp -d "${TMPDIR:-/tmp}/cross-review.XXXXXX"
```

**リクエストをシェルの引数やヒアドキュメントで組み立ててはならない。** `Write` ツールでファイルに書き、標準入力から渡す。

次に、同梱スクリプトを 1 回の Bash 呼び出しで実行する。`timeout: 600000` を指定する。

```bash
bash <このスキルのベースディレクトリ>/scripts/run-codex-review.sh "<mktemp が出力したディレクトリ>" "<プロジェクトディレクトリの絶対パス>"
```

スクリプトは `<tmpdir>/request.md` を Codex に渡し、`<tmpdir>/codex.md` に書かれた最終メッセージだけを標準出力に返し、終了時に `<tmpdir>` を丸ごと削除する。`--sandbox read-only` の付与、標準出力・標準エラー出力の抑制、終了コードと空ファイルの判定、削除対象を `cross-review.??????` の形に限定する安全策は、スクリプト自身のコメントに書いてある。ここでの責務は、リクエストを書いて渡すことと、失敗時の再試行だけである。

失敗判定: 出力全体が `CODEX_FAILED status=<rc>` または `CODEX_FAILED reason=<理由>` の 1 行だけなら、1 回だけ再実行する。

**再実行は最初からやり直す。** スクリプトは成功・失敗を問わず終了時に `<tmpdir>` を丸ごと削除するため、同じ引数で呼び直すと `CODEX_FAILED reason=invalid_tmpdir` になり、`request.md` も残っていない。新しい `mktemp -d`、新しい `request.md` の `Write`、新しいディレクトリでのスクリプト実行まで、最初から繰り返す。

再度失敗したら役割別レビュアーだけで続け、レポートに `不在: <失敗の内容>` と書く。

回答はコマンドの出力から読み、必要な内容を自分のコンテキストに保持する。

#### 2. リクエストに含めるもの

レビュー対象のファイル一覧・diff テキスト・構造調査結果は含めない。レビュアーと同じく自分で取得させる。

- レビュー種別と、判定基準ファイル・`references/deepwiki.md` の絶対パス
- レビュー対象の指定。「各レビュアーへ渡すもの」と同じ 3 通りの書式を使う
- 次の指示（英文でそのまま書く）

```
Determine the review scope yourself, from the local Git repository or the document named above.
With a PR: the objects are already fetched. Use `git diff <baseRefOid>...<headRefOid>`
for the change, `git show <headRefOid>:<path>` to read a file at the PR head, and
`git grep <pattern> <headRefOid>` to search the PR head. Do not run `gh`, and do not
read the working tree for PR files -- the checked-out branch is not the PR head.
With a document path: that document is the whole scope. Do not look at Git diffs.
With neither: the uncommitted changes in the working tree. Check all three of
`git diff`, `git diff --cached`, and `git ls-files --others --exclude-standard`.

Inspect any repository files necessary to understand the change.
Do not report unrelated pre-existing issues.
Report only issues introduced by or materially affected by the current change.
Provide concrete evidence such as file paths, lines, code behavior, or dependency relationships.

No questions or confirmations needed. Proactively output specific proposals, fixes, and code examples.

Filter findings by: (1) Critical issues (bugs, security, design flaws), (2) Issues worth fixing. Omit minor nitpicks and style preferences. Do not drop a finding because the fix would be large.

Read the criteria file at the absolute path given above in full before you start. Use its severity table, its scope boundaries, and -- for a Plan or Design review -- its list of review aspects.
If you find nothing, reply with a single line saying so. Do not end without a reply.
```

- 指摘の書式（下記）
- バージョンの主張はロックファイルで確認すること（下記の記述のうち、deepwiki MCP に触れない部分だけ）

### 指摘の書式

Codex の指摘は以下をすべて持つ。

| 項目 | 内容 |
|------|------|
| id | `C1`、`H2` など |
| severity | `references/<type>.md` の基準による |
| location | `file:line`、見出し、またはステップ番号 |
| claim | 何が問題かを 1 文で |
| evidence | どの入力・状態で何が起きるか。それを示すコードの経路 |

### 収集

**レビュアーごとに、次のどちらかが起きるまで待つ。**

- そのレビュアーの出力ファイルが、最終行に `<!-- CROSS_REVIEW_COMPLETE -->` を持った状態で現れる
- そのレビュアーのターンが終わり、待機状態になったという通知が届く

どちらかが起きた時点で、そのレビュアーの出力ファイルを `Read` で読む。**Codex の完了はレビュアーを打ち切る条件にしない。** Codex は数十秒で失敗が確定することもあり、その時点ではレビュアーがまだ読んでいる。

- ファイルがあり、最終行がマーカー → その役割の指摘として採用する
- ファイルが無い、または最終行がマーカーでない → その役割を `不在: 結果ファイルなし` と記録する

sleep・polling・待機ループは使わない。通知は自動で届く。

レビューを終える前に、起動したレビュアーをすべて `TaskStop` で停止する。

## Phase 3: トリアージ

議論は行わない。main agent が各指摘を自分で確認して振り分ける。

**まず、レビュー対象が途中で変わっていないか確認する。** 未コミットの変更が対象のとき、Phase 1 step 4 と同じコマンドを実行し、記録した digest と比較する。

一致しなければ、レビュー中にファイルが変わっている。参加者ごとに別の状態を読んでいるため、指摘の `file:line` と evidence が信用できない。**この結果は採用せず**、ユーザーにその事実を報告して、レビューをやり直すかどうかを確認する。

1. **重複の統合**: 複数のレビュアーと Codex が同じ問題を挙げていたら 1 件に統合する。特に `review-architecture` と `review-maintainability` は重複が出やすい。統合した指摘には、何人が独立して挙げたかを記録する（採否の判断材料にする）
2. **evidence の確認と処分**: 指摘の evidence が成立するかを、main agent が該当ファイルを読んで確認する。**PR レビューでは `git show <headRefOid>:<path>` と `git grep <pattern> <headRefOid>` で読む。** ローカルのワークツリーは PR head と一致していないため、`Read` で読むと別の内容を見ることになる。オブジェクトは Phase 1 で fetch 済みである。結果で 3 つに分ける。

   - **反証された**: finding 不成立として破棄する。最終報告に載せない
   - **確認できた**: Severity の判定へ進める
   - **確認できない**: 「判断が必要」へ送る。差し戻しはしない

   今回の変更と無関係な既存の問題を報告した finding も、ここで破棄する。レビュアーと Codex に同じ制約を渡しているが、守られなかった場合の受け皿を main agent 側にも置く。
3. **Severity の確定**: `references/<type>.md` の表で付ける。LOW はすべて落とす
4. **振り分け**

残りを、修正が一意に決まるかどうかで分ける。

**修正を提案する** — 以下をすべて満たす。正しい挙動が一意に定まる。妥当な修正が 1 つしかない。修正がレビュー範囲の内側に収まり、新しい依存・スキーマ変更・公開 API の変更を必要としない。

**判断が必要** — 以下のいずれかに当たる。妥当な修正が複数あり、選択が設計判断になる。意図した挙動が不明で、レビュアーの見解が割れた。修正がレビュー範囲の外に及ぶ。確認にレビュー範囲外の実行やユーザーしか知らない情報が要る。

迷ったら「判断が必要」に入れる。

**却下できる指摘は限られる。** 承認済みの実装計画の Constraints または会話で確定した設計判断と矛盾する指摘だけを却下し、実装計画の該当節見出しか会話中の具体的な発言を引用して理由を書く。引用できる根拠が無い限り却下してはならない。「自分がそう設計したから」だけでは根拠にならない。迷ったら却下せず「判断が必要」に回す。

**バージョンに関する指摘は証拠で決める。** ある API が非推奨・非慣用・削除済みだという指摘には、`references/deepwiki.md` の手順で、そのバージョンを明示して deepwiki に問い合わせる。裏が取れたら指摘を維持して回答を引用する。否定されたら取り下げる。答えが得られなければ **未検証** として Severity を 1 段下げる。

## Phase 4: 修正・報告

### 1. 編集が承認されているときだけ修正する

レビュー・確認・報告の依頼は、編集の承認ではない。「レビューして」は指摘を求めている。「レビューして直して」は変更を求めている。

編集が承認されている場合、トリアージ後に残った修正候補を適用し、プロジェクトに型チェッカー・リンター・テストがあれば 1 件ずつ確認する。承認されていない場合は何も変更せず、下の「修正を提案する指摘」の節を使う。

### 修正スコープを守る

レビュー依頼で承認されていない変更まで main agent が勝手に行わないためである。

- レビューで確認された claim/evidence が指す箇所だけを直す。ついでの整理をしない
- 新しい dependency・schema・公開 API の変更が必要な修正は自動修正せず「判断が必要」に回す

### 2. 報告

日本語で報告する。「修正した指摘」は実際に編集した分だけに使う。

```
## レビュー結果

> **レビュー品質の低下: <不在だった役割名をすべて列挙> が不在。これらの観点は誰も確認していない。**

### スコープ / レビュアー / バージョン確認
<レビューしたファイル、役割ごとの参加状況（どの役割が何件挙げたか、不在の役割があればその理由）、deepwiki で確認したバージョン、および「依存の既知脆弱性は未検証（advisory データベースを引く手段が無い）」の 1 行>

---

## 修正した指摘

### 1. <title>  `<file:line / 見出し / ステップ番号>`
**id / severity**: <C1 / CRITICAL など>
**指摘**: <何が問題だったか>
**修正前の挙動**: <具体的な入力・状態> のとき <具体的な結果>
**修正後の挙動**: 同じ入力で <具体的な結果>
**変更内容**: <何を編集したか>

---

## 修正を提案する指摘（編集は未承認）

### 1. <title>  `<file:line / 見出し / ステップ番号>`
**id / severity**: <C1 / CRITICAL など>
**指摘**: <何が問題か>
**現在の挙動**: <具体的な入力・状態> のとき <具体的な結果>
**提案する修正**: <置き換える内容そのもの>

---

## 判断が必要な指摘

### 1. <title>  `<file:line / 見出し / ステップ番号>`
**id / severity**: <C1 / CRITICAL など>
**指摘**: <何が問題か>
**指摘元**: <役割名・Codex のうち、この指摘を挙げた者。複数なら全員>
**現在の挙動**: <具体的な入力・状態> のとき <具体的な結果>
**選択肢**:
- A: <案> — <トレードオフ>
- B: <案> — <トレードオフ>
**判断が必要な理由**: <理由>

---

## 却下した指摘（判断の記録）
- <指摘> — 却下理由: <実装計画の節見出し、または会話中の発言>
```

**期待した参加者は、起動条件を満たして実際に起動した者だけである。** 起動条件を満たさず起動しなかった役割は「対象外」であり、不在ではない。Plan レビューで `review-plan-alignment` を起動しないのは対象外であって、警告の対象にしない。

**起動したのに結果が得られなかった参加者が 1 人でもいれば、警告行を報告の先頭に出す。** 全員から結果が得られた場合だけ、この行を省く。役割分担型なので、`review-security` が不在のレビューは security を確認していないレビューである。他のレビュアーが肩代わりしたわけではない。

Codex が不在だった場合も同じ扱いにする。Codex は別モデルによる交差チェックであり、Claude 側のレビュアーが代わりにはならない。

挙動を書く 2 行には具体的な値を入れる。実際の入力、実際の出力、実際のエラーメッセージ。「正しく動くようになった」は報告ではない。「空配列を渡すと `TypeError: cannot read length of undefined` で落ちていたのが、`0` を返すようになった」が報告である。

該当が無い節は省く。
