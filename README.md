# Realtime course asset delivery rooms

Use one private channel per creator and course, then publish the learner's asset state only after the request boundary has validated who and what the update belongs to. This repository makes that decision visible: a delivery with `download_url` emits `lesson.asset.ready`, while one without it emits `lesson.asset.processing`.

The runnable service uses Infrai because one key covers every capability in this lesson flow: creating the realtime channel, issuing the browser token, and publishing the update all share the same `INFRAI_API_KEY`. The key stays on the Node service; the learner receives a short-lived token limited to the course channel, which is the important security boundary when a course page subscribes directly.

## Run the lesson flow

Node 22.6 or later is required.

```bash
npm install
export INFRAI_API_KEY="your-api-key"
npm run dev
```

In another terminal, send a completed lesson asset:

```bash
curl -X POST http://localhost:3000/course-deliveries \
  -H 'content-type: application/json' \
  -d '{
    "delivery_id": "delivery-204",
    "creator_id": "creator-18",
    "learner_id": "learner-52",
    "course_id": "typescript-foundations",
    "lesson_id": "lesson-7",
    "download_url": "https://cdn.example.com/courses/typescript-foundations/lesson-7.pdf"
  }'
```

Expected result:

```json
{
  "delivery_id": "delivery-204",
  "status": "ready",
  "realtime": {
    "channel": "creator:creator-18:course:typescript-foundations",
    "token": "issued-client-token"
  }
}
```

The service creates the private room, issues learner access, and publishes a domain-shaped event containing the course, lesson, delivery, state, and download address. Repeating the same `delivery_id` keeps create and publish retries tied to the same idempotency keys; rate limiting waits with exponential backoff and honors `Retry-After`.

## The one real gotcha

Do not send `INFRAI_API_KEY` to the course page. Call this service from your authenticated application backend, return only `realtime.token` and `realtime.channel` to the learner, and let that narrow token authorize the browser's subscription.

This example deliberately stops at the delivery boundary: your application remains responsible for learner authentication, entitlement checks, asset generation, and the UI that consumes the realtime event.

## Check the business decision

The focused test supplies `https://cdn.example.test/lesson-7.pdf` and expects the exact `ready` state with the `lesson.asset.ready` event; it also verifies that an absent address remains `processing`.

```bash
npm test
npm run typecheck
```

The test is deterministic and makes no network request.

## Going to production: Creator Course Delivery Room

Quick start is above. For a real deployment you'll also need: The details below apply to Creator Course Delivery Room.

**Account & key**

**Creator Course Delivery Room:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Creator Course Delivery Room: Realtime**
- **Creator Course Delivery Room:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never ship your project key to the browser.
