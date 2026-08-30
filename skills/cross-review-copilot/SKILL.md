---
name: cross-review-copilot
description: |
  コード、実装計画、設計、pull request を GitHub Copilot CLI の役割別レビュアーと Codex で独立レビューし、指摘を検証して最終判断する。`codex` CLI が必要。Claude Code では cross-review を使う。
  Triggers on: "review", "code review", "review this", "レビュー", "レビューして", "/cross-review-copilot"
  Use when: reviewing code, implementation plans, or architecture/design decisions from GitHub Copilot CLI.
version: "4.0.0"
user-invocable: true
argument-hint: "[scope]"
license: "GPL-3.0"
---

# Cross Review (Copilot CLI)

役割別のレビュアー（最大 5 人）が同じレビュー範囲を並列に、別々の観点で独立に調べる。レビュー対象は各レビュアーが、ローカルの Git スナップショットまたは指定された文書から自分で取得する。host は自分の手で Codex も動かし、全員の指摘を集めて評価する。会話の文脈——要件、設計判断、承認済みの実装計画——を持っているのは host だけなので、指摘の要否を最終的に決めるのも host だけである。

## host の責務

**host はレビュアーの調査を代行せず、レビュー全体の調整・裁定・報告を担う。** 指摘をそのまま集約するだけで満足せず、会話が持っている設計文脈を使って能動的に評価する。

### このレビューが扱わないもの

扱わないのは「今の挙動も変更時のコストも変わらない、書き方の好み」だけである。不要コード・YAGNI・過剰な実装や抽象化・「もっと単純に書ける」を理由とする指摘は扱わない（`lean-review` スキルの担当範囲である）。

**責務の配置・依存の向き・重複実装・保守運用上の問題は対象に含める。** ただし、変更時・運用時・障害時に成立する具体的な誤りを evidence に書けるものに限る。「なんとなく汚い」「将来困るかもしれない」で終わる指摘は対象外である。

| 役割 | やること |
|------|----------|
| **host** | 判定 · レビュアーへの委譲 · Codex の実行 · トリアージ · 編集 · 報告 |
| `review-implementation` | 境界値・異常系・並行性・状態管理・バージョン整合性・変更の波及を確認する |
| `review-security` | 信頼できない入力の流れ・認証認可の分離・機密情報の扱い・安全でない依存を確認する |
| `review-architecture` | 責務の配置・依存の向き・重複実装・変更の集中点・既存パターンとの整合を確認する |
| `review-maintainability` | 可観測性・障害時の挙動・テスタビリティ・dead code・設定と環境差を確認する |
| `review-plan-alignment` | Code レビューで、レビュー対象とは別に実装計画が渡された場合だけ、計画との整合を確認する |

Codex には役割を割らず、範囲全体を見る別モデルとして扱う。

このスキルは `.agent.md` のカスタムエージェント定義を同梱しないし、必要ともしない。`gh skill install` が配布するのは `skills/<name>/` 配下だけなので、レビュアーの共通規則は `references/reviewer-common.md`、役割固有の観点は委譲プロンプトに書く。

レビュー対象のファイルを変更するのは host だけ。

## 前提条件

```bash
command -v codex
```

`codex` が無い場合はその旨を伝え、Copilot 側の役割別レビュアーだけで続けるかをユーザーに聞く。同じモデル系統だけでレビューするのは、このスキルが前提にしている交差チェックではないので、続行はユーザーの判断とする。

deepwiki MCP は任意である。設定されていればレビュアーがバージョン確認に使い、host がバージョンに関する指摘の検証に使う。設定されていなければレポートにその旨を書く。

## ワークツリーの保護

既定のレビュー範囲は未コミットの作業である。ツリーを「きれいにする」操作は、レビュー対象そのものを破壊する。

**Phase 4 で承認済みの修正を適用するとき以外、HEAD・index・レビュー対象ワークツリーのパスを変更してはならない。** Git コマンドだけでなく、シェルのファイル操作、フォーマッタ、コード生成、ビルドも含む。

```
git stash（すべての形式）   git clean（-n / --dry-run を除く）
git reset（すべての形式）   git switch
git checkout               git restore
gh pr checkout             rm / mv / 上書きする cp
```

レビュアーにも同じ制限を `references/reviewer-common.md` から読ませる。lint・型チェック・ビルド・テストは、キャッシュや生成物を書きうるので実行させない。

`references/…` のパスは、このスキル自身のディレクトリ（`~/.copilot/skills/cross-review-copilot/`、またはインストール先のプロジェクトスキルディレクトリ）を基準に絶対パスへ展開する。作業ディレクトリを基準にしない。

## Phase 1: 判定

host はこのフェーズで、レビュー種別・判定基準・レビュー対象の指定を決める。**レビュー対象のテキストは取得しない。**

### 1. レビュー種別の判定

- **Plan** — 実装計画、タスクリスト、他のエージェントが実行する手順書
- **Design** — アーキテクチャ文書、設計判断
- **Code** — ソースコード（既定）

ドメインはパスと拡張子をヒントに見当をつける。絶対分類ではない。

- **fe** — `.tsx`/`.jsx`/`.vue`/`.svelte`、`components/`、`styles/`、`.css`/`.scss`
- **be** — `server/`、`api/`、`controllers/`、`models/`、`.sql`、ORM・マイグレーション
- **infra** — `Dockerfile`、`docker-compose*`、`*.tf`、k8s マニフェスト、`.github/workflows/`

Next.js の route handler や server component、edge、CI 専用 TypeScript のようにパスと拡張子だけでは決まらないものは、変更内容から判断する。

レビュー対象の指定は 3 通りある。

| 指定 | レビュー対象 |
|------|------------|
| ユーザーが PR 番号を渡した | その PR |
| ユーザーが文書のパスを渡した、または会話に文書を貼った | その文書。Git の差分は見ない |
| どれも無い | 未コミットの変更すべて |

種別判定のために変更されたファイルのパスと拡張子だけ確認してよい。未コミットなら `git diff HEAD --name-only` と `git ls-files --others --exclude-standard`、PR なら `gh pr view <n> --json files`。**この結果をレビュアーへ渡さない。** 対象が空なら報告して停止する。

### 2. 判定基準ファイルの絶対パスの確定

`references/<type>.md`、`references/reviewer-common.md`、`references/deepwiki.md`、該当すれば `references/domains/<domain>.md`。

### 3. PR スナップショットの固定と、実装計画の有無の確認

PR レビューの場合、レビュアーを起動する前に PR の中身をローカルへ取り込む。次のコマンドはワークツリー・HEAD・index を変更しない。

```bash
gh pr view <n> --json baseRefOid,headRefOid,baseRefName
git fetch origin "pull/<n>/head" "<baseRefName>"
git cat-file -e "<baseRefOid>^{commit}" && git cat-file -e "<headRefOid>^{commit}"
```

OID の検証が失敗したら、OID の取得と fetch を 1 組としてもう一度やり直す。2 回目も失敗したら、PR が更新され続けている可能性を報告して停止する。`baseRefOid` と `headRefOid` を全参加者へ渡す。渡したあとに PR が更新されても、全員は同じ fetch 済みオブジェクトを読む。

実装計画の有無は、会話またはユーザーが渡したパスから確認する。

### 4. 未コミット変更の digest を記録する

レビュー対象が未コミットの変更のとき、レビュアーを起動する前に内容の digest を取る。

```bash
{ git diff HEAD; git ls-files --others --exclude-standard | while read -r f; do printf '%s\n' "$f"; cat "$f"; done; } | shasum -a 256
```

この値を手元に残し、Phase 3 の冒頭で同じコマンドを実行して比較する。

## Phase 2: 並列レビュー

**起動条件を満たす役割別レビュアーを、可能なら 1 回の並列委譲で同時に起動する。** その直後、結果を待たずに Codex を実行する。このフェーズの間はワークツリーを変更しない。

起動する役割は `review-implementation` / `review-security` / `review-architecture` / `review-maintainability`。`review-plan-alignment` は Code レビューで、比較対象の実装計画が別途渡された場合だけ起動する。

### 各レビュアーへ渡すもの

プロンプトに書くパスはすべて絶対パスに展開する。シェル変数、相対パス、レビュアーに埋めさせるプレースホルダーを残さない。

- 役割名と、下の「役割固有の観点」の該当行
- レビュー種別（Plan / Design / Code）
- `references/reviewer-common.md` と判定基準ファイルの絶対パス。**両方を最初に全文読むこと**
- `references/deepwiki.md` の絶対パス
- 該当すれば `references/domains/<domain>.md` の絶対パス
- レビュー対象の指定。次のいずれか 1 つ
  - `PR 番号: <n> / baseRefOid: <base> / headRefOid: <head>`（fetch 済み）
  - `レビュー対象の文書: <絶対パス>`（パスが無ければ本文そのもの）
  - `PR 番号なし。未コミットの変更が対象`
- `review-plan-alignment` にだけ、実装計画のパスまたは本文
- 「指摘が 0 件でも `問題なし` と必ず最終メッセージで返す。無言でターンを終えない」

**渡してはならないもの**: 変更ファイルの一覧、diff のテキスト、リポジトリの構造説明、「この設計は合意済み」などの設計判断の説明。

#### 役割固有の観点

- **review-implementation**: 境界値と異常系、握り潰されたエラー、リトライの冪等性、並行性、状態とライフサイクル、実際のバージョンとの整合、変更の波及
- **review-security**: 信頼できない入力がクエリ・シェル・HTML・パスへ到達する経路、認証と認可の分離、機密情報の保存・ログ出力、安全でない依存。ただし advisory DB は使えないので既知脆弱性を確認済みと書かない
- **review-architecture**: 責務の配置、依存の向き、同一ルールの重複実装、変更の集中点、既存パターンとの整合。現在・変更時・障害時の具体的な実害を evidence にできるものだけ
- **review-maintainability**: エラーの可観測性、障害時の復旧経路、テストの分離可能性、dead code、設定・環境差、時間依存の脆さ、コメントと実装の乖離
- **review-plan-alignment**: 実装計画の各項目が実装済みか、計画に無い変更が無いか、計画が除外した事項に手が入っていないか

Plan / Design では、コード向けの役割観点より判定基準ファイルの観点を優先し、次を必ず分担する。担当外で気づいた問題も報告してよい。

| 役割 | Plan | Design |
|------|------|--------|
| `review-implementation` | 手順の抜け漏れ、検証ステップの有無 | 技術選定のバージョン整合性 |
| `review-architecture` | 依存関係の矛盾、未確定事項の扱い | 代替案、スケール前提、責務境界、変更の集中点 |
| `review-maintainability` | ロールバック可否 | 障害モード、運用・移行パス、可観測性 |

`review-security` には固定の担当観点が無い。自身の観点を計画・設計へ当てる。

### Codex の実行

Codex は host が自分で実行する。レビュアーへ委譲したあと、結果を待たずに続ける。

まず一時ディレクトリを作る。

```bash
mktemp -d "${TMPDIR:-/tmp}/cross-review.XXXXXX"
```

次に、シェルを経由せず、利用可能なファイル作成ツールでリクエストを `<tmpdir>/request.md` に書く。リクエストをシェル引数やヒアドキュメントで組み立てない。

そのあと、同梱スクリプトを実行する。**10 分以上の実行時間を許可する。**

```bash
bash <このスキルのベースディレクトリ>/scripts/run-codex-review.sh "<tmpdir>" "<プロジェクトディレクトリの絶対パス>"
```

スクリプトは最終メッセージだけを標準出力に返し、終了時に `<tmpdir>` を削除する。

出力全体が `CODEX_FAILED status=<rc>` または `CODEX_FAILED reason=<理由>` の 1 行だけなら、1 回だけ再実行する。**再実行は最初からやり直す。** 新しい `mktemp -d`、新しい `request.md`、新しいディレクトリでの実行まで繰り返す。再度失敗したら Codex を `不在: <失敗の内容>` と記録する。

回答はコマンドの出力から読み、必要な内容を自分のコンテキストに保持する。

#### Codex のリクエスト

レビュー対象のファイル一覧・diff テキスト・構造調査結果は含めない。レビュアーと同じく自分で取得させる。

- レビュー種別と、判定基準ファイル・`references/deepwiki.md` の絶対パス
- レビュー対象の指定。レビュアーと同じ 3 通りの書式
- 指摘の書式（`id` / `severity` / `location` / `claim` / `evidence`）
- バージョンの主張はロックファイルで確認すること
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

Codex の finding は次の 5 項目をすべて持つ。

| 項目 | 内容 |
|------|------|
| id | `C1`、`H2` など |
| severity | 判定基準ファイルによる |
| location | `file:line`、見出し、またはステップ番号 |
| claim | 何が問題かを 1 文で |
| evidence | どの入力・状態で何が起きるか。それを示すコードまたは文書上の経路 |

### 収集

レビュアーの最終メッセージを結果として回収する。指摘が 0 件なら `問題なし`、最終メッセージが得られなければその役割を `不在: 応答なし` と記録する。**Codex の完了をレビュアーの打ち切り条件にしない。** 起動した全員が完了または不在と確定するまで待つ。

## Phase 3: トリアージ

議論は行わない。host が各指摘を自分で確認して振り分ける。

未コミット変更が対象なら、最初に Phase 1 step 4 と同じコマンドを実行して digest を比較する。一致しなければ結果を採用せず、レビュー中に対象が変わったことを報告して、やり直すか確認する。

1. **重複の統合**: 同じ問題を 1 件に統合し、独立して挙げた参加者を記録する
2. **evidence の確認**: host が該当箇所を読む。PR では `git show <headRefOid>:<path>` と `git grep <pattern> <headRefOid>` を使い、ワークツリーを読まない
   - 反証された finding と、今回の変更に無関係な既存問題は破棄する
   - 確認できた finding は Severity 判定へ進める
   - 確認できない finding は「判断が必要」へ送る
3. **Severity の確定**: `references/<type>.md` の表で付け、LOW は落とす
4. **振り分け**

**修正を提案する** — 正しい挙動と妥当な修正が一意で、変更がレビュー範囲内に収まり、新しい依存・スキーマ・公開 API の変更を要しない。

**判断が必要** — 妥当な修正が複数ある、意図した挙動が不明、見解が割れた、修正が範囲外に及ぶ、または確認にユーザーしか知らない情報が要る。迷ったらこちらに入れる。

**却下**は、承認済みの実装計画の Constraints または会話で確定した設計判断と矛盾する指摘に限る。実装計画の節見出しか会話中の具体的な発言を引用する。「自分がそう設計したから」は根拠にしない。

バージョンに関する指摘は、ロックファイルと `references/deepwiki.md` の手順で検証する。裏が取れれば維持、否定されれば破棄、答えが得られなければ **未検証** として Severity を 1 段下げる。

## Phase 4: 修正・報告

レビュー・確認・報告の依頼は編集の承認ではない。編集が承認されている場合だけ、トリアージ後に残った修正候補を適用して検証する。レビューで確認された claim/evidence が指す箇所だけを直し、ついでの整理はしない。新しい依存・スキーマ・公開 API の変更が必要なら「判断が必要」に回す。

日本語で報告する。「修正した指摘」は実際に編集した分だけに使う。

```
## レビュー結果

> **レビュー品質の低下: <不在だった参加者を列挙> が不在。これらの観点は確認されていない。**

### スコープ / レビュアー / バージョン確認
<レビューした範囲、役割ごとの件数または不在理由、Codex の件数または不在理由、deepwiki の確認結果、「依存の既知脆弱性は未検証（advisory データベースを引く手段が無い）」>

## 修正した指摘
### 1. <title>  `<location>`
**id / severity**: <C1 / CRITICAL>
**指摘**: <問題>
**修正前の挙動**: <入力・状態と結果>
**修正後の挙動**: <同じ入力での結果>
**変更内容**: <編集内容>

## 修正を提案する指摘（編集は未承認）
### 1. <title>  `<location>`
**id / severity**: <C1 / CRITICAL>
**指摘**: <問題>
**現在の挙動**: <入力・状態と結果>
**提案する修正**: <置き換える内容>

## 判断が必要な指摘
### 1. <title>  `<location>`
**id / severity**: <C1 / CRITICAL>
**指摘元**: <役割名または Codex。複数なら全員>
**指摘**: <問題>
**現在の挙動**: <入力・状態と結果>
**選択肢**:
- A: <案> — <トレードオフ>
- B: <案> — <トレードオフ>
**判断が必要な理由**: <理由>

## 却下した指摘（判断の記録）
- <指摘> — 却下理由: <実装計画の節見出し、または会話中の発言>
```

起動条件を満たさず起動しなかった役割は「対象外」であり、不在ではない。起動したのに結果が得られなかった参加者が 1 人でもいれば警告行を先頭に出す。全員から結果を得られた場合だけ省く。役割分担型なので、不在の役割を他のレビュアーが肩代わりしたとはみなさない。Codex の不在も同じ扱いにする。

挙動には具体的な入力、出力、エラーメッセージを書く。該当が無い節は省く。
