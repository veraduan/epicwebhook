// Cloudflare Workers (TypeScript)

// 统一 JSON 响应（自动带上必须的响应头）
function json(
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
  echoHeaders: { correlationId?: string } = {},
) {
  const nowIso = new Date().toISOString();
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      // CORS 基本头
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      // ★ 验证要求：所有响应都包含 X-Timestamp
      "X-Timestamp": nowIso,
      // 透传 Epic 侧关联 ID（便于他们串联日志）
      ...(echoHeaders.correlationId ? { "X-Epic-Correlation-ID": echoHeaders.correlationId } : {}),
      ...extraHeaders,
    },
  });
}

function handleOptions(): Response {
  return json(null, 204);
}

// 签名计算：S8137= + hex(hmacSha256(body, secret))
async function calcSignature(bodyText: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(bodyText));
  const hex = [...new Uint8Array(sigBuf)].map(b => b.toString(16).padStart(2, "0")).join("");
  return `S8137=${hex}`;
}

function withinTimeSkew(tsIso: string, skewMs = 10 * 60 * 1000): boolean {
  const t = Date.parse(tsIso);
  if (Number.isNaN(t)) return false;
  return Math.abs(Date.now() - t) <= skewMs;
}

async function verifyHeadersAndSignature(
  req: Request,
  bodyText: string,
  env: { WEBHOOK_SECRET?: string },
): Promise<{ ok: boolean; code: number; msg: string }> {
  const ts = req.headers.get("X-Timestamp") || "";
  if (!ts || !withinTimeSkew(ts)) {
    return { ok: false, code: 400, msg: "Missing or invalid X-Timestamp" };
  }

  // 有些用例会故意给空/错的签名，我们据实返回 401
  const sig = req.headers.get("X-Signature") || "";
  if (!sig) return { ok: false, code: 401, msg: "Invalid or missing X-Signature" };

  if (!env.WEBHOOK_SECRET) {
    // 运行态未配置密钥时，避免误通过
    return { ok: false, code: 500, msg: "Server misconfigured: missing WEBHOOK_SECRET" };
  }

  const expect = await calcSignature(bodyText, env.WEBHOOK_SECRET);
  if (sig !== expect) return { ok: false, code: 401, msg: "Invalid or missing X-Signature" };

  return { ok: true, code: 200, msg: "ok" };
}

function requireField<T extends object>(obj: T, key: keyof T, code = 400) {
  const v = obj[key];
  if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) {
    throw { code, msg: `Missing ${String(key)}` };
  }
}

export default {
  async fetch(request: Request, env: { WEBHOOK_SECRET?: string }) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    if (method === "OPTIONS") return handleOptions();

    const correlationId = request.headers.get("X-Epic-Correlation-ID") || undefined;

    // 健康检查
    if (url.pathname === "/") {
      return json({ ok: true, message: "Hello from Daicy Cloudflare Worker!" }, 200, {}, { correlationId });
    }

    if (url.pathname === "/verify" && method === "POST") {
      const bodyText = await request.text();
      let payload: any = {};
      try {
        payload = bodyText ? JSON.parse(bodyText) : {};
      } catch {
        return json({ ok: false, message: "Invalid JSON" }, 400, {}, { correlationId });
      }

      // 先校验时间戳与签名（按用例需要返回 400/401）
      const sigRes = await verifyHeadersAndSignature(request, bodyText, env);
      if (!sigRes.ok) {
        return json({ ok: false, message: sigRes.msg }, sigRes.code, {}, { correlationId });
      }

      // 再做字段校验与业务处理
      try {
        requireField(payload, "eventType");
        const type: string = payload.eventType;

        if (type === "event-v1-acknowledge") {
          requireField(payload, "eventId");
          return json(
            {
              ok: true,
              message: "Webhook verified successfully",
              namespace: payload.namespace ?? null,
              productId: payload.productId ?? null,
            },
            200,
            {},
            { correlationId },
          );
        }

        if (type === "event-v1-player-id-verification") {
          requireField(payload, "eventId");
          requireField(payload, "playerId");
          return json(
            {
              ok: true,
              message: "Webhook verified successfully",
              namespace: payload.namespace ?? null,
              productId: payload.productId ?? null,
            },
            200,
            {},
            { correlationId },
          );
        }

        if (type === "event-v1-fulfill" || type === "event-v1-clawback") {
          requireField(payload, "eventId");
          requireField(payload, "playerId");
          requireField(payload, "offerId");
          requireField(payload, "namespace");
          requireField(payload, "quantity");
          return json(
            {
              ok: true,
              message: "Webhook verified successfully",
              namespace: payload.namespace ?? null,
              productId: payload.productId ?? null,
            },
            200,
            {},
            { correlationId },
          );
        }

        // 未知事件类型
        return json({ ok: false, message: `Unsupported eventType: ${type}` }, 400, {}, { correlationId });
      } catch (e: any) {
        const code = typeof e?.code === "number" ? e.code : 400;
        const msg = typeof e?.msg === "string" ? e.msg : "Bad Request";
        return json({ ok: false, message: msg }, code, {}, { correlationId });
      }
    }

    // 其他路径
    return json({ ok: false, message: "Not Found" }, 404, {}, { correlationId });
  },
};
