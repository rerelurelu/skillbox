---
name: retro
description: "知識倉庫 (~/dev/knowledge) に溜まった記録を総括して、強み・傾向・課題の振り返りレポートを作る。ユーザーが「振り返りたい」「retro」「最近の自分どう？」と言ったときに使う。引数で期間やテーマを絞れる（例: /retro 直近1ヶ月、/retro 苦手だけ）。"
version: "1.0.0"
user-invocable: true
allowed-tools: "Read Bash Grep Glob"
license: "GPL-3.0"
---

# Retro — 知識倉庫の総括レポート

`~/dev/knowledge/notes/` に蓄積されたノートを横断的に読み、ユーザーが自分の成長・傾向・課題を振り返るためのレポートを作る。

## 手順

0. `~/dev/knowledge` が存在しない、またはノートが無い場合は「まだ記録がない。/memo で記録が溜まってから振り返る」と報告して終了する
1. 対象を集める:
   ```bash
   ls ~/dev/knowledge/notes/
   grep -l "type: strength" ~/dev/knowledge/notes/*.md
   grep -l "type: weakness" ~/dev/knowledge/notes/*.md
   grep -l "type: style" ~/dev/knowledge/notes/*.md
   ```
   引数で期間指定があれば frontmatter の date / last_seen で絞る。
   ノート数が多い場合は style / strength / weakness を優先して全部読み、knowledge / decision はタイトルと直近のものを中心に読む
2. 以下の観点で分析する:
   - **強み**: strength ノートから見える、繰り返し発揮されている長所。どんな場面で効いているか、さらに活かせる場面はどこかを述べる
   - **繰り返している苦手**: weakness ノートの `## 事例` の件数と日付を見る。事例が増え続けているものは要注意、最近観測されていないものは克服の兆しとして扱う
   - **コーディングの傾向**: style ノートから見える一貫した好み・判断軸。良い面と、裏返しでリスクになりうる面の両方
   - **学びの領域**: knowledge / decision のタグ分布から、最近どの技術領域に触れているか、学びが偏っていないか
   - **時系列の変化**: 以前のつまずきがその後の decision / knowledge にどう活きたか（ウィキリンクや日付の前後関係から読み取る）
3. レポートとして提示する:
   - 各指摘には根拠となるノート名と事例の日付を添える（印象論にしない）
   - 強み・改善が見えている点から先に述べ、課題はその後に置く（振り返りが凹むだけの時間にならないように）
   - 最後に「次に意識するとよいこと」を1〜3個、具体的に提案する
4. レポートは会話で提示するのみとし、倉庫には書き込まない（求められたら `~/dev/knowledge/retros/YYYY-MM-DD.md` に保存してよい）

## 注意

- ノートが少ないうちは無理に傾向を語らず、「まだ事例が少ない」と正直に言う
- 事実（事例ログ）と解釈（傾向の分析）を区別して書く
