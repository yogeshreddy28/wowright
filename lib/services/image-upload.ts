import { CommerceError } from './launch-rules';
export async function validateImage(file: File, maxBytes = 8 * 1024 * 1024) {
  if (!file.size || file.size > maxBytes)
    throw new CommerceError('Choose an image of 8 MB or less.');
  const b = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const jpg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v);
  const webp =
    String.fromCharCode(...b.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...b.slice(8, 12)) === 'WEBP';
  const type = jpg
    ? 'image/jpeg'
    : png
      ? 'image/png'
      : webp
        ? 'image/webp'
        : null;
  if (!type || type !== file.type)
    throw new CommerceError('Use a valid JPG, PNG or WebP image.');
  return type;
}
