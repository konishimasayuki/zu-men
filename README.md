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

- `計画平面図_第0段階.pdf` — 20m正方形1つだけの図面
- `縮尺検証シート.pdf` — 100mm・200mm・80mmの基準線

## 印刷するときの注意

プリンタ設定は必ず「実際のサイズ（100%）」にすること。
「用紙に合わせる」を選ぶと数％縮んで縮尺が狂う。

## フォント

`public/fonts/ipaexg.ttf` は IPAexゴシック（IPAフォントライセンス v1.0）。
ライセンス全文を同ディレクトリに同梱している。
