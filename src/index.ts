// index.ts — Cloudflare Worker (TypeScript)

// 如需在 wrangler.toml 里声明绑定，可在这里补充 Env 类型
export interface Env {
  // DB: D1Database;   // 以后要用 D1 可解开
}

type HeadersLike = Record<string, string>;

function json(body: unknown, status = 200, extra: HeadersLike = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      // 基础 CORS（前端或第三方调用时更省心）
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      ...extra,
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

// 可选：允许代理的目标主机白名单；空集合表示不限制
const ALLOW_HOSTS = new Set<string>([
  // 例如需要时再打开：
  // "api.epicgames.dev",
  // "*.daicygame.com",
]);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") return handleOptions();

    const url = new URL(request.url);
    const { pathname, searchParams } = url;

    // 根路由：健康返回
    if (pathname === "/") {
      return json({ ok: true, message: "Hello from Daicy Cloudflare Worker!" });
    }

    // 健康探针
    if (pathname === "/__health") {
      return new Response("ok", { status: 200, headers: { "access-control-allow-origin": "*" } });
    }

    // 当前时间
    if (pathname === "/time") {
      return json({ now: new Date().toISOString() });
    }

    // ✅ Epic Web Store：验证端点（在 Portal “端点 URL” 填这个路径）
    // 端点示例：https://<你的-worker>.workers.dev/verify
    if (pathname === "/verify" && request.method === "POST") {
      let payload: any = {};
      try {
        payload = await request.json();
      } catch {
        // 即使拿不到 JSON，为了通过验证也返回 200
      }

      // 便于在 Cloudflare Logs 中查看请求
      console.log("Epic WebStore verify payload:", payload);

      // Epic 主要看 200 + JSON 即可
      return json({ ok: true, message: "Webhook verified successfully" }, 200);
    }

    // 简单代理：/proxy?url=https://example.com/path
    if (pathname === "/proxy") {
      const target = searchParams.get("url");
      if (!target) return json({ ok: false, error: "missing url" }, 400);

      try {
        const t = new URL(target);
        if (!/^https?:$/.test(t.protocol)) {
          return json({ ok: false, error: "only http/https allowed" }, 400);
        }

        // 白名单检查（若设置了 ALLOW_HOSTS）
        if (
          ALLOW_HOSTS.size &&
          ![...ALLOW_HOSTS].some((h) =>
            h.startsWith("*.") ? t.hostname.endsWith(h.slice(2)) : t.hostname === h
          )
        ) {
          return json({ ok: false, error: "host not allowed" }, 403);
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
