export type BookMeta = {
  isbn: string;
  title?: string;
  author?: string;
  publisher?: string;
  year?: string;
  category?: string;
  cover?: string;
};

const GBOOKS = "https://www.googleapis.com/books/v1/volumes";
const KEY = process.env.NEXT_PUBLIC_GOOGLE_BOOKS_KEY;

/** Keep only ISBN-valid characters (digits and trailing X). */
export function normalizeIsbn(raw: string): string {
  return raw.replace(/[^0-9Xx]/g, "").toUpperCase();
}

type GVolumeInfo = {
  title?: string;
  subtitle?: string;
  authors?: string[];
  publisher?: string;
  publishedDate?: string;
  categories?: string[];
  industryIdentifiers?: { type: string; identifier: string }[];
  imageLinks?: { thumbnail?: string; smallThumbnail?: string };
};

function fromGoogle(info: GVolumeInfo, fallbackIsbn = ""): BookMeta {
  const ids = info.industryIdentifiers ?? [];
  const isbn13 = ids.find((i) => i.type === "ISBN_13")?.identifier;
  const isbn10 = ids.find((i) => i.type === "ISBN_10")?.identifier;
  return {
    isbn: isbn13 || isbn10 || fallbackIsbn,
    title: info.subtitle ? `${info.title}: ${info.subtitle}` : info.title,
    author: info.authors?.join(", "),
    publisher: info.publisher,
    year: info.publishedDate?.slice(0, 4),
    category: info.categories?.[0],
    cover: (info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail)?.replace(
      "http://",
      "https://"
    ),
  };
}

function gUrl(query: string, extra = "") {
  return `${GBOOKS}?q=${encodeURIComponent(query)}${extra}${
    KEY ? `&key=${KEY}` : ""
  }`;
}

/** Look up a single book by ISBN. Tries Google Books, then Open Library. */
export async function lookupIsbn(rawIsbn: string): Promise<BookMeta | null> {
  const isbn = normalizeIsbn(rawIsbn);
  if (isbn.length < 8) return null;

  // 1) Google Books
  try {
    const res = await fetch(gUrl(`isbn:${isbn}`));
    if (res.ok) {
      const data = await res.json();
      const info = data.items?.[0]?.volumeInfo as GVolumeInfo | undefined;
      if (info?.title) return fromGoogle(info, isbn);
    }
  } catch {
    /* fall through */
  }

  // 2) Open Library
  try {
    const res = await fetch(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`,
      { headers: { Accept: "application/json" } }
    );
    if (res.ok) {
      const data = await res.json();
      const entry = data[`ISBN:${isbn}`];
      if (entry?.title) {
        return {
          isbn,
          title: entry.title,
          author: Array.isArray(entry.authors)
            ? entry.authors.map((a: { name: string }) => a.name).join(", ")
            : undefined,
          publisher: Array.isArray(entry.publishers)
            ? entry.publishers.map((p: { name: string }) => p.name).join(", ")
            : undefined,
          year: entry.publish_date?.match(/\d{4}/)?.[0],
          cover: entry.cover?.medium,
        };
      }
    }
  } catch {
    /* ignore */
  }

  // 3) India ISBN portal (isbn.gov.in) via our server route — best for Indian titles
  try {
    const res = await fetch(`/api/isbn-in?isbn=${encodeURIComponent(isbn)}`);
    if (res.ok) {
      const { results } = await res.json();
      const hit = results?.[0];
      if (hit?.title) {
        return {
          isbn: hit.isbn || isbn,
          title: hit.title,
          author: hit.author,
          publisher: hit.publisher,
          year: hit.year,
        };
      }
    }
  } catch {
    /* ignore */
  }

  return { isbn }; // ISBN captured, no metadata found
}

/** Search books by free text via Google Books + the India ISBN portal. */
export async function searchBooks(query: string): Promise<BookMeta[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const google = (async () => {
    try {
      const res = await fetch(gUrl(q, "&maxResults=12&printType=books"));
      if (!res.ok) return [];
      const data = await res.json();
      const items: { volumeInfo: GVolumeInfo }[] = data.items ?? [];
      return items.map((it) => fromGoogle(it.volumeInfo)).filter((b) => b.title);
    } catch {
      return [];
    }
  })();

  const india = (async (): Promise<BookMeta[]> => {
    try {
      const res = await fetch(`/api/isbn-in?title=${encodeURIComponent(q)}`);
      if (!res.ok) return [];
      const { results } = await res.json();
      return (results ?? []).map(
        (r: {
          isbn: string;
          title?: string;
          author?: string;
          publisher?: string;
          year?: string;
        }) => ({
          isbn: r.isbn,
          title: r.title,
          author: r.author,
          publisher: r.publisher,
          year: r.year,
        })
      );
    } catch {
      return [];
    }
  })();

  const [g, i] = await Promise.all([google, india]);

  // Merge, de-duplicating by ISBN (or title when ISBN missing). Google first.
  const seen = new Set<string>();
  const merged: BookMeta[] = [];
  for (const b of [...g, ...i]) {
    const key = (b.isbn || b.title || "").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(b);
  }
  return merged;
}
