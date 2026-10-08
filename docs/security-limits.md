# APIの連打対策とCloudflare設定

2026年10月5日にコードとCloudflare公式資料を確認しました。本番アカウントのWAF設定・契約プラン・実際のバインディング配置は、この変更では確認・変更していません。

## アプリで使う制限

|バインディング|対象|上限|キー|
|---|---|---|---|
|`API_REQUEST_BURST`|DBアクセス前のAPI通信（匿名の勝利数取得も含む）|600回/60秒|信頼できる接続元IPのSHA-256|
|`ROOM_ACTION_BURST`|参加権限を確認済みの対局操作POST|60回/60秒|参加トークンのSHA-256|
|`ROOM_CREATE_BURST`|新規友人部屋作成・勝利報告（それぞれ別キー）|5回/60秒|接続元IPのSHA-256|

友人部屋には従来どおりD1で100部屋/12時間の作成枠もあります。新しい2種類の制限はCloudflareのネイティブカウンターを使い、判定用のD1読み書きを追加しません。拒否時はJSONのHTTP 429と`Retry-After: 60`を返します。公開Workerで必要なバインディングや接続元IPがない場合、およびカウンターの障害時は503で拒否します。

IPは公開Workerの`CF-Connecting-IP`、ローカルサーバーの接続元ソケットから取得します。`X-Forwarded-For`を信用しません。生IPと生参加トークンはカウンターキーに使わず、DBにも追加保存しません。IPのハッシュは匿名化を保証するものではありません。

同じWi-Fiや携帯回線の利用者はIP枠を共有するため、入口の枠は広くしています。通常の2秒ポーリングは1画面あたり約30回/分です。操作は参加者別の枠にし、相手が連打しても自分の操作枠を消費しないようにします。ただし同じIPを共有する場合は入口の枠に影響します。共有回線で429が多い場合は、観測した利用状況に合わせてIP枠を調整してください。ローカルの`server.mjs`も同じ値のメモリ内カウンターを使います。

同一提案の再送を無視するだけでは、引き分け提案と取消を交互に送るDB書き込みを防げません。参加者の操作枠はその交互変更も数えます。未知の部屋IDや使い捨てトークンによる照会、認証不要の勝利数取得にも入口のIP枠が適用されます。

## Cloudflareへ反映する順序

1. `wrangler.jsonc`の`ratelimits`をコードと同じ変更で管理します。新namespace ID `731904116`と`731904117`がアカウント内の別用途と重複していないことを公開前に確認します。同一namespaceはカウンターを共有します。
2. テストとローカル確認後、通常のGitHub公開手順でWorkerのコードとバインディングを一緒に公開します。バインディングを含めずに新コードだけ反映するとAPIが503になります。別環境へ公開するときも両方を設定してください。
3. Pagesの`GAME_API`は同じWorkerを呼ぶため、`pages/wrangler.jsonc`にD1や同名カウンターを重複追加する必要はありません。旧Workers URLへの直接アクセスにも同じWorker内の制限がかかります。
4. Workerの429・503の発生数とD1使用量を確認します。トークン・招待URL・生IPを独自ログへ出さず、HTTPステータスなど集計情報を使います。

Rate Limiting bindingは現時点ではCloudflareダッシュボードに表示されないため、Wrangler設定を正とします。カウンターは拠点ごとの概算で、同時リクエストの反映には遅れがあります。**厳密な全世界共通の回数制限や、請求額・日次無料枠の上限を保証する仕組みではありません。** 分散した接続元による攻撃も残ります。判定のためにWorkerは実行されるので、Worker呼び出し枠そのものの枯渇は防げません。[Workers Rate Limiting公式資料](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)

## Cloudflare側で追加できる対策

所有するCloudflare zoneのカスタムドメインでは、WAFのRate limiting rulesで`/api/`を対象にIP別の入口制限を設定できます。Security rulesからルールを作り、通常の共有回線のポーリングを遮断しない値で運用します。Freeの基本ルールは1件で、期間・条件・応答形式の選択肢はプランに依存します。JSON APIに対する対話型チャレンジはクライアントの通信処理を壊し得るため、適用する場合はBlock/429の応答を含めて検証します。[WAFの提供範囲](https://developers.cloudflare.com/waf/)、[ルール作成](https://developers.cloudflare.com/waf/rate-limiting-rules/create-zone-dashboard/)、[設定項目](https://developers.cloudflare.com/waf/rate-limiting-rules/parameters/)

このリポジトリの公開先は`oshogi-games.pages.dev`と`othello-shogi.oshogi-games.workers.dev`で、カスタムドメインのzone設定はありません。そのため、このリポジトリだけから「ドメイン用WAFルールを設定済み」とは判断できません。現構成の両入口に適用できるネイティブbindingを基本対策にしています。カスタムドメインのWAFを追加しても、旧公開URLを迂回入口として残す場合はWorker内の制限を維持してください。[Workerのルーティング](https://developers.cloudflare.com/workers/configuration/routing/)

勝利数は引き続きブラウザの自己申告です。形式検証・重複排除・送信回数制限は行いますが、実際にAIに勝ったことを証明する仕組みではありません。公式記録や賞品配布などへ使う場合は別の検証方式が必要です。


## 2026-10-08: victory reports and hourly recovery points

- Victory reports now require a compact move list and final board. The server checks their shape, lengths, board coordinates, helper-count ceiling, ply count, and terminal king ownership. It does **not** replay every legal move, reproduce randomness, or rerun AI. Deliberately fabricated but plausible histories can still pass. This is the user's chosen low-cost protection, not an authenticated leaderboard.
- Proofs are at most 96 KiB / 1,000 moves. Other API request bodies remain limited to 4 KiB. The native report limiter runs before reading the proof; API IP limits also apply. Identical normalized move lists cannot increment the count under a new match ID. All insertions are transactional; neither retries nor concurrent duplicates consume another ordinal.
- Games started before move-list recording was added cannot submit this evidence. Existing counted wins are retained. A rejected report keeps the win screen and a generic X share link, without inventing an ordinal. No per-move networking or AI-server computation was added.
- IP budgets use IPv6 /64 prefixes (IPv4-mapped IPv6 uses the IPv4 bucket). Shared networks can share a budget. Different networks and distributed attackers can still bypass per-network limits.
- The legacy Workers site stays available for saved games. Its static requests now use the native IP limiter, reject unsupported methods, and skip binary decoding on HEAD or rejected ranges. **An HTTP 429 still consumes a Worker invocation**; these changes do not guarantee protection from volumetric DDoS or request-quota exhaustion. Pages static delivery remains unchanged.
- Unknown room routes are rejected before D1 room reads. Unauthorized users and over-budget participants cannot trigger history decompression.

### Hourly backup activation and verification

Deploy in this order: apply D1 migration `0003_challenge_backups.sql`, deploy the Worker built from this revision (including the hourly Cron), then publish the matching Pages assets. A frontend-only Pages deployment does not activate the backup or API changes.

The migration records an initial counter snapshot. Cron `0 * * * *` records `total`, `last_ordinal`, and actual capture time every hour; repeat invocations within that hour cannot overwrite it. Keep 90 days of snapshots. The existing five-minute room-cleanup Cron is unchanged. There is no automatic rollback and no browser polling for backups.

Verify remotely with:

```sh
npx wrangler d1 execute othello-shogi-db --remote --command "SELECT datetime(created/1000,'unixepoch') AS captured_utc,total,last_ordinal FROM challenge_win_backups ORDER BY hour DESC LIMIT 3"
```

These are counter recovery points **inside the same D1 database**, not independent full-database exports. Individual victory rows and proof fingerprints are retained. For accidental database loss, use the platform's D1 recovery/export facilities separately. Never promise that an hourly count alone recovers deleted match records.

### Manual recovery

First export the current D1 database and identify a trusted snapshot. Inspect the victory rows after that snapshot (`ordinal > last_ordinal`) and decide whether the rise is actually abusive. Keep an archived copy before removing any records. Remove associated proof fingerprints together with confirmed fraudulent victory rows, in one transaction, then compare `COUNT(*)` to the intended restored total. Already displayed/shared ordinal numbers cannot be recalled. Browser lobby counts may remain cached for up to 30 minutes. Do not restore the entire live database just to change this counter: it also contains active friend matches.

### Measurements (local Node, not Cloudflare billing measurements)

Two fixtures: 60 plies / about 3.6 KiB evidence, 206 plies / about 11.7 KiB evidence. Across 100 runs, lightweight validator median about 0.01 ms, p95 below 0.05 ms. These exclude JSON parsing, hashing, network, and D1. The abandoned full replay check took about 2.7 ms and 17 ms respectively; it is not deployed. No production load/flood test was performed.
