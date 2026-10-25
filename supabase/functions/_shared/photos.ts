export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
export function photoType(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > MAX_PHOTO_BYTES)
    throw Error("Choose a photo smaller than 4 MB.");
  if (
    bytes.length >= 24 &&
    bytes[0] === 137 &&
    bytes[1] === 80 &&
    bytes[2] === 78 &&
    bytes[3] === 71 &&
    bytes[4] === 13 &&
    bytes[5] === 10 &&
    bytes[6] === 26 &&
    bytes[7] === 10
  ) {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const w = v.getUint32(16),
      h = v.getUint32(20);
    if (!w || !h || w * h > 25000000)
      throw Error("Choose a photo smaller than 25 megapixels.");
    return "image/png";
  }
  if (
    bytes.length > 3 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255
  )
    return "image/jpeg";
  if (
    bytes.length >= 16 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  )
    return "image/webp";
  throw Error(
    "Use a JPEG, PNG or WebP photo. SVG and other files are not supported.",
  );
}
export function canViewPhoto(group: any, user: string, photo: any) {
  if (!group.people.some((p: any) => p.id === user && !p.disabled))
    return false;
  if (!photo.event) return true;
  return group.events.some(
    (e: any) => e.id === photo.event && e.person !== user,
  );
}
