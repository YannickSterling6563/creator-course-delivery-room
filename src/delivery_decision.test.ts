import assert from "node:assert/strict";
import test from "node:test";
import { decideDeliveryState } from "./realtime_classroom.ts";

test("a processed lesson asset becomes a downloadable subscriber update", () => {
  assert.deepEqual(decideDeliveryState("https://cdn.example.test/lesson-7.pdf"), {
    status: "ready",
    event: "lesson.asset.ready",
    includeDownload: true,
  });
});

test("a lesson without a download remains a processing update", () => {
  assert.deepEqual(decideDeliveryState(), {
    status: "processing",
    event: "lesson.asset.processing",
    includeDownload: false,
  });
});
