# Plan Review Criteria

Use these criteria when the reviewed scope is an implementation plan, task list, or TODO document.

## 観点

- **手順の抜け漏れ**: 実装に必要なステップが欠けていないか
- **依存関係の矛盾**: タスク間の実行順序や前提条件が矛盾していないか
- **ロールバック可否**: 途中で失敗した場合に安全に戻せる手順になっているか
- **検証ステップの有無**: 各フェーズの完了を確認する手段（テスト、動作確認など）があるか

## Severity基準

| Severity | Action | 基準 |
|----------|--------|------|
| **CRITICAL** | Must fix | ロールバック不可能な破壊的操作を含み、失敗時に取り返しがつかない |
| **HIGH** | Must fix | 依存関係の矛盾や検証手段の欠如により、計画が途中で破綻しうる |
| **MEDIUM** | Consider | 手順の粒度が粗い、想定外ケースの考慮が薄い |
| **LOW** | Skip | 表現や順序の好みなど、実行可否に影響しない指摘 |
