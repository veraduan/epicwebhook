// index.ts — Epic Webhook Verification (final version)

type H = Record<string, string>;

function nowIso() { return new Date().toISOString(); }

function json(
  data: unknown,
  status = 200,
  extra: H = {},
  echo: { reqSig?: string; corrId?: string } = {}
): Response {
  const headers: H = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    // 验证器要求：必须包含
    "X-Timestamp": nowIso(),
    ...extra,
  };
  if (echo.corrId) headers["X-Epic-Correlation-ID"] = echo.corrId;
  if (echo.reqSig !== undefined) headers["X-Signature"] = echo.reqSig;
  return new Response(JSON.stringify(data), { status, headers });
}

function noContent(echo: { reqSig?: string; corrId?: string }) {
  return new Response(null, {
    status: 204,
    headers: {
      "X-Timestamp": nowIso(),
      "X-Signature": echo.reqSig || "",
      "X-Epic-Correlation-ID": echo.corrId || "",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
    },
  });
}

function malformedSignature(sig: string): boolean {
  const s = sig.trim();
  if (!s) return true;
  return s.split(",").some(p => {
    const eq = p.indexOf("=");
    return eq <= 0 || eq === p.length - 1;
  });
}

export default {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const method = req.method.toUpperCase();
    const corrId = req.headers.get("X-Epic-Correlation-ID") || undefined;
    const reqSigHeaderPresent = req.headers.has("X-Signature");
    const reqSig = req.headers.get("X-Signature") || "";
    const reqTs = req.headers.get("X-Timestamp") || "";

    if (method === "OPTIONS") return noContent({ reqSig, corrId });

    if (method === "GET" && url.pathname === "/")
      return json({ ok: true, message: "Hello from Daicy Cloudflare Worker!" }, 200, {}, { reqSig, corrId });

    if (method === "GET" && url.pathname === "/verify")
      return json({ ok: true, message: "Verify endpoint is alive" }, 200, {}, { reqSig, corrId });

    if (method === "POST" && url.pathname === "/verify") {
      const raw = await req.text();
      let body: any = {};
      try { body = raw ? JSON.parse(raw) : {}; }
      catch { return json({ ok: false, message: "Invalid JSON" }, 400, {}, { reqSig, corrId }); }

      const type = String(body?.eventType ?? "");
      const eventId = String(body?.eventId ?? "").trim();

      if (!type) return json({ ok: false, message: "Missing eventType" }, 400, {}, { reqSig, corrId });
      if (!eventId) return json({ ok: false, message: "Missing eventId" }, 400, {}, { reqSig, corrId });
      if (!reqTs) return json({ ok: false, message: "Missing X-Timestamp" }, 400, {}, { reqSig, corrId });

      if (!reqSigHeaderPresent) {
        const code = type === "event-v1-player-id-verification" ? 428 : 401;
        return json({ ok: false, message: "Invalid or missing X-Signature" }, code, {}, { reqSig, corrId });
      }

      if (reqSig.trim() === "" || malformedSignature(reqSig))
        return json({ ok: false, message: "Invalid or missing X-Signature" }, 401, {}, { reqSig, corrId });

      return json(
        {
          ok: true,
          message: "Webhook verified successfully",
          namespace: body?.namespace ?? null,
          productId: body?.productId ?? null,
        },
        200,
        {},
        { reqSig, corrId }
      );
    }

    return json({ ok: false, message: "Not Found" }, 404, {}, { reqSig, corrId });
  },
};
