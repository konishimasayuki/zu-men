# zu-men

農地法5条の許可申請に添付する計画平面図を、縮尺1/250のベクタPDFで出力するWebアプリ。

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
python3 scripts/genCrsFixtures.py   # 座標変換の検証用固定値を PROJ から再生成（要 pyproj）
```

ブラウザで実際に操作して確かめる。地理院への通信は stub する。

```sh
npm run dev
npm i --no-save playwright-core pngjs && node scripts/e2e.mjs
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
