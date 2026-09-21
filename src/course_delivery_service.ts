import { createServer, type ServerResponse } from "node:http";
import { z } from "zod";
import {
  decideDeliveryState,
  InfraiError,
  openClassroomAccess,
  publishDeliveryUpdate,
} from "./realtime_classroom.ts";

const deliveryRequest = z.object({
  delivery_id: z.string().min(1),
  creator_id: z.string().min(1),
  learner_id: z.string().min(1),
  course_id: z.string().min(1),
  lesson_id: z.string().min(1),
  download_url: z.string().url().optional(),
}).strict();

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: AsyncIterable<Uint8Array>): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/course-deliveries") {
    json(response, 404, { error: "Route not found" });
    return;
  }

  try {
    const input = deliveryRequest.parse(await readJson(request));
    const state = decideDeliveryState(input.download_url);
    const access = await openClassroomAccess({
      apiKey,
      creatorId: input.creator_id,
      courseId: input.course_id,
      learnerId: input.learner_id,
      deliveryId: input.delivery_id,
    });
    await publishDeliveryUpdate({
      apiKey,
      channel: access.channel,
      creatorId: input.creator_id,
      deliveryId: input.delivery_id,
      courseId: input.course_id,
      lessonId: input.lesson_id,
      state,
      downloadUrl: input.download_url,
    });
    json(response, 201, {
      delivery_id: input.delivery_id,
      status: state.status,
      realtime: access,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      json(response, 400, { error: "Invalid delivery request", issues: error.issues });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      json(response, status, { error: error.message, detail: error.detail });
      return;
    }
    json(response, 502, { error: error instanceof Error ? error.message : "Request failed" });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Course delivery service listening on http://localhost:${port}`));
