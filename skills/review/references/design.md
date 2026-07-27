# Design Review Criteria

Use these criteria when the reviewed scope is an architecture document or design decision.

## 観点

- **代替案の検討**: 他のアプローチを検討し、トレードオフを比較したか
- **スケール前提**: 想定する負荷・データ量に対して妥当な設計か
- **障害モード**: 障害時の挙動（フェイルオーバー、リトライ、部分障害）が考慮されているか
- **運用・移行パス**: 既存システムからの移行手順、監視・運用性が考慮されているか
- **技術選定のバージョン整合性**: 選定した言語/FW/ライブラリが将来性のある選択か、非推奨・EOLが近いものを選んでいないか

## Severity基準

| Severity | Action | 基準 |
|----------|--------|------|
| **CRITICAL** | Must fix | 障害時にデータ損失やサービス停止を招く設計上の欠陥 |
| **HIGH** | Must fix | スケールしない設計、移行パスの欠如、代替案検討なしで明らかに劣る選択 |
| **MEDIUM** | Consider | 運用性・監視の考慮不足 |
| **LOW** | Skip | 好みの範囲の指摘 |
