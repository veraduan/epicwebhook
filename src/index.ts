// src/index.ts  —— 零依赖最小 Worker（TypeScript 版）

type HeadersLike = Record<string, string>;
type Env = Record<string, unknown>;

function json<T>(data: T, status = 200, extraHeaders: HeadersLike = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      // 基础 CORS
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      ...extraHeaders,
    },
  });
}

function handleOptions(): Response {
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
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") return handleOptions();

    const url = new URL(request.url);
    const { pathname, searchParams } = url;

    // 1) 根路由
    if (pathname === "/") {
      return json({ ok: true, message: "Hello from Daicy Cloudflare Worker!" });
    }

    // 2) 当前时间
    if (pathname === "/time") {
      return json({ now: new Date().toISOString() });
    }

    // 3) 简单代理：/proxy?url=https://example.com
    if (pathname === "/proxy") {
      const target = searchParams.get("url");
      if (!target) return json({ ok: false, error: "missing url" }, 400);

      try {
        const t = new URL(target);
        if (!/^https?:$/.test(t.protocol)) {
          return json({ ok: false, error: "only http/https allowed" }, 400);
        }

        const resp = await fetch(t.toString(), { method: "GET" });
        const body = await resp.arrayBuffer();

        return new Response(body, {
          status: resp.status,
          headers: {
            "content-type": resp.headers.get("content-type") || "application/octet-stream",
            "access-control-allow-origin": "*",
          },
        });
      } catch (e) {
        return json({ ok: false, error: String(e) }, 500);
      }
    }

    return json({ ok: false, error: "Not Found" }, 404);
  },
};
