import { NextResponse } from "next/server";

export const runtime = "nodejs";

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

async function query(type: string, value: string): Promise<IsbnInResult[]> {
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

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      Accept: "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
      Referer: "https://isbn.gov.in/Home/IsbnSearch",
      Origin: "https://isbn.gov.in",
      "User-Agent":
        "Mozilla/5.0 (Linux; Android 6.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36",
    },
    body: JSON.stringify(payload),
    // The govt site can be slow; don't cache stale misses for long.
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`isbn.gov.in returned ${res.status}`);
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
