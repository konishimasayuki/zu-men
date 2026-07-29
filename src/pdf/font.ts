/**
 * 日本語フォントの埋め込み。
 *
 * pdf-lib の標準フォント（StandardFonts）に日本語は無い。所有者名に任意の漢字が
 * 来るため、ビルド時に字形を絞り込むことができない。フォント実体を丸ごと同梱し、
 * 実行時に @pdf-lib/fontkit でサブセット化する。
 *
 * フォントは IPAexゴシック（IPAフォントライセンス v1.0、埋め込み・再配布可）。
 * 実体は public/fonts/ipaexg.ttf、ライセンス全文は同ディレクトリに同梱。
 */

import { PDFDocument, PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

export const FONT_URL = '/fonts/ipaexg.ttf';

/**
 * フォントを埋め込む。subset: true が効いていないと出力が6MB級になるので、
 * 呼び出し側は生成後のサイズを目視すること。
 */
export async function embedJapaneseFont(doc: PDFDocument, fontBytes: Uint8Array | ArrayBuffer): Promise<PDFFont> {
  doc.registerFontkit(fontkit);
  return doc.embedFont(fontBytes, { subset: true });
}

/** ブラウザ用。public/ から実体を取得する。 */
export async function loadFontBytesFromNetwork(url = FONT_URL): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`フォントを取得できません: ${url} (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}
