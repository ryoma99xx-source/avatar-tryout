// 写真 → アバター生成の中継。fal.ai のキーはここ（サーバー側）だけが持つ。
// 環境変数: FAL_KEY（fal.ai のAPIキー）, ACCESS_CODE（合言葉）

const MODELS = {
  muse: {
    endpoint: "meta/muse-image/edit",
    args: (prompt, images) => ({ prompt, image_urls: images, aspect_ratio: "1:1", num_images: 1, output_format: "png" }),
  },
  klein: {
    endpoint: "fal-ai/flux-2/klein/9b/edit",
    args: (prompt, images) => ({ prompt, image_urls: images, image_size: { width: 1024, height: 1024 }, num_images: 1, output_format: "png" }),
  },
  seedream: {
    endpoint: "fal-ai/bytedance/seedream/v5/lite/edit",
    args: (prompt, images) => ({ prompt, image_urls: images, image_size: { width: 1024, height: 1024 }, num_images: 1, output_format: "png" }),
  },
  nb2: {
    endpoint: "fal-ai/nano-banana-2/edit",
    args: (prompt, images) => ({ prompt, image_urls: images, aspect_ratio: "1:1", resolution: "0.5K", num_images: 1, output_format: "png" }),
  },
};


export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POSTのみ受け付けます" });

  const { FAL_KEY, ACCESS_CODE } = process.env;
  if (!FAL_KEY || !ACCESS_CODE) {
    return res.status(500).json({ error: "サーバーの設定が足りません（Vercelの環境変数 FAL_KEY と ACCESS_CODE を入れて再デプロイしてください）" });
  }
  if (req.headers["x-access-code"] !== ACCESS_CODE) {
    return res.status(401).json({ error: "合言葉が違います" });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const { model, prompt, images } = body;
  const m = MODELS[model];
  if (!m) return res.status(400).json({ error: "知らないモデルです" });
  if (typeof prompt !== "string" || prompt.length > 6000) return res.status(400).json({ error: "指示文が長すぎます" });
  if (!Array.isArray(images) || images.length < 1 || images.length > 2 ||
      !images.every(u => typeof u === "string" && u.startsWith("data:image/"))) {
    return res.status(400).json({ error: "画像の形式が正しくありません" });
  }

  try {
    const r = await fetch("https://fal.run/" + m.endpoint, {
      method: "POST",
      headers: { Authorization: "Key " + FAL_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(m.args(prompt, images)),
    });
    const text = await r.text();
    let data = null;
    try { data = JSON.parse(text); } catch (e) {}
    if (!r.ok) {
      const detail = data && data.detail ? (typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail)) : text.slice(0, 300);
      if (r.status === 401 || r.status === 403) return res.status(502).json({ error: "fal.ai のキーが正しくありません。Vercelの FAL_KEY を確認してください" });
      if (r.status === 402 || /balance|credit|billing|exhausted/i.test(detail)) return res.status(402).json({ error: "fal.ai のクレジットが足りません。Billing で追加してください" });
      return res.status(502).json({ error: `生成に失敗しました（${r.status}）: ${detail}` });
    }
    const url = data && data.images && data.images[0] && data.images[0].url;
    if (!url) return res.status(502).json({ error: "画像が返ってきませんでした" });
    return res.status(200).json({ url });
  } catch (e) {
    return res.status(502).json({ error: "fal.ai に接続できませんでした: " + (e && e.message ? e.message : String(e)) });
  }
}
