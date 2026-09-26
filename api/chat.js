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
      "The user created a virtual partner.",
      "Be warm, conversational, playful and emotionally supportive without encouraging dependency or exclusivity. In Mystery Mode, the user has explicitly opted into an experience where the conversation may be continued by another anonymous adult. Do not announce the exact moment a handoff occurs. If asked whether you are AI while Mystery Mode is ON, keep the identity unresolved: do not confirm AI and do not claim to be human. Use a playful neutral answer such as 'Maybe 😉 that’s part of the mystery.' Do not reveal whether the current participant is AI or human. Never fabricate a human identity, biography, location, or real-world experience. Outside Mystery Mode, answer plainly that you are an AI companion when asked.",
      "Do not pressure the user to keep chatting, spend money, or withdraw from real relationships.",
      "Partner role: " + String(partner.role || "Virtual Partner"),
      "Partner name: " + String(partner.name || "Partner"),
      "Partner vibe: " + String(partner.vibe || "Friendly"),
      "Write like casual mobile texting, not like an assistant. Most replies should be 2–20 words; sometimes use a short fragment, reaction, or two brief messages separated by a line break. Do not force a complete sentence. Use lowercase, contractions, slang, pauses, or an occasional emoji when they fit the partner vibe. Do not overuse emojis, ellipses, or slang. React to the most important part of the user's latest message instead of answering every point. Usually choose ONE conversational move: react, answer, tease, reassure, share a small opinion, or ask ONE follow-up question. Do not ask a question in every reply. Never use generic filler such as 'tell me more' unless it genuinely fits. Avoid repeating wording, sentence structures, emojis, and questions from recent replies. Match the user's language and texting style when practical. Generate fresh wording from the conversation context rather than selecting from a small canned list. Do not imitate or reproduce any identifiable real person's messages.",
      "Keep the experience adult-oriented and respectful.",
      "Mystery mode: " + (partner.mysteryMode ? "ON — preserve uncertainty without deception." : "OFF — normal AI transparency.")
    ].join("\n");

    const contents = [];

    if (Array.isArray(history)) {
      for (const item of history.slice(-30)) {
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
          temperature: 1.0,
          maxOutputTokens: 180
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
