// index.ts — Worker 验证加强版（支持 GET/POST & challenge 回显）

export interface Env {}

type H = Record<string, string>;

function json(body: unknown, status = 200, extra: H = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      ...extra,
    },
  });
}

function noContent(): Response {
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

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const { pathname, searchParams } = url;

    if (req.method === "OPTIONS") return noContent();

    // 主页 & 健康
    if (pathname === "/") return json({ ok: true, message: "Hello from Daicy Cloudflare Worker!" });
    if (pathname === "/__health") return new Response("ok", { headers: { "access-control-allow-origin": "*" }});

    // ✅ Epic Web Store 验证端点：允许 GET / POST，尽量兼容
    if (pathname === "/verify") {
      let body: any = {};
      if (req.method === "POST") {
        try { body = await req.json(); } catch {}
      }

      // 兼容各种可能的 challenge 字段名
      const challenge =
        body?.challenge ??
        body?.verificationToken ??
        body?.token ??
        searchParams.get("challenge") ??
        searchParams.get("verificationToken") ??
        searchParams.get("token") ??
        null;

      // 打印到日志便于排查（Cloudflare 控制台 → Logs）
      console.log("Epic verify hit:", {
        method: req.method,
        query: Object.fromEntries(searchParams.entries()),
        body,
      });

      const resp: Record<string, unknown> = {
        ok: true,
        message: "Webhook verified successfully",
      };
      if (challenge) resp.challenge = challenge;

      // 可选：把这三个字段原样回显，部分平台会检查
      if (body?.namespace) resp.namespace = body.namespace;
      if (body?.productId) resp.productId = body.productId;
      if (body?.externalPlayerId) resp.externalPlayerId = body.externalPlayerId;

      return json(resp, 200);
    }

    // 演示时间接口
    if (pathname === "/time") return json({ now: new Date().toISOString() });

    return json({ ok: false, error: "Not Found" }, 404);
  },
};
