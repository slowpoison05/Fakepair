export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (!apiKey) {
      console.error("FakePair: GEMINI_API_KEY is missing");
      return res.status(500).json({
        error: "GEMINI_API_KEY is not configured in this Vercel deployment."
      });
    }

    const { message, partner, history = [] } = req.body || {};

    if (!message || !partner) {
      return res.status(400).json({ error: "Missing message or partner" });
    }

    const systemInstruction = [
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

    const contents = [];

    if (Array.isArray(history)) {
      for (const item of history.slice(-12)) {
        contents.push({
          role: item.role === "assistant" ? "model" : "user",
          parts: [{ text: String(item.content || "") }]
        });
      }
    }

    contents.push({
      role: "user",
      parts: [{ text: String(message) }]
    });

    const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";
    const url = "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(model) + ":generateContent";

    console.log("FakePair Gemini request", {
      model,
      partner: partner.name,
      historyLength: Array.isArray(history) ? history.length : 0
    });

    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemInstruction }]
        },
        contents,
        generationConfig: {
          temperature: 0.9,
          maxOutputTokens: 300
        }
      })
    });

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      console.error("Gemini API error:", upstream.status, data);

      return res.status(502).json({
        error: "Gemini API error",
        details: data?.error?.message || data?.error?.status || "Gemini API request failed.",
        upstreamStatus: upstream.status
      });
    }

    const reply = data?.candidates?.[0]?.content?.parts
      ?.filter(part => typeof part.text === "string")
      .map(part => part.text)
      .join("")
      .trim();

    return res.status(200).json({
      reply: reply || "I'm here. Tell me more."
    });
  } catch (error) {
    console.error("FakePair Gemini backend error:", error);

    return res.status(500).json({
      error: "FakePair Gemini backend error",
      details: error?.message || "Unknown server error"
    });
  }
}
