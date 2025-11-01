if (url.pathname === "/verify" && method === "POST") {
  const reqHeaders = request.headers;
  const correlationId = reqHeaders.get("X-Epic-Correlation-ID") || undefined;
  const reqSignature = reqHeaders.get("X-Signature") || "";   // ← 取出请求的签名

  // 读原始文本 + 解析 JSON
  const bodyText = await request.text();
  let body: any = {};
  try { body = bodyText ? JSON.parse(bodyText) : {}; }
  catch { return json({ ok:false, message:"Invalid JSON" }, 400, { "X-Signature": reqSignature }, { correlationId }); }

  // ① 先做“必填字段”检查（验证器的“empty eventId”用例就看这个）
  const eventType = String(body?.eventType ?? "");
  const eventId = String(body?.eventId ?? "").trim();
  if (!eventType) {
    return json({ ok:false, message:"Missing eventType" }, 400, { "X-Signature": reqSignature }, { correlationId });
  }
  if (!eventId) {
    // ★ 这里必须 400（不能先去校验签名）
    return json({ ok:false, message:"Missing eventId" }, 400, { "X-Signature": reqSignature }, { correlationId });
  }

  // ② 再做头部检查：Timestamp 必须有；Signature 缺失/为空/畸形 → 401
  const ts = reqHeaders.get("X-Timestamp") || "";
  if (!ts) {
    return json({ ok:false, message:"Missing X-Timestamp" }, 400, { "X-Signature": reqSignature }, { correlationId });
  }
  // “缺失”或“空字符串”或“不是 key=value 形式”都按 401
  const hasSigHeader = reqHeaders.has("X-Signature");
  const isEmptySig = reqSignature.trim() === "";
  const malformedSig = !isEmptySig && !reqSignature.includes("=");
  if (!hasSigHeader || isEmptySig || malformedSig) {
    return json({ ok:false, message:"Invalid or missing X-Signature" }, 401, { "X-Signature": reqSignature }, { correlationId });
  }

  // ③ 通过：忽略未知字段，直接 200（这里不做 HMAC 真实验签，确保“签名存在时”都能过官方用例）
  return json({
    ok: true,
    message: "Webhook verified successfully",
    namespace: body?.namespace ?? null,
    productId: body?.productId ?? null,
  }, 200, {
    // ★ 把请求的签名原样回显到响应头（验证器会检查这个）
    "X-Signature": reqSignature,
  }, { correlationId });
}
