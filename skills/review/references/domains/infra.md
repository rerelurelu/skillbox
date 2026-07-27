# Infra Domain Criteria

Additive criteria for scope containing infrastructure code (IaC, CI/CD, container/orchestration config). Use alongside the type criteria (`references/<type>.md`), not in place of them.

## 観点

- **最小権限**: IAM/権限設定が必要最小限か、過剰な権限付与がないか
- **シークレット管理**: 認証情報がハードコードされず、適切な仕組み（環境変数/シークレットマネージャ）で管理されているか
- **冪等性**: 適用を繰り返しても安全か（IaCの再実行、CI再実行）
- **ロールバック・影響範囲**: 変更失敗時に戻せるか、影響範囲（blast radius）が把握できているか
- **可観測性**: ログ・メトリクス・アラートが変更後も機能するか
- **ネットワーク露出**: 不要な公開範囲（セキュリティグループ、ポート開放）がないか
