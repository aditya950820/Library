import { NextResponse } from "next/server";
import { TAXONOMY, CATEGORIES, normalizeGuess } from "@/lib/categories";

export const runtime = "nodejs";
// Web search + reasoning can take a while — allow a longer budget.
export const maxDuration = 60;

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  "Academic Textbook & Student Resource":
    "Course textbooks, study guides and academic resources tied to a school class or college/degree syllabus (e.g. NCERT, university textbooks, lab manuals).",
  "History, Culture & Social Sciences":
    "History, politics & government, sociology, geography, economics, anthropology and cultural studies.",
  "Competitive Exam & Test Preparation":
    "Books to prepare for entrance/competitive exams — UPSC, SSC, banking, JEE, NEET, GATE, teaching (CTET/TET), defence, state PSC — objective questions, practice sets, previous-year papers, GK.",
  "Biography, Memoir & True Narrative":
    "Real-life stories of real people — biographies, autobiographies, memoirs and true narratives.",
  "Reference, Encyclopedias & Dictionaries":
    "Works consulted for facts — dictionaries, encyclopedias, atlases & maps, almanacs/yearbooks, grammar and language references.",
  "Self-Help & Personal Development":
    "Practical guidance to improve one's life — motivation, productivity, personal finance & investing, career/business, health & wellness, relationships, mindfulness.",
  "Science, Technology & Medicine":
    "General or professional science and technical subjects (not tied to a school syllabus) — physics, chemistry, biology, mathematics, computer science/IT, engineering, medicine & health, environment.",
  "Children's & Juvenile Literature":
    "Books written for children and young readers — picture books, early readers, middle grade, young adult, comics & graphic novels, activity books.",
  "Religion, Philosophy & Spirituality":
    "Religious scriptures and commentary, theology, philosophy and spirituality across traditions.",
  "Literary & Commercial Fiction":
    "Novels and imaginative fiction for adults — classics, contemporary fiction, mystery & thriller, romance, science fiction & fantasy, short stories, poetry & drama.",
};

function buildAllowedList() {
  return CATEGORIES.map(
    (c) =>
      `- "${c}" — ${CATEGORY_DESCRIPTIONS[c] ?? ""}\n    sub-categories: [${TAXONOMY[c].join(", ")}]`
  ).join("\n");
}

const RULES = `Tie-breakers:
- A book meant for a school/college syllabus goes to "Academic Textbook & Student Resource", even if its subject is science or history.
- A book aimed at cracking a competitive/entrance exam goes to "Competitive Exam & Test Preparation", even if its subject is science, maths or history.
- Prefer the most specific category that matches the book's real purpose and readership.
- You MUST return a sub_category taken from the chosen category's list. If none clearly fits, return exactly "Other" (never leave it blank, never invent a new value).`;

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

  const user = [
    `Title: ${title}`,
    author ? `Author: ${author}` : "",
    hint ? `Publisher/Subject hint: ${hint}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  // Fast path: the model classifies from its own knowledge and may signal
  // that it cannot conclude. Only then do we pay for a web search.
  const systemFast = `You are an expert librarian shelving a book into a fixed taxonomy. Using what you already know about this specific book, its author and subject, choose EXACTLY one category and one sub-category from the allowed list below.

${RULES}

If — and only if — you genuinely do not recognise this book and cannot reasonably infer its subject from the title, author or hint, set "category" to "Unknown" (do not guess blindly).

Output ONLY a single JSON object and nothing else: {"category": string, "sub_category": string}.

Allowed categories (with descriptions and their sub-categories):
${buildAllowedList()}`;

  const systemSearch = `You are an expert librarian shelving a book into a fixed taxonomy. Use web search to find out what this specific book is actually about — its real subject, genre and intended readers — then choose EXACTLY one category and one sub-category from the allowed list below.

${RULES}

Do NOT return "Unknown" this time — always commit to the single best-fitting category and sub-category (use "Other" for the sub-category if none fits).

When done, output ONLY a single JSON object as the final line: {"category": string, "sub_category": string}.

Allowed categories (with descriptions and their sub-categories):
${buildAllowedList()}`;

  async function callGroq(useSearch: boolean) {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        temperature: 0,
        max_completion_tokens: useSearch ? 4096 : 1024,
        reasoning_effort: useSearch ? "medium" : "low",
        ...(useSearch ? { tools: [{ type: "browser_search" }] } : {}),
        messages: [
          { role: "system", content: useSearch ? systemSearch : systemFast },
          { role: "user", content: user },
        ],
      }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content: string = data.choices?.[0]?.message?.content ?? "";
    const objs = content.match(/\{[^{}]*"category"[^{}]*\}/g);
    const parsed = objs?.length ? JSON.parse(objs[objs.length - 1]) : null;
    return normalizeGuess(parsed); // null when Unknown/invalid
  }

  try {
    // 1) Normal LLM call (fast, no search).
    let guess = await callGroq(false);
    let searched = false;

    // 2) Fall back to web search only if it couldn't conclude.
    if (!guess) {
      guess = await callGroq(true);
      searched = true;
    }

    return NextResponse.json({ guess, searched });
  } catch (e) {
    return NextResponse.json(
      { guess: null, error: e instanceof Error ? e.message : "failed" },
      { status: 200 }
    );
  }
}
