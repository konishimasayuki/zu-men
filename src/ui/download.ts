/**
 * 生成したPDFをダウンロードさせる。
 *
 * アンカーを一度DOMに入れてからclickする。入れずにclickすると、
 * ブラウザによっては download 属性が無視され、ファイル名が「download」になる。
 */
export function downloadBytes(bytes: Uint8Array, filename: string, mime = 'application/pdf'): void {
  const blob = new Blob([bytes as unknown as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // クリック直後に revoke すると保存前に切れることがあるので少し待つ
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
