// What the server sends the page.

export interface Hello {
  greeting: string;
  /** ISO 8601. */
  at: string;
}
