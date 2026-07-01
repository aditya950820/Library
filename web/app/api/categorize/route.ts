import { NextResponse } from "next/server";
import { TAXONOMY, CATEGORIES, normalizeGuess } from "@/lib/categories";

export const runtime = "nodejs";
// Web search + reasoning can take a while — allow a longer budget.
export const maxDuration = 60;

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

  const system = `You are an expert librarian. First, use web search to understand what this specific book is actually about — its real subject, genre and intended readers — instead of guessing from keywords in the title. Then classify it into exactly one category and one sub-category chosen ONLY from the allowed list below. If the sub-category is genuinely unclear, use "Other".

When you are done, output ONLY a single JSON object as the final line and nothing after it: {"category": string, "sub_category": string}.

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
        max_completion_tokens: 4096,
        reasoning_effort: "medium",
        // Built-in web search so the model understands the real book,
        // not just keywords in the title.
        tools: [{ type: "browser_search" }],
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
    // The final JSON may be preceded by search notes; take the last object
    // that actually contains a "category" key.
    const objs = content.match(/\{[^{}]*"category"[^{}]*\}/g);
    const parsed = objs?.length ? JSON.parse(objs[objs.length - 1]) : null;
    const guess = normalizeGuess(parsed);

    return NextResponse.json({ guess });
  } catch (e) {
    return NextResponse.json(
      { guess: null, error: e instanceof Error ? e.message : "failed" },
      { status: 200 }
    );
  }
}
