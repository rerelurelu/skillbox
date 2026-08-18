# deepwiki によるバージョン事実確認

レビュアーの学習データより新しいバージョンを使っている場合、そのバージョンでの推奨実装をレビュアーは知らない。知らないことに気づかないまま「問題なし」と判断するか、古いバージョンの知識で誤った指摘を出す。deepwiki MCP は GitHub リポジトリのソースとドキュメントを直接読んで答えるため、この穴を埋められる。

**この手順はレビュアー自身が、レビュー範囲を読んだあとで実行する。** main agent がブリーフィング作成時に代わりに調べて渡すことはしない。どのライブラリが version-sensitive かは、変更ファイルを実際に読んだレビュアーの方が正確に判断できる。

deepwiki MCP が使えないときは、この手順を丸ごとスキップする。スキップしたことはレポートに 1 行書く（黙って落とすと、確認したのかしていないのか分からなくなる）。

## いつ使うか

**変更ファイルが実際に import / require しているもの**と、**その言語・ランタイム本体**が対象。全依存を引くと時間もトークンも消費する。**合計 5 件を上限**とし、超える場合は変更ファイルでの使用箇所が多い順に選ぶ。

無制限に調査しない。version-sensitive な指摘（非推奨 API の使用、EOL したランタイムへの依存など）を出す・出された指摘を裏取りするときだけ使う。

## このレビュアーが持つツールでできること

`claude-reviewer` は `Read` / `Grep` / `Glob` / `SendMessage` / deepwiki MCP しか持たない。`Bash` が無いため、`node -p`・`npm view`・`curl` のようなコマンドは実行できない。**そのため、以下の手順はすべてローカルのファイルを `Read` で直接読む方法だけで組み立ててある。** ネットワーク越しのレジストリ問い合わせが必要な箇所は、ローカルにキャッシュされたファイルが無ければ諦めてスキップする（推測や記憶で埋めない）。

## 手順 1: バージョンを特定する

**必ずバージョンを特定してから質問する。** 最新版の話を聞いても、こちらが使っているのが 2 世代前なら答えは役に立たない。すべて `Read` でファイルの中身を見ればよく、コマンド実行は不要。

### 言語・ランタイム

| 対象 | 読むファイル |
|------|--------|
| TypeScript | `package.json` の `devDependencies.typescript`、または `node_modules/typescript/package.json` の `version` |
| Node.js | `.nvmrc` / `.node-version` / `package.json` の `engines.node` |
| Python | `.python-version` / `pyproject.toml` の `requires-python` / `runtime.txt` |
| Go | `go.mod` の `go 1.x` ディレクティブ |
| Rust | `rust-toolchain.toml` / `Cargo.toml` の `rust-version` |
| Kotlin | `gradle/libs.versions.toml` の `kotlin` / `build.gradle.kts` の `kotlin("jvm") version "..."` / `pom.xml` の `kotlin.version` |
| Deno | `deno.json` / `.dvmrc` |
| Bun | `package.json` の `engines.bun` |

### フレームワーク（バージョンの取得元が言語と同じ場所にあるもの）

| 対象 | 読むファイル |
|------|--------|
| Spring Boot | `gradle/libs.versions.toml` / `build.gradle.kts` の `id("org.springframework.boot") version "..."` / `pom.xml` の `spring-boot-starter-parent` の `<version>` |

### ライブラリ・フレームワーク

ロックファイル、または実際にインストール済みのパッケージが持つ `package.json` の解決済みバージョンを使う。マニフェストのレンジ指定（`^4.0.0`）ではなく、実際に入っている版を見る。

| エコシステム | 読むファイル |
|------|--------|
| npm / pnpm / yarn | `node_modules/<pkg>/package.json` の `version`。無ければロックファイル（`package-lock.json` / `pnpm-lock.yaml` / `yarn.lock`）の解決済みバージョン |
| Go | `go.mod` の `require <module path> v<version>` |
| Python | `requirements.txt` / `uv.lock` / `poetry.lock` の該当行 |
| Rust | `Cargo.lock` の `name = "<pkg>"` に続く `version` |

バージョンが特定できないものは質問対象から外す。バージョン無しで聞いた答えは検証に使えない。

## 手順 2: GitHub リポジトリを解決する

deepwiki は `owner/repo` 形式しか受け付ける。

### 言語・ランタイム（対応表）

レジストリに存在しないため、直接指定する。

| 対象 | repoName |
|------|----------|
| TypeScript | `microsoft/TypeScript` |
| Node.js | `nodejs/node` |
| Python | `python/cpython` |
| Go | `golang/go` |
| Rust | `rust-lang/rust` |
| Kotlin | `JetBrains/kotlin` |
| Deno | `denoland/deno` |
| Bun | `oven-sh/bun` |
| Swift | `swiftlang/swift` |
| .NET | `dotnet/runtime` |
| Spring Boot | `spring-projects/spring-boot` |

### ライブラリ・フレームワーク（ローカルにキャッシュされたメタデータから解決）

`npm view` や `curl` の代わりに、依存解決の過程でローカルに既に置かれているファイルを読む。

| エコシステム | 読むファイル | 見る場所 |
|------|------|------|
| npm | `node_modules/<pkg>/package.json` | `repository.url`（`git+https://github.com/<owner>/<repo>.git` の形。`git+` と `.git` を削る） |
| Go | `go.mod` のモジュールパス | `github.com/<owner>/<repo>` ならそのまま使える |
| Rust | `~/.cargo/registry/src/index.crates.io-*/<pkg>-<version>/Cargo.toml` | `repository = "..."`（`cargo build`/`check` 済みでキャッシュがある場合のみ） |
| Python | `<venv>/lib/python*/site-packages/<pkg>-<version>.dist-info/METADATA` | `Project-URL: Source, ...` 行（無ければ `Home-page:`） |
| Maven（Kotlin / Java / Spring Boot） | `~/.m2/repository/<groupId をスラッシュ区切り>/<artifactId>/<version>/<artifactId>-<version>.pom` | `<scm><url>`（`<project><url>` はプロダクトサイトを指すことがあるので使わない。実例: Spring Boot はプロジェクト直下の `<url>` が `https://spring.io/projects/spring-boot`、`<scm><url>` が `https://github.com/spring-projects/spring-boot`） |

**PyPI の `Project-URL` は最初に見つかった github.com URL を取ってはいけない。** `Funding` が `github.com/sponsors/<user>` を指していることがあり、スポンサーページを掴む（実例: `pydantic` は `Funding` が先に並んでいる）。`Source` → `Repository` → `Code` → `Homepage` の順で探し、`/sponsors/` を含む URL は除外する。末尾の `.git` は削る。

### 解決できなかった場合

ローカルにキャッシュが無い、依存がインストールされていない、対応表に載っていないエコシステムのいずれでも、そのライブラリは質問対象から外す。推測でリポジトリ名を組み立てない。ネットワーク越しのレジストリ問い合わせは行わない（`claude-reviewer` に `Bash`/ネットワークアクセスの権限が無いため）。

## 手順 3: 質問する

`mcp__deepwiki__ask_question` に `repoName` と `question` を渡す。**question には必ず具体的なバージョンを書く。**

```
In <name> v<version>, <具体的な質問>.
Answer for v<version> specifically, not for the latest release.
```

### 用途別テンプレート

**(a) レビュアー自身の初回調査**（レビュー範囲を読んだ直後、指摘を出す前）

```
In <name> v<version>, what are the recommended APIs and patterns for <スコープで使っている機能>?
Which APIs were recommended in earlier versions but are deprecated or discouraged in v<version>?
Answer for v<version> specifically, not for the latest release.
```

**(b) 指摘の裏取り**（議論で version claim が争点になったとき）

```
In <name> v<version>, is `<API名>` deprecated or discouraged?
If so, what replaced it and in which version did that change?
Does `<API名>` still work correctly in v<version>, or has it already been removed?
Is a specific future version already announced for its removal? If so, which one?
If it is not deprecated in v<version>, say so explicitly.
Answer for v<version> specifically, not for the latest release.
```

「非推奨でないなら、そうと明言せよ」を入れるのは、質問の形に引きずられて非推奨だと答えてしまうのを防ぐため。「現バージョンでまだ動作するか」「削除予定バージョンが明示されているか」を聞くのは、Severity を「deprecated」というラベルではなくこの確認結果から決めるため（`references/code.md` の Severity 基準を参照）。

## 手順 4: 結果の扱い

**指摘として提出するとき**: deepwiki の回答を出典として引用する。Severity はラベルではなく、回答が示す実害（現バージョンで動作するか、削除予定バージョンが決まっているか）から `references/code.md` / `references/design.md` の基準に当てはめる。

```
【deepwiki: honojs/hono v4.13.2 について】
<回答>
```

**議論で争点になったとき**: バージョン整合性に関する指摘は、deepwiki の回答を証拠として提出させる。

- 裏が取れた → 指摘を維持し、レポートに deepwiki の該当箇所を引用する。Severity は上記の基準で当てはめ直す
- 否定された → 指摘を取り下げる
- deepwiki が答えられなかった、または対象を解決できなかった → **未検証**として扱い、Severity を 1 段下げる。記憶だけを根拠に非推奨と断定しない

この確認は議論のラウンド数に数えない。
