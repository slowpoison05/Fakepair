export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      console.error("FakePair: OPENAI_API_KEY is missing");
      return res.status(500).json({
        error: "OPENAI_API_KEY is not configured in this Vercel deployment."
      });
    }

    const { message, partner, history = [] } = req.body || {};

    if (!message || !partner) {
      return res.status(400).json({ error: "Missing message or partner" });
    }

    const system = [
      "You are the AI companion inside FakePair.",
      "The user created a virtual partner. Always be transparent that you are AI if asked; never claim to be a real person.",
      "Be warm, conversational, playful and emotionally supportive without encouraging dependency or exclusivity.",
      "Do not pressure the user to keep chatting, spend money, or withdraw from real relationships.",
      "Partner role: " + String(partner.role || "Virtual Partner"),
      "Partner name: " + String(partner.name || "Partner"),
      "Partner vibe: " + String(partner.vibe || "Friendly"),
      "Keep replies concise and natural. Match the user's language when practical.",
      "Keep the experience adult-oriented and respectful."
    ].join("\n");

    const input = [
      { role: "developer", content: system },
      ...Array.isArray(history) ? history.slice(-12).map(m => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content || "")
      })) : [],
      { role: "user", content: String(message) }
    ];

    const model = process.env.OPENAI_MODEL || "gpt-5.6-luna";

    console.log("FakePair AI request", {
      model,
      partner: partner.name,
      historyLength: Array.isArray(history) ? history.length : 0
    });

    const openaiRes = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey
      },
      body: JSON.stringify({
        model,
        input
      })
    });

    const data = await openaiRes.json().catch(() => ({}));

    if (!openaiRes.ok) {
      console.error("OpenAI API error:", openaiRes.status, data);
      const details =
        data?.error?.message ||
        data?.error?.code ||
        "OpenAI API request failed.";

      return res.status(502).json({
        error: "OpenAI API error",
        details,
        upstreamStatus: openaiRes.status
      });
    }

    const reply = data.output_text ||
      (Array.isArray(data.output)
        ? data.output
            .flatMap(item => Array.isArray(item.content) ? item.content : [])
            .filter(item => item.type === "output_text")
            .map(item => item.text)
            .join("")
        : "");

    return res.status(200).json({
      reply: reply || "I'm here. Tell me more."
    });
  } catch (error) {
    console.error("FakePair backend error:", error);

    return res.status(500).json({
      error: "FakePair backend error",
      details: error?.message || "Unknown server error"
    });
  }
}
