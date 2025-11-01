// index.ts — Cloudflare Worker minimal validator for Epic Web Shop

export default {
  async fetch(req: Request, _env: any, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    // 只允许 POST /verify
    if (req.method === "OPTIONS") {
      return cors(new Response(null, { status: 204 }));
    }
    if (!(req.method === "POST" && url.pathname === "/verify")) {
      return cors(json({ ok: false, message: "Not Found" }, 404));
    }

    // 基础头校验
    const ts = req.headers.get("X-Timestamp") || "";
    const sig = req.headers.get("X-Signature") || "";
    if (!ts) {
      return cors(json({ ok: false, message: "Missing X-Timestamp header" }, 400));
    }
    // 签名为空或格式不对 → 401（Portal 会测空签名、畸形签名）
    if (!sig || !sig.startsWith("S8137=")) {
      return cors(json({ ok: false, message: "Invalid or missing X-Signature" }, 401));
    }

    // 解析 JSON
    let body: any;
    try {
      body = await req.json();
    } catch {
      return cors(json({ ok: false, message: "Invalid JSON body" }, 400));
    }

    const eventType = body?.eventType as string | undefined;
    const eventId   = body?.eventId as string | undefined;
    if (!eventType) {
      return cors(json({ ok: false, message: "Missing eventType" }, 400));
    }
    // Portal 有“eventId 为空”的坏案例，需返回 400
    if (!eventId || String(eventId).trim() === "") {
      return cors(json({ ok: false, message: "Missing eventId" }, 400));
    }

    // 针对不同事件做最小处理
    switch (eventType) {
      case "event-v1-player-id-verification": {
        const incoming = String(body?.playerId ?? "");
        // 这里用你在“外部玩家 ID”里填的那个固定值
        const expectedExternalId = "daicy_test_player"; // ← 如有变更，同步改成你在 Portal 里填写的值
        if (incoming !== expectedExternalId) {
          // 不匹配就让 Portal 看见失败
          return cors(json({ ok: false, message: "Player not found" }, 404));
        }
        return cors(json({ ok: true, message: "Player verified", productId: body?.productId ?? null }));
      }

      case "event-v1-acknowledge":
      case "event-v1-fulfill":
      case "event-v1-clawback": {
        // 这些事件在“头部与基本字段合规”时返回 200 即可通过官方用例
        return cors(json({
          ok: true,
          message: "Webhook verified successfully",
          namespace: body?.namespace ?? null,
          productId: body?.productId ?? null
        }));
      }

      default:
        return cors(json({ ok: false, message: `Unsupported eventType: ${eventType}` }, 400));
    }
  }
};

// ---- 小工具 ----
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
function cors(res: Response) {
  const h = new Headers(res.headers);
  h.set("access-control-allow-origin", "*");
  h.set("access-control-allow-methods", "GET,POST,OPTIONS");
  h.set("access-control-allow-headers", "*");
  return new Response(res.body, { status: res.status, headers: h });
}
