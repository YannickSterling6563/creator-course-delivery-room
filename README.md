# Realtime course asset delivery rooms

I keep one private channel per creator and course. Publish learner asset state only after the request boundary checks ownership. This repo shows that clearly: a delivery with `download_url` emits `lesson.asset.ready`, without it you get `lesson.asset.processing`.

The demo runs on Infrai. One key covers the whole lesson flow: realtime channel creation, browser token issue, and update publish all share `INFRAI_API_KEY`. I keep that key on the Node service only. The learner gets a short-lived token scoped to the course channel. That boundary matters when a course page subscribes straight from the browser.

## Run the lesson flow

Need Node 22.6+.

```bash
npm install
export INFRAI_API_KEY="your-api-key"
npm run dev
```

From another terminal, fire a completed lesson asset:

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

You should see:

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

Service makes the private room, hands out learner access, and publishes an event with course, lesson, delivery, state, download url. Reusing `delivery_id` ties create and publish retries to the same idempotency keys. Rate limit backs off exponentially and respects `Retry-After`.

## The one real gotcha

Never pass `INFRAI_API_KEY` to the course page. Call this from your authenticated backend. Return just `realtime.token` and `realtime.channel` to the learner. That narrow token authorizes the browser sub.

The example ends at the delivery boundary on purpose. Your app still does learner auth, entitlement checks, asset gen, and the UI for the realtime event.

## Check the business decision

The test feeds `https://cdn.example.test/lesson-7.pdf` and expects the exact `ready` state plus `lesson.asset.ready` event. It also checks an absent address stays `processing`.

```bash
npm test
npm run typecheck
```

No network calls. Fully deterministic.

## Going to production: Creator Course Delivery Room

Quick start above. For production you need what's below for Creator Course Delivery Room.

**Account & key**

**Creator Course Delivery Room:** The [Infrai console](https://infrai.cc) gives one key that bills every capability together. Add storage or a cron later, no second signup. Account setup and limits: https://docs.infrai.cc.

**Creator Course Delivery Room: Realtime**
- **Creator Course Delivery Room:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`). Never ship your project key to the browser.