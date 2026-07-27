# Backend Domain Criteria

Additive criteria for scope containing backend/server code (APIs, business logic, data access). Use alongside the type criteria (`references/<type>.md`), not in place of them.

## 観点

- **クエリ性能**: N+1クエリ、インデックス不足、不要に大きいデータ取得
- **トランザクション境界**: 整合性が必要な操作が適切にトランザクションで括られているか
- **入力検証・認可**: リクエストの妥当性検証、権限チェックの漏れ
- **エラーハンドリング・冪等性**: リトライされても安全か、部分失敗時にデータ不整合が起きないか
- **並行性**: レースコンディション、デッドロックの可能性
- **リソース管理**: コネクション・ファイルハンドル等のリークがないか
