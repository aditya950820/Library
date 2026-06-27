export type IsbnLookup = {
  isbn: string;
  title?: string;
  author?: string;
  publisher?: string;
};

/** Keep only ISBN-valid characters (digits and trailing X). */
export function normalizeIsbn(raw: string): string {
  return raw.replace(/[^0-9Xx]/g, "").toUpperCase();
}

/**
 * Look up book metadata for an ISBN using the free Open Library API.
 * Returns null if nothing is found or the request fails — callers should
 * degrade gracefully and let the librarian fill details manually.
 */
export async function lookupIsbn(rawIsbn: string): Promise<IsbnLookup | null> {
  const isbn = normalizeIsbn(rawIsbn);
  if (isbn.length < 8) return null;

  try {
    const res = await fetch(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(
        isbn
      )}&format=json&jscmd=data`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const entry = data[`ISBN:${isbn}`];
    if (!entry) return { isbn };

    return {
      isbn,
      title: entry.title,
      author: Array.isArray(entry.authors)
        ? entry.authors.map((a: { name: string }) => a.name).join(", ")
        : undefined,
      publisher: Array.isArray(entry.publishers)
        ? entry.publishers.map((p: { name: string }) => p.name).join(", ")
        : undefined,
    };
  } catch {
    return null;
  }
}
