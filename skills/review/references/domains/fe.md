# Frontend Domain Criteria

Additive criteria for scope containing frontend code (UI components, client-side state, styling). Use alongside the type criteria (`references/<type>.md`), not in place of them.

## 観点

- **アクセシビリティ**: セマンティックなHTML、キーボード操作、ARIA属性、コントラスト比
- **XSS/サニタイズ**: ユーザー入力やHTMLの動的挿入（`dangerouslySetInnerHTML`等）が適切にエスケープ・サニタイズされているか
- **状態管理**: 状態の持ち方が適切か（不要なグローバル化、重複した真実の源泉がないか）
- **レンダリング性能**: 不要な再レンダリング、重い計算のメモ化漏れ
- **レスポンシブ/クロスブラウザ**: 想定デバイス・ブラウザで崩れないか
- **エラー・ローディング状態**: 非同期処理の失敗時・読み込み中のUI状態が考慮されているか
