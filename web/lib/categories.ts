// Fixed library taxonomy. Each category has sub-categories; "Other" always last.
export const TAXONOMY: Record<string, string[]> = {
  "Academic Textbook & Student Resource": [
    "School (K-12)",
    "Undergraduate",
    "Postgraduate",
    "Engineering",
    "Medical",
    "Commerce & Management",
    "Law",
    "Lab Manuals & Guides",
    "Other",
  ],
  "Biography, Memoir & True Narrative": [
    "Autobiography",
    "Memoir",
    "Political",
    "Sports",
    "Historical Figures",
    "Business Leaders",
    "Other",
  ],
  "Children's & Juvenile Literature": [
    "Picture Books",
    "Early Readers",
    "Middle Grade",
    "Young Adult",
    "Comics & Graphic Novels",
    "Activity & Learning",
    "Other",
  ],
  "Competitive Exam & Test Preparation": [
    "UPSC & Civil Services",
    "SSC & Banking",
    "Engineering (JEE)",
    "Medical (NEET)",
    "State PSC",
    "Teaching (CTET/TET)",
    "Defence",
    "GATE",
    "Other",
  ],
  "History, Culture & Social Sciences": [
    "World History",
    "Indian History",
    "Politics & Government",
    "Sociology",
    "Geography",
    "Economics",
    "Anthropology",
    "Other",
  ],
  "Literary & Commercial Fiction": [
    "Classics",
    "Contemporary Fiction",
    "Mystery & Thriller",
    "Romance",
    "Science Fiction & Fantasy",
    "Short Stories",
    "Poetry & Drama",
    "Other",
  ],
  "Reference, Encyclopedias & Dictionaries": [
    "Dictionaries",
    "Encyclopedias",
    "Atlases & Maps",
    "Almanacs & Yearbooks",
    "Language & Grammar",
    "Other",
  ],
  "Religion, Philosophy & Spirituality": [
    "Hinduism",
    "Islam",
    "Christianity",
    "Buddhism & Jainism",
    "Comparative Religion",
    "Philosophy",
    "Spirituality & Mindfulness",
    "Other",
  ],
  "Science, Technology & Medicine": [
    "Physics",
    "Chemistry",
    "Biology",
    "Mathematics",
    "Computer Science & IT",
    "Engineering",
    "Medicine & Health",
    "Environment",
    "Other",
  ],
  "Self-Help & Personal Development": [
    "Motivation & Inspiration",
    "Productivity",
    "Finance & Investing",
    "Career & Business",
    "Health & Wellness",
    "Relationships",
    "Other",
  ],
};

export const CATEGORIES = Object.keys(TAXONOMY);

// Shelves A–J.
export const SHELVES = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];

// Explicit category → shelf assignment.
export const SHELF_BY_CATEGORY: Record<string, string> = {
  "Academic Textbook & Student Resource": "A",
  "History, Culture & Social Sciences": "B",
  "Competitive Exam & Test Preparation": "C",
  "Biography, Memoir & True Narrative": "D",
  "Children's & Juvenile Literature": "E",
  "Literary & Commercial Fiction": "F",
  "Reference, Encyclopedias & Dictionaries": "G",
  "Religion, Philosophy & Spirituality": "H",
  "Science, Technology & Medicine": "I",
  "Self-Help & Personal Development": "J",
};

/** The shelf letter assigned to a category. */
export function shelfForCategory(category: string | null | undefined): string {
  if (!category) return "";
  return SHELF_BY_CATEGORY[category] ?? "";
}

// Keywords that hint at a category, used for a quick local match before
// falling back to the AI classifier.
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  "Academic Textbook & Student Resource": [
    "textbook", "ncert", "academic", "syllabus", "course", "semester", "university",
  ],
  "Biography, Memoir & True Narrative": [
    "biography", "memoir", "autobiography", "life of", "true story",
  ],
  "Children's & Juvenile Literature": [
    "children", "kids", "juvenile", "picture book", "fairy", "nursery",
  ],
  "Competitive Exam & Test Preparation": [
    "exam", "preparation", "test prep", "upsc", "neet", "jee", "ssc", "gate",
    "objective", "previous year", "mock", "gk", "general knowledge",
  ],
  "History, Culture & Social Sciences": [
    "history", "historical", "civilization", "politics", "political", "sociology",
    "geography", "economics", "social science", "culture",
  ],
  "Literary & Commercial Fiction": [
    "fiction", "novel", "thriller", "mystery", "romance", "fantasy", "sci-fi",
    "science fiction", "poetry", "drama", "literary", "stories",
  ],
  "Reference, Encyclopedias & Dictionaries": [
    "dictionary", "encyclopedia", "encyclopaedia", "reference", "atlas",
    "almanac", "thesaurus", "grammar", "handbook",
  ],
  "Religion, Philosophy & Spirituality": [
    "religion", "religious", "spiritual", "philosophy", "hindu", "islam",
    "christian", "buddhis", "gita", "bible", "quran", "yoga", "meditation",
  ],
  "Science, Technology & Medicine": [
    "science", "physics", "chemistry", "biology", "mathematics", "maths",
    "computer", "technology", "engineering", "medicine", "medical", "anatomy",
  ],
  "Self-Help & Personal Development": [
    "self-help", "self help", "personal development", "motivation", "habits",
    "productivity", "mindset", "success", "finance", "investing", "wellness",
  ],
};

const SUBCAT_KEYWORDS: Record<string, string[]> = {
  Physics: ["physics"],
  Chemistry: ["chemistry", "organic", "inorganic"],
  Biology: ["biology", "botany", "zoology", "anatomy"],
  Mathematics: ["math", "mathematics", "algebra", "calculus", "geometry"],
  "Computer Science & IT": ["computer", "programming", "software", "coding", "data"],
  "Medicine & Health": ["medicine", "medical", "health", "nursing"],
  "Indian History": ["india", "indian"],
  "World History": ["world", "global", "europe", "ancient"],
  "Mystery & Thriller": ["thriller", "mystery", "crime", "detective"],
  Romance: ["romance", "love"],
  "Science Fiction & Fantasy": ["fantasy", "sci-fi", "science fiction", "dragon"],
  Classics: ["classic"],
  Poetry: ["poetry", "poems"],
  "UPSC & Civil Services": ["upsc", "ias", "civil services"],
  "Medical (NEET)": ["neet", "medical entrance"],
  "Engineering (JEE)": ["jee", "iit", "engineering entrance"],
  "SSC & Banking": ["ssc", "bank", "ibps"],
  Dictionaries: ["dictionary"],
  Encyclopedias: ["encyclopedia", "encyclopaedia"],
  Hinduism: ["hindu", "gita", "veda", "ramayan", "mahabharat"],
  Islam: ["islam", "quran", "muslim"],
  Christianity: ["christian", "bible", "jesus"],
  Philosophy: ["philosophy", "philosoph"],
  "Finance & Investing": ["finance", "money", "investing", "stock", "wealth"],
};

export type CategoryGuess = { category: string; sub_category: string };

/**
 * Quick local guess from any free text (a Google Books category, the title,
 * etc). Returns null when nothing matches with reasonable confidence.
 */
export function matchCategory(...texts: (string | null | undefined)[]): CategoryGuess | null {
  const hay = texts.filter(Boolean).join(" ").toLowerCase();
  if (!hay.trim()) return null;

  let bestCat: string | null = null;
  let bestScore = 0;
  for (const [cat, words] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const w of words) {
      // word-ish match
      if (new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(hay)) {
        score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestCat = cat;
    }
  }
  if (!bestCat || bestScore === 0) return null;

  // Try to pick a sub-category within the matched category.
  let sub = "Other";
  for (const candidate of TAXONOMY[bestCat]) {
    const kw = SUBCAT_KEYWORDS[candidate];
    if (kw && kw.some((w) => hay.includes(w))) {
      sub = candidate;
      break;
    }
  }
  return { category: bestCat, sub_category: sub };
}

/** Ask the AI classifier (server route) to pick a category + sub-category. */
export async function aiClassify(input: {
  title: string;
  author?: string;
  hint?: string;
}): Promise<CategoryGuess | null> {
  try {
    const res = await fetch("/api/categorize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    const { guess } = await res.json();
    return normalizeGuess(guess);
  } catch {
    return null;
  }
}

/** Coerce arbitrary category/sub strings to valid taxonomy values. */
export function normalizeGuess(g: Partial<CategoryGuess> | null): CategoryGuess | null {
  if (!g?.category) return null;
  const cat = CATEGORIES.find(
    (c) => c.toLowerCase() === String(g.category).toLowerCase()
  );
  if (!cat) return null;
  const subs = TAXONOMY[cat];
  const sub =
    subs.find((s) => s.toLowerCase() === String(g.sub_category ?? "").toLowerCase()) ??
    "Other";
  return { category: cat, sub_category: sub };
}
