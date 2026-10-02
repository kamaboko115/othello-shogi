# 報酬型広告（#68）

2026-10-02現在、AdSenseの `oshogi-games.pages.dev` は審査待ちです。本番で広告コードを読み込まず、既存の無料の無限設定を残しています。ローカルの「広告を見る」は5秒のテストで、最後の受け取りを押した時だけ次のAI対局の無限設定を有効にします。キャンセル・Escape・未配信・エラーでは付与しません。

`dist/reward-ad.js` はGoogleの `adBreak({type:'reward'})` を受け取るアダプターを実装しています。`adViewed` と `adBreakDone` の両方を受信して初めて付与します。二重クリックは同じ処理にまとめ、配信待ちのタイムアウトも設けています。BGMは広告中に止まります。報酬は次に作るAI対局の設定であり、友人対局や現在の試合には変更を加えません。

本番の残作業：

1. AdSense審査とH5 Games Adsの申請承認を確認する。
2. Google認定CMPと対象地域の同意フローを用意する。
3. 公式の広告タグと `adBreak` キューを導入する。CSPは公式ドメインだけを許可し、配信実測で必要な接続先を確認する。今の厳格なCSPは維持する。
4. `rewardProviderEnabled` を有効化する。本番の無料チェックを報酬獲得済みに制限するのはこの時点。
5. Googleのテストモードで完走・スキップ・広告なし・読込失敗を確認してから実配信を始める。

公式：
- https://developers.google.com/ad-placement/docs/signup
- https://developers.google.com/ad-placement/apis/adbreak
- https://support.google.com/adsense/answer/13554020

対局APIは使用しません。広告配信そのものの外部通信は広告を要求した時だけ発生します。
