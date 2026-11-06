// アバター画像 → 3Dモデル（GLB）の中継。3D化は数十秒〜数分かかるので fal.ai のキュー方式を使う。
//   POST {action:"submit", imageUrl, model}  -> {statusUrl, responseUrl}
//   POST {action:"check", statusUrl, responseUrl} -> {done:false, status} | {done:true, glb}

const MODELS = {
  tripo: {
    endpoint: "tripo3d/tripo/v2.5/image-to-3d",
    args: (url) => ({ image_url: url, texture: "standard", face_limit: 30000, orientation: "align_image" }),
    pick: (d) => d && d.model_mesh && d.model_mesh.url,
  },
  trellis: {
    endpoint: "fal-ai/trellis-2",
    args: (url) => ({ image_url: url, resolution: "512", texture_size: "1024", decimation_target: 50000 }),
    pick: (d) => d && d.model_glb && d.model_glb.url,
  },
};

const QUEUE = "https://queue.fal.run/";

function falError(status, text) {
  let detail = text.slice(0, 300);
  try { const d = JSON.parse(text); if (d.detail) detail = typeof d.detail === "string" ? d.detail : JSON.stringify(d.detail); } catch (e) {}
  if (status === 401 || status === 403) return "fal.ai のキーが正しくありません。Vercelの FAL_KEY を確認してください";
  if (status === 402 || /balance|credit|billing|exhausted/i.test(detail)) return "fal.ai のクレジットが足りません。Billing で追加してください";
  return `3D化に失敗しました（${status}）: ${detail}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POSTのみ受け付けます" });
  const { FAL_KEY, ACCESS_CODE } = process.env;
  if (!FAL_KEY || !ACCESS_CODE) return res.status(500).json({ error: "サーバーの設定が足りません（FAL_KEY と ACCESS_CODE）" });
  if (req.headers["x-access-code"] !== ACCESS_CODE) return res.status(401).json({ error: "合言葉が違います" });

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const auth = { Authorization: "Key " + FAL_KEY };

  try {
    if (body.action === "submit") {
      const m = MODELS[body.model];
      if (!m) return res.status(400).json({ error: "知らない3Dモデルです" });
      if (typeof body.imageUrl !== "string" || !(body.imageUrl.startsWith("https://") || body.imageUrl.startsWith("data:image/")) || body.imageUrl.length > 3_000_000) {
        return res.status(400).json({ error: "画像のURLが正しくありません" });
      }
      const r = await fetch(QUEUE + m.endpoint, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify(m.args(body.imageUrl)),
      });
      const text = await r.text();
      if (!r.ok) return res.status(502).json({ error: falError(r.status, text) });
      const d = JSON.parse(text);
      return res.status(200).json({ statusUrl: d.status_url, responseUrl: d.response_url, model: body.model });
    }

    if (body.action === "check") {
      const { statusUrl, responseUrl, model } = body;
      const m = MODELS[model];
      if (!m || ![statusUrl, responseUrl].every(u => typeof u === "string" && u.startsWith(QUEUE))) {
        return res.status(400).json({ error: "確認先が正しくありません" });
      }
      const s = await fetch(statusUrl, { headers: auth });
      const st = await s.json().catch(() => ({}));
      if (!s.ok) return res.status(502).json({ error: falError(s.status, JSON.stringify(st)) });
      if (st.status !== "COMPLETED") return res.status(200).json({ done: false, status: st.status || "UNKNOWN" });
      const r = await fetch(responseUrl, { headers: auth });
      const text = await r.text();
      if (!r.ok) return res.status(502).json({ error: falError(r.status, text) });
      const glb = m.pick(JSON.parse(text));
      if (!glb) return res.status(502).json({ error: "3Dモデルが返ってきませんでした" });
      return res.status(200).json({ done: true, glb });
    }

    return res.status(400).json({ error: "action が正しくありません" });
  } catch (e) {
    return res.status(502).json({ error: "fal.ai に接続できませんでした: " + (e && e.message ? e.message : String(e)) });
  }
}
