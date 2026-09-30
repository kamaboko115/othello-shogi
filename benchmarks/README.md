# オセショ様の比較対戦

`osesho-match.mjs` は、新しいオセショ様を毎手使う側と、変更前の「最強」を比較します。画面の「1局1回」だけ使用した人間の勝率を測るものではありません。

## 固定した比較条件

- 変更前の基準: コミット `598f7c6423fabaf75b7ef20352f3edd9e625bf68` の `dist/ai.js` と `dist/engine.js`。`baseline/` に内容を保存しています。
- 両者の思考時間: 1手5秒。「最強」は `expert` を指定。
- 平手、持ち駒あり、60手判定なし、盤面崩壊は150手から。両者が同じ正式ルールの `play()` と `collapseAfterMove()` を使用します。
- 10組、計20局。同じ開始局面について新AIの先手・後手を入れ替えます。
- 1組目は初期配置。残りは固定シードで4手の静かな合法手を生成します。すでに即勝利がある開始局面は作りません。
- 開発用とは別のシード `91373` を最終評価に使用します。結果の悪い局だけの除外や、勝敗判明後の開始局面選別は行いません。
- 4回の同一局面または300手到達は評価上の引き分けです。これはゲーム本体の終局ルールを変更するものではありません。
- 勝率 = 新AIの勝ち数 / 全対局数。引き分けも分母に含めます。目標90%は20局中18勝以上です。
- 時間内に通知された最後の手を使用します。ノード数をそろえる方式ではありません。盤面崩壊の乱数は対戦ごとの固定シードで記録可能にします。

## 実行

Node.js 24以降で、リポジトリのルートから:

```sh
node benchmarks/osesho-match.mjs --ms=5000 --pairs=10 --seed=91373 --out=benchmarks/results/evaluation-01.json
```

中断した場合、同じ条件・同じAIのソースで完了済み対局を残して再開できます:

```sh
node benchmarks/osesho-match.mjs --ms=5000 --pairs=10 --seed=91373 --out=benchmarks/results/evaluation-01.json --resume=yes
```

各局終了後にJSONを保存します。開始局面、先後、勝敗、全着手、反転・崩壊、探索時間・ノード数・完了深さを含みます。比較AIと候補AIのSHA-256も記録します。

候補を変更したら別の結果ファイルを使ってください。失敗した評価も保持し、最終評価に使う局面をあらためて分けます。少数局の勝率はあらゆる局面・端末での勝率保証ではありません。

実測では Ryzen 7 5700X 上で4分割して実行しています。各 `N` を `0`、`1`、`2`、`3` に置き換えて別々のプロセスで起動します。1局の中では両者を順番に実行します。

```sh
node benchmarks/osesho-match.mjs --ms=5000 --pairs=10 --seed=91373 --shards=4 --shard=N --out=benchmarks/results/final-shard-N.json
```

全4プロセスが終了したら集計し、現在のAIと保存された棋譜を照合します。

```sh
node benchmarks/collect-results.mjs benchmarks/results/final-shard-0.json benchmarks/results/final-shard-1.json benchmarks/results/final-shard-2.json benchmarks/results/final-shard-3.json
node benchmarks/verify-results.mjs benchmarks/results/evaluation-combined.json
```

OS間で照合結果が変わらないよう、候補AIの改行形式と比較用原本のバイト列を `.gitattributes` で固定しています。時間制限で探索するため、CPU負荷や実行環境によって同じシードでも対局結果が変わる可能性があります。

## 探索の実装

新AIは `dist/osesho-ai.js` にあります。数値化した盤面を着手ごとに戻しながら探索し、移動先の事前計算、反復深化、置換表、手の順序付け、PVS、遅い静かな手の短縮探索を使用します。静止探索では、通常の王取りに加えて、駒打ちによる王の反転も受けが必要な脅威として扱います。

`tests/osesho-ai.test.js` は正式エンジンと合法手集合・着手結果・巻き戻しを比較し、成り、持ち駒、二歩、複数反転、王反転、60手判定を検証します。
