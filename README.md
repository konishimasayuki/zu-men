# zu-men

**住所を検索し、地図でピンをずらして指定した場所の計画平面図を、縮尺1/250のベクタPDFで出す。**

農地法5条の許可申請に添付する計画平面図を作るWebアプリ。

## 使う流れ

1. 住所を検索する
2. 地図をクリックしてピンを対象地に合わせる
3. 系番号を確認する（間違えると座標が数十kmずれる）
4. 坪数・向き・地番を決める
5. 「この場所の計画平面図PDFを出力」

開発方針は [CLAUDE.md](./CLAUDE.md)、進捗は [PLAN.md](./PLAN.md)、
確定した事実は [NOTES.md](./NOTES.md) を参照。

## 使い方

```sh
npm install
npm run dev      # 開発サーバ
npm test         # 検収基準の自動検証
npm run build    # 型検査とビルド
```

PDFをファイルに書き出して実測値を表示する。

```sh
npx vite-node scripts/emit.ts
```

`out/` に2つのPDFが出る。

- `計画平面図_第0段階_A4.pdf` — 20m正方形1つだけの図面
- `縮尺検証シート_A4.pdf` — 100mm・200mm・80mmの基準線

検証用スクリプト。

```sh
npx vite-node scripts/calcheck.ts   # 印刷補正の効きを実測
npx vite-node scripts/crscheck.ts   # proj4js と PROJ の一致度を実測
npx vite-node scripts/gsicheck.ts   # 地理院の住所検索APIを実データで確認
npx vite-node scripts/renderPlan.ts # 参考図面の再現を out/ に出力
npx vite-node scripts/compare.ts    # 参考図面との記載要素の突合表（検収基準6）
npx vite-node scripts/renderSamples.ts  # 対象地の規模（90坪・143坪）でA4・1/250を出力
npx vite-node scripts/marginCheck.ts    # 縮尺・用紙ごとに描ける周辺の広さを実測
python3 scripts/genCrsFixtures.py   # 座標変換の検証用固定値を PROJ から再生成（要 pyproj）
```

ブラウザで実際に操作して確かめる。地理院への通信は stub する。

```sh
npm run dev
npm i --no-save playwright-core pngjs && node scripts/e2e.mjs      # 住所検索と地図
E2E_PORT=5178 node scripts/e2ePlan.mjs                             # 住所→ピン→PDF の動線
```

## 印刷するときの注意

プリンタ設定は必ず「実際のサイズ（100%）」にすること。既定の用紙はA4横。
「用紙に合わせる」を選ぶと数％縮んで縮尺が狂う。

## 印刷補正

「実際のサイズ（100%）」にしても機種によっては数％伸縮する。
縮尺検証シートの200mm線を定規で測り、画面の「印刷補正」に実測値を入れると
倍率を計算して補正する。設定はブラウザに保存される。

補正を有効にしたPDFは**データとしては1/250ではなくなる**。そのプリンタで
紙に出したときに1/250になる。PDFをそのまま電子提出する場合は補正を無効にすること。

許容範囲は±5%。これを超える食い違いは設定ミスなので受け付けない。

## フォント

`public/fonts/ipaexg.ttf` は IPAexゴシック（IPAフォントライセンス v1.0）。
ライセンス全文を同ディレクトリに同梱している。
