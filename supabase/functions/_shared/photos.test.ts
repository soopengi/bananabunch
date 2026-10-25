import { test } from "node:test";
import assert from "node:assert/strict";
import { photoType, canViewPhoto, MAX_PHOTO_BYTES } from "./photos.ts";
test("uploads reject script-like files, unsupported content and oversized files", () => {
  assert.throws(() =>
    photoType(new TextEncoder().encode("<svg onload='alert(1)'></svg>")),
  );
  assert.throws(() => photoType(new Uint8Array(MAX_PHOTO_BYTES + 1)));
  assert.equal(photoType(new Uint8Array([255, 216, 255, 224])), "image/jpeg");
  const p = new Uint8Array(24);
  p.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const v = new DataView(p.buffer);
  v.setUint32(16, 100);
  v.setUint32(20, 100);
  assert.equal(photoType(p), "image/png");
  v.setUint32(16, 100000);
  v.setUint32(20, 100000);
  assert.throws(() => photoType(p));
});
test("event images remain inaccessible to the birthday owner, including administrators", () => {
  const group = {
    people: [
      { id: "birthday", admin: true },
      { id: "friend" },
      { id: "inactive", disabled: true },
    ],
    events: [{ id: "event", person: "birthday" }],
  };
  assert.equal(canViewPhoto(group, "birthday", { event: "event" }), false);
  assert.equal(canViewPhoto(group, "friend", { event: "event" }), true);
  assert.equal(canViewPhoto(group, "outsider", { event: "event" }), false);
  assert.equal(canViewPhoto(group, "inactive", { event: null }), false);
  assert.equal(canViewPhoto(group, "friend", { event: null }), true);
});
