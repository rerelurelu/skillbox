# Frontend Domain Criteria

Additive criteria for scope containing frontend code (UI components, client-side state, styling). Use alongside the type criteria (`references/<type>.md`), not in place of them.

## 観点

- **アクセシビリティ**: クリック可能な要素が `button` / `a` になっているか（`div` に `onClick` を付けていないか）。キーボードのみで全操作に到達できるか。フォーム入力に対応する `label` があるか。アイコンのみのボタンに読み上げ用のテキストがあるか
- **XSS/サニタイズ**: `dangerouslySetInnerHTML`・`v-html`・`innerHTML` に渡る値がどこから来ているか。外部由来の値が、サニタイザを通らずに到達している経路があるか
- **状態の重複**: 同じ値が複数の場所（ローカル state、グローバルストア、URL、サーバー）に保持され、片方だけ更新されて食い違う経路があるか
- **レンダリング性能**: 親の再レンダリングのたびに再生成される関数・オブジェクトが、メモ化された子に props として渡っていないか。リストの `key` に配列インデックスを使っていないか
- **エラー・ローディング状態**: 非同期処理の pending / error / 空データの 3 状態それぞれに表示が定義されているか。定義がない状態でユーザーに何が見えるか
- **レスポンシブ**: 固定幅・固定高が指定された要素が、想定する最小画面幅ではみ出さないか

## Severityの当てはめ

type 側の Severity 表に当てはめる。判断が割れる観点は以下に寄せる。

| 観点 | 当てはめ先 |
|------|-----------|
| XSS/サニタイズの経路が存在する | CRITICAL（セキュリティ脆弱性） |
| 状態の重複により表示とデータが食い違う | HIGH（重大なロジックエラー） |
| キーボード操作で到達できない機能がある | HIGH（その機能が使えないため） |
| 上記以外のアクセシビリティ | MEDIUM |
| レンダリング性能、レスポンシブ | MEDIUM |
