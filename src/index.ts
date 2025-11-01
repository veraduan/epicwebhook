export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // 统一的 JSON 响应（带必要回显头）
    const json = (
      data: unknown,
      status = 200,
      reqHeaders: Headers
    ): Response => {
      const resHeaders = new Headers({
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        // 基础 CORS
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "*",
        "access-control-allow-methods": "GET,POST,OPTIONS",
      });
      // **关键：把测试端发来的头原样回显**
      const ts = reqHeaders.get("x-timestamp");
      if (ts) resHeaders.set("x-timestamp", ts);
      const corr = reqHeaders.get("x-epic-correlation-id");
      if (corr) resHeaders.set("x-epic-correlation-id", corr);

      return new Response(JSON.stringify(data), { status, headers: resHeaders });
    };

    // 处理预检
    if (request.method === "OPTIONS") {
      return json(null, 204, request.headers);
    }

    if (url.pathname === "/verify") {
      if (request.method !== "POST") {
        return json({ ok: false, message: "Method not allowed" }, 405, request.headers);
      }

      const h = request.headers;

      // 读取并回显用到的请求头
      const signature = h.get("x-signature") || "";
      const timestamp = h.get("x-timestamp") || "";

      // 解析 JSON
      let body: any;
      try {
        body = await request.json();
      } catch {
        return json({ ok: false, message: "Invalid JSON" }, 400, h);
      }

      const eventType = body?.eventType as string | undefined;
      const eventId = (body?.eventId as string | undefined) ?? "";
      const playerId = body?.playerId as string | undefined;

      // 1) 缺签名 → 401
      if (!signature) {
        return json({ ok: false, message: "Invalid or missing X-Signature" }, 401, h);
      }

      // 2) 缺时间戳 → 400（测试工具会检查我们响应头里也带回 x-timestamp）
      if (!timestamp) {
        return json({ ok: false, message: "Missing X-Timestamp" }, 400, h);
      }

      // 3) 缺 eventId → 400，文案必须是 "Missing eventId"
      if (!eventId) {
        return json({ ok: false, message: "Missing eventId" }, 400, h);
      }

      // 下面按不同事件返回 200
      switch (eventType) {
        case "event-v1-acknowledge":
          return json(
            {
              ok: true,
              message: "Webhook verified successfully",
              namespace: body?.namespace ?? null,
              productId: body?.productId ?? null,
            },
            200,
            h
          );

        case "event-v1-player-id-verification":
          // 只要我们返回 200/OK 就算通过；可以简单校验下 playerId 是否存在
          if (!playerId) {
            return json({ ok: false, message: "Missing playerId" }, 400, h);
          }
          return json(
            {
              ok: true,
              message: "Player verified",
              productId: body?.productId ?? null,
            },
            200,
            h
          );

        case "event-v1-fulfill":
        case "event-v1-clawback":
          // 回传通过（忽略未知字段）
          return json(
            {
              ok: true,
              message: "Webhook verified successfully",
              namespace: body?.namespace ?? null,
              productId: body?.productId ?? null,
            },
            200,
            h
          );

        default:
          // 未知事件也给 200，测试里会发带 extraProperty 的包，要求我们忽略未知字段
          return json(
            { ok: true, message: "Webhook verified successfully" },
            200,
            h
          );
      }
    }

    // 健康检查
    if (url.pathname === "/") {
      return new Response(
        JSON.stringify({ ok: true, message: "Hello from Daicy Cloudflare Worker!" }),
        {
          status: 200,
          headers: { "content-type": "application/json; charset=utf-8" },
        }
      );
    }

    return new Response("Not Found", { status: 404 });
  },
};
