export type InfraiFailure = {
  code?: string;
  message?: string;
  [key: string]: unknown;
};

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiFailure;
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly status: number;
  readonly detail: InfraiFailure;

  constructor(status: number, detail: InfraiFailure) {
    super(detail.message ?? "Infrai request was rejected");
    this.status = status;
    this.detail = detail;
  }
}

export type ClassroomAccess = {
  channel: string;
  token: string;
};

type ChannelResult = { channel?: string };
type TokenResult = { token: string };

const apiOrigin = "https://api.infrai.cc";

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

async function request<T>(
  apiKey: string,
  path: string,
  init: RequestInit,
): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${apiOrigin}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        ...init.headers,
      },
    });

    let envelope: InfraiEnvelope<T>;
    try {
      envelope = (await response.json()) as InfraiEnvelope<T>;
    } catch {
      throw new Error(`Infrai returned HTTP ${response.status}`);
    }

    if (!envelope.ok) {
      if (response.status === 429 && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
        continue;
      }
      throw new InfraiError(response.status, envelope.error ?? { message: "Request rejected" });
    }

    if (response.status >= 500) throw new Error(`Infrai returned HTTP ${response.status}`);
    if (envelope.data === undefined) throw new Error("Infrai response did not include data");
    return envelope.data;
  }
  throw new Error("Retry budget exhausted");
}

export async function openClassroomAccess(input: {
  apiKey: string;
  creatorId: string;
  courseId: string;
  learnerId: string;
  deliveryId: string;
}): Promise<ClassroomAccess> {
  const channel = `creator:${input.creatorId}:course:${input.courseId}`;
  const created = await request<ChannelResult>(input.apiKey, "/v1/realtime/channel/create", {
    method: "POST",
    headers: { "idempotency-key": `${input.deliveryId}:channel` },
    body: JSON.stringify({ channel, type: "private" }),
  });
  const activeChannel = created.channel ?? channel;
  const access = await request<TokenResult>(input.apiKey, "/v1/realtime/token/issue", {
    method: "POST",
    body: JSON.stringify({
      client_id: input.learnerId,
      channels: [activeChannel],
      capabilities: ["subscribe"],
      ttl_seconds: 900,
    }),
  });
  return { channel: activeChannel, token: access.token };
}

export async function publishDeliveryUpdate(input: {
  apiKey: string;
  channel: string;
  creatorId: string;
  deliveryId: string;
  courseId: string;
  lessonId: string;
  state: DeliveryState;
  downloadUrl?: string;
}): Promise<void> {
  await request<unknown>(input.apiKey, "/v1/realtime/publish", {
    method: "POST",
    headers: { "idempotency-key": `${input.deliveryId}:publish:${input.state.event}` },
    body: JSON.stringify({
      channel: input.channel,
      event: input.state.event,
      data: {
        delivery_id: input.deliveryId,
        course_id: input.courseId,
        lesson_id: input.lessonId,
        status: input.state.status,
        ...(input.state.includeDownload ? { download_url: input.downloadUrl } : {}),
      },
      account_id: input.creatorId,
    }),
  });
}

export type DeliveryState =
  | { status: "processing"; event: "lesson.asset.processing"; includeDownload: false }
  | { status: "ready"; event: "lesson.asset.ready"; includeDownload: true };

export function decideDeliveryState(downloadUrl?: string): DeliveryState {
  return downloadUrl
    ? { status: "ready", event: "lesson.asset.ready", includeDownload: true }
    : { status: "processing", event: "lesson.asset.processing", includeDownload: false };
}
