# 本番の運用手順

公開先: https://oshogi-games.pages.dev/

GitHubの`main`を編集元にし、Cloudflare PagesとWorkers Buildsで公開します。AI対局は端末内で処理し、友人対局だけD1を使います。通知先の個人メールアドレス・APIトークンは公開ソースへ書きません。

## 更新と確認

1. 未保存の変更を保護してから`git fetch origin`で最新版を取得し、`origin/main`を取り込みます。
2. `npm test`と`npm run build`を実行し、`npm start`でローカル表示を確認します。
3. PRを作り、GitHub Actionsの`Test and build`を確認してからmainへ取り込みます。
4. CloudflareのBuildsで成功したコミットがmainと一致することを確認します。
5. 公開URLを開いてAI対局・チュートリアル・設定を確認し、必要なら`npm run smoke:production`を実行します。

`smoke:production`は専用の友人対局を1部屋作り、招待・参加・認証拒否・変更なし304応答・着手同期・合意した待った・投了・再試合・離脱を確認します。最後にそのテスト部屋だけ閉じます。自動定期実行や負荷テストには使いません。`SITE_URL`環境変数で別の検証先も指定できます。

## Cloudflare設定

### 無料Pages URL

AdSenseに登録できるURLを試すため、画面の配信をCloudflare Pagesにも対応させています。WorkersのURLは`Worker名.アカウント名.workers.dev`のため、名前だけ変えてもサブドメインの階層は変わりません。Pagesでは`プロジェクト名.pages.dev`になります。URLの登録可否と広告審査は別なので、登録できても広告配信の承認は保証されません。

- Pagesプロジェクト名: `oshogi-games`
- GitHub: `kamaboko115/othello-shogi`、本番ブランチ`main`
- ルートディレクトリ: `pages`
- ビルドコマンド: `npm --prefix .. test && npm --prefix .. run build:pages`
- 出力ディレクトリ: `.sites-runtime/pages`（Pagesのルート`pages`内）
- 設定ファイル: `pages/wrangler.jsonc`
- Service binding: `GAME_API` → 既存Worker `othello-shogi`

`npm run build:pages`は公開用のファイルだけを出力します。比較・開発用HTMLやサーバーのソースは配信しません。`_routes.json`により`/api/*`だけがPages Functionsを通り、それ以外は静的配信です。AIの探索は引き続き端末内で行います。友人対局のAPIはService bindingで元のRequestを既存Workerへ渡し、認証・Origin・IP制限・D1・清掃処理を維持します。

Pagesのビルド中に`cd ..`すると、続くFunctions検出がルートの`functions`を見てしまいます。`npm --prefix ..`で親のテスト・ビルドだけを実行し、Pagesの作業ディレクトリを維持してください。APIのエントリーポイントは`pages/functions/api/[[path]].js`です。

公開後は新しいURLでも`SITE_URL`を指定して`npm run smoke:production`を実行し、友人対局の作成から終了まで検証します。URLが変わるとローカル保存と参加者情報は自動では引き継がれません。旧Workers URLは既存の対局と参加リンクのため残します。

### 既存Worker

- Worker: `othello-shogi`
- D1: `othello-shogi-db`、バインディング名`DB`
- 短時間の作成制限: `ROOM_CREATE_BURST`
- 期限切れの清掃: 5分ごとのCron
- 本番ブランチ: `main`
- ビルドコマンド: `npm test && npm run build`
- デプロイコマンド: `npx wrangler d1 migrations apply othello-shogi-db --remote && npx wrangler deploy`

DBの更新に失敗した場合はデプロイも止めます。Cloudflare Buildsの既存トークンにはWorkerの公開権限とD1の編集権限が必要です。権限エラー時は管理者が必要なD1権限を確認してください。ローカルから公開する場合も、認証後に`npm run deploy`で検査・ビルド・DB更新・公開の順に実行できます。WranglerはCloudflare公式のnpmパッケージです。

2026年10月2日の本番確認では`0001_room_creation_limits.sql`が未適用で、新規友人対局が500になっていました。D1 Consoleで同じテーブルと索引を追加し、上記の一連の対局操作が成功したことを確認しました。その後Cloudflare Buildsで新しい公開手順を実行し、0000・0001のマイグレーション履歴とデプロイの成功を確認しました。SQLは`IF NOT EXISTS`なので既存対局を保持します。

## 通知と無料枠

Cloudflare Alertsに、Workers・D1の基盤障害をメールで知らせる`オセロ将棋：Cloudflare障害`を設定しています。これはCloudflareが公表する障害の通知であり、アプリ固有の500エラーや無料枠80％を直接監視するものではありません。テスト通知はCloudflareのAlerts画面から送信できます。実際の受信は宛先側で確認してください。

アプリ固有の障害と80％通知は設定完了まで運用上の残作業です。WorkersとD1の使用量はアカウント全体で確認します。無料枠の目安は次のとおりです（2026年10月2日確認）。

|対象|無料枠|80％の目安|
|---|---:|---:|
|Workersのリクエスト|1日100,000|80,000|
|D1の読み取り行|1日5,000,000|4,000,000|
|D1の書き込み行|1日100,000|80,000|
|D1の合計容量|5GB|4GB|

日次枠はUTC午前0時（日本時間午前9時）に更新されます。APIの読取・書込は対局回数とは一致せず、清掃・SQL・索引の更新も影響します。80％到達通知を追加する場合はCloudflare Analyticsの読み取り専用権限とメール送信経路を用意し、メール宛先は非公開の設定に保存します。GitHub Actions失敗のメールはGitHubアカウント側の通知設定にも依存します。

## 障害時の復旧

1. CloudflareのStatusとWorkersのMetrics、最新Buildログを確認します。部屋作成だけ500になる場合は、D1のテーブル・索引とバインディングを先に確認します。
2. コード変更が原因ならWorkersのDeploymentsで直前に成功していた版へRollbackし、公開URLで確認します。コードのRollbackはDBを過去へ戻しません。
3. GitHubでは原因となった変更をrevertするPRを作り、修正後のmainを再公開します。強制pushで共同作業の履歴を消さないでください。
4. DBデータが壊れた場合だけ、D1 Time Travelで復元時点を選びます。復元するとその後の対局データが失われるため、事前に対象・時刻・退避方法を確認します。単なるコード障害ではDB全体を復元しません。

## 公開画面と保存データ

仮広告の箱はlocalhost・127.0.0.1・IPv6ループバックだけで表示します。実広告は未接続です。保存期間と外部サービスは設定から開ける`privacy.html`に記載しています。広告サービスを接続するときは案内とCSPの許可先を更新してください。

## 広告接続の進捗

2026年10月2日にGoogle AdSenseアカウントを作成し、本人操作による受取人情報の送信が受け付けられました。無料の`oshogi-games.pages.dev`はサイト追加で受け付けられました。所有確認と審査・H5 Games Adsの申請は未完了です。旧`othello-shogi.oshogi-games.workers.dev`は登録・サイト追加画面の両方でサブドメインとして拒否されました。別URLへの移行ではAI対局のブラウザ保存や友人対局の参加情報が自動では引き継がれないため、旧URLを急に止めないでください。

`index.html`の所有確認メタタグと`/ads.txt`は作成したアカウントの公開Publisher IDを使います。これは審査の準備であり、広告配信の開始・審査通過を意味しません。Googleの広告スクリプトは未追加なので、今は広告通信を行いません。

- 左右のバナー: サイトの承認後に広告ユニットを作成し、十分な横幅がある画面だけで表示します。隠れた広告枠への配信や自動更新は行いません。
- 2勝ごとの広告: 現在の勝利カウンターは維持し、H5 Games Ads承認後に対局間のinterstitialへ接続します。表示の有無や閉じられる時間はGoogle側が決定します。
- 無限オセショ様: 任意のrewarded広告を最後まで見たときだけ次のAI対局で有効にします。広告がない場合や途中で閉じた場合に報酬を渡しません。現在は広告なしの試作のままです。
- 広告導入時はCookie等の説明・同意設定も更新します。AdSenseはnonce方式のCSPを案内しているため、現行CSPを無条件に削除する対応は避けます。広告配信時のCSP変更と通信量は、公式テスト広告で検証してから公開します。

公式資料: [H5 Games Adsの申請](https://developers.google.com/ad-placement/docs/signup)、[AdSenseへ追加できるサイト](https://support.google.com/adsense/answer/12170421)、[AdSenseのCSP](https://support.google.com/adsense/answer/16283098)。

## 公式資料

- [Workersの制限](https://developers.cloudflare.com/workers/platform/limits/)
- [D1の制限](https://developers.cloudflare.com/d1/platform/limits/)
- [D1の料金と無料枠](https://developers.cloudflare.com/d1/platform/pricing/)
- [D1マイグレーション](https://developers.cloudflare.com/d1/reference/migrations/)
- [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
- [WorkerのRollback](https://developers.cloudflare.com/workers/configuration/versions-and-deployments/rollbacks/)
- [Cloudflareの通知](https://developers.cloudflare.com/notifications/notification-available/)
