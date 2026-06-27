import { NextResponse } from "next/server";

export const runtime = "nodejs";
// isbn.gov.in only responds to India-based IPs — keep this function in Mumbai.
export const preferredRegion = "bom1";

const ENDPOINT = "https://isbn.gov.in/Home/FillSearchText";

const COLUMNS = [
  "Index1",
  "title",
  "isbn_number",
  "productform",
  "language",
  "applicant_type",
  "publisher",
  "Inprint",
  "Author",
  "publicationdate",
].map((data) => ({
  data,
  name: data,
  searchable: true,
  orderable: true,
  search: { value: "", regex: false },
}));

type IsbnRow = {
  title?: string;
  isbn_number?: string;
  Author?: string;
  publisher?: string;
  language?: string;
  productform?: string;
  publicationdate?: string;
  edition?: string;
};

export type IsbnInResult = {
  isbn: string;
  title?: string;
  author?: string;
  publisher?: string;
  year?: string;
  language?: string;
};

function yearOf(d?: string) {
  return d?.match(/\d{4}/)?.[0];
}

const UA =
  "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

// Browser-like headers shared by both the handshake GET and the search POST.
const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent": UA,
  "Accept-Language": "en-US,en;q=0.9",
  "sec-ch-ua": '"Chromium";v="120", "Google Chrome";v="120", "Not/A)Brand";v="99"',
  "sec-ch-ua-mobile": "?1",
  "sec-ch-ua-platform": '"Android"',
};

// Cache the session cookie across requests (warm lambda) for ~10 min.
let cookieCache: { value: string; at: number } | null = null;
const COOKIE_TTL = 10 * 60 * 1000;

async function getSessionCookie(force = false): Promise<string> {
  if (!force && cookieCache && Date.now() - cookieCache.at < COOKIE_TTL) {
    return cookieCache.value;
  }
  const res = await fetch("https://isbn.gov.in/Home/IsbnSearch", {
    headers: {
      ...BROWSER_HEADERS,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
    },
    cache: "no-store",
  });
  // Node/undici exposes getSetCookie(); fall back to the raw header.
  const setCookies: string[] =
    (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ??
    (res.headers.get("set-cookie") ? [res.headers.get("set-cookie")!] : []);
  const cookie = setCookies
    .map((c) => c.split(";")[0])
    .filter(Boolean)
    .join("; ");
  cookieCache = { value: cookie, at: Date.now() };
  return cookie;
}

async function postSearch(type: string, value: string, cookie: string) {
  const payload = {
    data: {
      draw: 1,
      columns: COLUMNS,
      order: [{ column: 0, dir: "asc" }],
      start: 0,
      length: 25,
      search: { value: "", regex: false },
    },
    _obj: { Type: type, SearchValue: value, ViewReport: 1 },
  };

  return fetch(ENDPOINT, {
    method: "POST",
    headers: {
      ...BROWSER_HEADERS,
      "Content-Type": "application/json; charset=UTF-8",
      Accept: "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
      Referer: "https://isbn.gov.in/Home/IsbnSearch",
      Origin: "https://isbn.gov.in",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
}

async function query(type: string, value: string): Promise<IsbnInResult[]> {
  let cookie = await getSessionCookie();
  let res = await postSearch(type, value, cookie);

  // If the cached session is stale/blocked, re-handshake once and retry.
  if (res.status === 401 || res.status === 403) {
    cookie = await getSessionCookie(true);
    res = await postSearch(type, value, cookie);
  }

  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 200);
    throw new Error(`isbn.gov.in returned ${res.status}${body ? `: ${body}` : ""}`);
  }
  const json = await res.json();
  const rows: IsbnRow[] = json.data ? JSON.parse(json.data) : [];

  return rows
    .filter((r) => r.title)
    .map((r) => ({
      isbn: (r.isbn_number ?? "").replace(/[^0-9Xx]/g, "").toUpperCase(),
      title: r.edition ? `${r.title} (${r.edition})` : r.title,
      author: r.Author,
      publisher: r.publisher,
      year: yearOf(r.publicationdate),
      language: r.language,
    }));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const isbn = searchParams.get("isbn");
  const title = searchParams.get("title");
  const author = searchParams.get("author");

  try {
    let results: IsbnInResult[] = [];
    if (isbn) {
      results = await query("isbn_number_Nodash", isbn.replace(/[^0-9Xx]/gi, ""));
    } else if (title) {
      results = await query("title", title);
    } else if (author) {
      results = await query("Author", author);
    } else {
      return NextResponse.json(
        { error: "Provide ?isbn=, ?title= or ?author=" },
        { status: 400 }
      );
    }
    return NextResponse.json({ results });
  } catch (e) {
    // Govt source is best-effort — never hard-fail the caller.
    return NextResponse.json(
      { results: [], error: e instanceof Error ? e.message : "lookup failed" },
      { status: 200 }
    );
  }
}
