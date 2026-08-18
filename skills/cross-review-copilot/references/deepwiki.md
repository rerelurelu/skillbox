# deepwiki によるバージョン事実確認

レビュアーの学習データより新しいバージョンを使っている場合、そのバージョンでの推奨実装をレビュアーは知らない。知らないことに気づかないまま「問題なし」と判断するか、古いバージョンの知識で誤った指摘を出す。deepwiki MCP は GitHub リポジトリのソースとドキュメントを直接読んで答えるため、この穴を埋められる。

**この手順はレビュアー自身が、レビュー範囲を読んだあとで実行する。** host がブリーフィング作成時に代わりに調べて渡すことはしない。どのライブラリが version-sensitive かは、変更ファイルを実際に読んだレビュアーの方が正確に判断できる。

deepwiki MCP が使えないときは、この手順を丸ごとスキップする。スキップしたことはレポートに 1 行書く（黙って落とすと、確認したのかしていないのか分からなくなる）。

## いつ使うか

**変更ファイルが実際に import / require しているもの**と、**その言語・ランタイム本体**が対象。全依存を引くと時間もトークンも消費する。**合計 5 件を上限**とし、超える場合は変更ファイルでの使用箇所が多い順に選ぶ。

無制限に調査しない。version-sensitive な指摘（非推奨 API の使用、EOL したランタイムへの依存など）を出す・出された指摘を裏取りするときだけ使う。

## 手順 1: バージョンを特定する

**必ずバージョンを特定してから質問する。** 最新版の話を聞いても、こちらが使っているのが 2 世代前なら答えは役に立たない。

### 言語・ランタイム

| 対象 | 取得元 |
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

| 対象 | 取得元 |
|------|--------|
| Spring Boot | `gradle/libs.versions.toml` / `build.gradle.kts` の `id("org.springframework.boot") version "..."` / `pom.xml` の `spring-boot-starter-parent` の `<version>` |

### ライブラリ・フレームワーク

ロックファイルの解決済みバージョンを使う。マニフェストのレンジ指定（`^4.0.0`）ではなく、実際に入っている版を見る。

```bash
# npm / pnpm / yarn
node -p "require('./node_modules/<pkg>/package.json').version"
# 上が使えない場合はロックファイルを読む

# Go
grep '<module path>' go.mod

# Python
grep -i '^<pkg>' requirements.txt uv.lock poetry.lock 2>/dev/null

# Rust
grep -A1 'name = "<pkg>"' Cargo.lock
```

バージョンが特定できないものは質問対象から外す。バージョン無しで聞いた答えは検証に使えない。

## 手順 2: GitHub リポジトリを解決する

deepwiki は `owner/repo` 形式しか受け付けない。

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

### ライブラリ・フレームワーク（レジストリから解決）

```bash
# npm
npm view <pkg> repository.url        # → git+https://github.com/honojs/hono.git

# PyPI
curl -s https://pypi.org/pypi/<pkg>/json   # info.project_urls を読む

# crates.io
curl -s https://crates.io/api/v1/crates/<pkg> -H 'User-Agent: cross-review'   # crate.repository

# Go
# go.mod のモジュールパスが github.com/<owner>/<repo> ならそのまま使える

# Maven Central（Kotlin / Java / Spring Boot などの JVM ライブラリ）
curl -s https://repo1.maven.org/maven2/<groupIdをスラッシュ区切り>/<artifactId>/<version>/<artifactId>-<version>.pom
# 例: org.springframework.boot:spring-boot:3.4.1
#     → https://repo1.maven.org/maven2/org/springframework/boot/spring-boot/3.4.1/spring-boot-3.4.1.pom
```

**POM は `<scm>` ブロックの `<url>` を読む。** ファイル先頭のプロジェクト `<url>` はプロダクトサイトを指しており、GitHub ではない（実例: Spring Boot は `https://spring.io/projects/spring-boot`）。`<scm><url>` に `https://github.com/spring-projects/spring-boot` が入っている。

**PyPI の `project_urls` は最初に見つかった github.com URL を取ってはいけない。** `Funding` が `github.com/sponsors/<user>` を指していることがあり、スポンサーページを掴む（実例: `pydantic` は `Funding` が先に並んでいる）。

`Source` → `Repository` → `Code` → `Homepage` の順で探し、`/sponsors/` を含む URL は除外する。末尾の `.git` は削る。

### 解決できなかった場合

そのライブラリは質問対象から外す。推測でリポジトリ名を組み立てない。

## 手順 3: 質問する

deepwiki MCP の `ask_question` に `repoName` と `question` を渡す。**question には必ず具体的なバージョンを書く。**

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
