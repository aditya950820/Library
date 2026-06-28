import { NextResponse } from "next/server";
import { TAXONOMY, CATEGORIES, normalizeGuess } from "@/lib/categories";

export const runtime = "nodejs";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

function buildAllowedList() {
  return CATEGORIES.map((c) => `- "${c}": [${TAXONOMY[c].join(", ")}]`).join("\n");
}

export async function POST(request: Request) {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "classifier not configured" }, { status: 200 });
  }

  let body: { title?: string; author?: string; hint?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const { title, author, hint } = body;
  if (!title) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }

  const system = `You are a librarian. Classify the book into exactly one category and one sub-category chosen ONLY from the allowed list below. If unsure of the sub-category, use "Other". Output strictly a single JSON object and nothing else: {"category": string, "sub_category": string}.

Allowed:
${buildAllowedList()}`;

  const user = [
    `Title: ${title}`,
    author ? `Author: ${author}` : "",
    hint ? `Publisher/Subject hint: ${hint}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        temperature: 0,
        max_completion_tokens: 2048,
        reasoning_effort: "low",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `groq ${res.status}`, detail: t.slice(0, 200) },
        { status: 200 }
      );
    }

    const data = await res.json();
    const content: string = data.choices?.[0]?.message?.content ?? "";
    const m = content.match(/\{[\s\S]*\}/);
    const parsed = m ? JSON.parse(m[0]) : null;
    const guess = normalizeGuess(parsed);

    return NextResponse.json({ guess });
  } catch (e) {
    return NextResponse.json(
      { guess: null, error: e instanceof Error ? e.message : "failed" },
      { status: 200 }
    );
  }
}
