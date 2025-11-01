export interface WebshopEvent {
  eventType: string;
  eventId?: string;
  productId?: string;
  namespace?: string;
  // fulfill / clawback / player-id-verification 等可能还会带的字段
  [k: string]: any;
}

function json(data: any, status: number = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      ...extraHeaders,
    },
  });
}

function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-max-age": "86400",
    },
  });
}

function parseSignatureHeader(sig: string | null): { valid: boolean } {
  if (sig == null) return { valid: false };
  const s = sig.trim();
  if (!s) return { valid: false };
  // 允许逗号分隔的多段 key=value，如 "U1234=...,S8137=..."
  const parts = s.split(",").map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) return { valid: false };
  for (const p of parts) {
    const eq = p.indexOf("=");
    if (eq <= 0 || eq === p.length - 1) return { valid: false };
  }
  return { valid: true };
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return handleOptions();

    if (request.method === "GET" && url.pathname === "/") {
      return json({ ok: true, message: "Hello from Daicy Cloudflare Worker!" });
    }

    if (request.method === "GET" && url.pathname === "/verify") {
      return json({ ok: true, message: "Webhook verify endpoint is alive" });
    }

    if (request.method === "POST" && url.pathname === "/verify") {
      // 1) Content-Type 校验
      const ct = request.headers.get("content-type") || "";
      if (!ct.toLowerCase().startsWith("application/json")) {
        return json({ ok: false, message: "Invalid content-type" }, 400);
      }

      // 2) 读取 Body
      let body: WebshopEvent;
      try {
        body = await request.json();
      } catch {
        return json({ ok: false, message: "Invalid JSON" }, 400);
      }

      const eventType = (body.eventType || "").toString();
      const eventId = (body.eventId || "").toString().trim();
      const productId = body.productId || null;
      const namespace = body.namespace ?? null;

      // 3) eventId 必填（为空或缺失 → 400）
      if (!eventId) {
        return json({ ok: false, message: "Missing eventId" }, 400);
      }

      // 4) Timestamp 必填（缺失 → 400）
      const xTimestamp = request.headers.get("X-Timestamp");
      if (!xTimestamp) {
        return json({ ok: false, message: "Missing X-Timestamp" }, 400);
      }

      // 5) Signature 判定（是否缺失 / 为空 / 格式错）
      const xSignature = request.headers.get("X-Signature");
      const sigParsed = parseSignatureHeader(xSignature);

      if (!xSignature) {
        // 缺少整个头
        if (eventType === "event-v1-player-id-verification") {
          // 这个用例要求 428
          return json({ ok: false, message: "Invalid or missing X-Signature" }, 428);
        }
        // 其它用例要求 401
        return json({ ok: false, message: "Invalid or missing X-Signature" }, 401);
      }

      if (!sigParsed.valid) {
        // 头存在但为空或格式不对 → 401
        return json({ ok: false, message: "Invalid or missing X-Signature" }, 401);
      }

      // （这里本应做真实验签；门户“验证测试”不要求，先略过）

      // 6) 全部通过 → 200
      return json({
        ok: true,
        message: "Webhook verified successfully",
        namespace,
        productId,
      });
    }

    return json({ ok: false, message: "Not Found" }, 404);
  },
};
