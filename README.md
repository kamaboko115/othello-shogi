# オセロ将棋

将棋に「挟むと敵駒が味方になる」ルールを加えたWebゲーム。

[ゲームを遊ぶ](https://othello-shogi.oshogi-games.workers.dev/)

## ルール
- 移動・駒打ちの直後、縦横斜め8方向で隙間なく挟んだ敵駒を反転。成りと位置を維持します。
- 王を取る、または挟んで反転すると勝利。王手への対応義務はありません。
- 60手判定を有効にした場合、盤上の駒が多い側が勝利。同数は引き分け。持ち駒は数えません。
- 60手判定の有無と持ち駒使用の可否を開始前に選べます。

- 盤面崩壊は指定手数から、着手ごとに敵味方の盤上の駒からランダムに1枚を破壊。王が壊れた側は負けます。
- 遊べるチュートリアルは各陣営の王が1枚。王取り・王の反転で勝利演出を表示します。崩壊の練習は149手から、各陣営11枚で始まります。

## 機能
AI対局（4段階）、友人との招待リンク対局、振り駒、合意による待った・再試合、木目／深緑の盤テーマ。
全難易度で0.5／1／3／5秒の思考時間に対応し、Web Workerで探索します。

オセショ様はAI対局で使える代打機能です。専用の探索モードで最大5秒考え、王取り・王の反転による即勝利を優先します。相手の次の1手で王を取られる・挟まれる候補を調べ、安全な候補が見つかればそこから先読みします。通常は1局1回、開始前の設定で無限にもできます。通常の対戦AIの4段階とは別のモードです。
探索速度は端末と局面に依存し、安全確認を含む全候補の検討が時間内に終わる保証はありません。盤面崩壊のランダムな駒消失は先読みに含めません。

## 開発環境

### Dockerで開発する（推奨）

Docker Desktop（Linuxコンテナ）とDocker Composeがあれば、PCへのNode.jsインストールは不要です。リポジトリのルートで実行してください。

```sh
docker compose up -d --wait
```

初回はNode.js 24のイメージを取得します。起動後は http://127.0.0.1:4173 を開いてください。このPCからアクセスできます。
ソースはPC上のファイルを共有します。画面のHTML・CSS・JavaScriptの変更はブラウザの再読み込みで反映し、サーバーが読み込むコードの変更はNode.jsのwatch機能で自動再起動します。変更が反映されない場合は `docker compose restart app` を実行してください。

```sh
# 起動中のコンテナでテスト・ビルド
docker compose exec app npm test
docker compose exec app npm run build

# ログの確認
docker compose logs -f app

# 停止・コンテナの削除（対局データは保持）
docker compose down
```

対局データはDockerの名前付きボリューム `runtime` 内の `/app/.sites-runtime/rooms.sqlite` に保存します。PC側の `.sites-runtime/rooms.sqlite` とは別のデータです。`docker compose down -v` は対局データも削除するため、初期化したい場合だけ使用してください。
ビルド結果はコンテナ内の `.sites-runtime/release/dist` と、PC側にも共有される `dist/server/index.js` に生成されます。

### Node.jsを直接使う

Node.js 24以降。外部npmパッケージは不要です。

```sh
node server.mjs
node --test tests/*.test.js
node build.mjs
```

起動後は http://127.0.0.1:4173 を開いてください。ローカル対局データは .sites-runtime/rooms.sqlite に保存されます。
オンライン公開にはAPIと永続DBを動かすホストが必要です。GitHub Pagesだけではオンライン対局は動きません。

## 公開と共同開発

GitHubの `main` をCloudflare Workers Buildsに接続しています。Pull Requestを確認して `main` に取り込むと、Cloudflareがビルドして新しい版を公開します。ビルドコマンドは `npm run build`、デプロイコマンドは `npx wrangler deploy` です。D1データベース `othello-shogi-db` は `DB` に割り当て、初期スキーマは `drizzle/0000_rooms.sql` にあります。設定は `wrangler.jsonc` を参照してください。

変更前に `npm test` と `npm run build` を実行してください。ローカルでは `npm start` で遊べます。既存のChatGPT Sites版は別の公開先で、Cloudflareへ対局データは自動移行しません。

## 著作権
Copyright (c) 2026 kamaboko. All rights reserved.

ソース公開は、利用・改変・再配布を自由に許可するオープンソースライセンスの付与を意味しません。法令・GitHub利用規約等で認められる範囲を除き、利用許諾はkamabokoにお問い合わせください。第三者素材は各提供元のライセンスに従います。

詳しくはLICENSEとTHIRD_PARTY_NOTICES.mdを参照してください。駒を指す音は作者のサイトから再生します。ネット接続がないときは合成音に切り替わります。
