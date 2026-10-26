// Run with: npx tsx --test src/lib/maps.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { coordinatesFromMapUrl, isShortMapUrl } from "./maps";

test("prefers the place pin over the view centre", () => {
  assert.deepEqual(
    coordinatesFromMapUrl(
      "https://www.google.com/maps/place/CU/@13.7300,100.5200,17z/data=!3m1!4b1!4m6!3m5!8m2!3d13.7383!4d100.5322",
    ),
    { latitude: 13.7383, longitude: 100.5322 },
  );
});

test("reads @lat,lng and coordinate queries", () => {
  assert.deepEqual(
    coordinatesFromMapUrl("https://www.google.com/maps/@13.91,100.53,15z"),
    { latitude: 13.91, longitude: 100.53 },
  );
  assert.deepEqual(
    coordinatesFromMapUrl("https://maps.google.com/?q=13.91%2C100.53"),
    { latitude: 13.91, longitude: 100.53 },
  );
});

test("returns null for names, short links and nonsense", () => {
  assert.equal(coordinatesFromMapUrl("https://maps.google.com/?q=PIM"), null);
  assert.equal(coordinatesFromMapUrl("https://maps.app.goo.gl/abc123"), null);
  assert.equal(
    coordinatesFromMapUrl("https://www.google.com/maps/@95.1,100.5,15z"),
    null,
  );
  assert.equal(coordinatesFromMapUrl("not a url"), null);
});

test("spots short share links", () => {
  assert.equal(isShortMapUrl("https://maps.app.goo.gl/abc123"), true);
  assert.equal(isShortMapUrl("https://maps.app.goo.gl/"), false);
  assert.equal(isShortMapUrl("http://maps.app.goo.gl/abc123"), false);
  assert.equal(isShortMapUrl("https://www.google.com/maps/@1,2,3z"), false);
});
