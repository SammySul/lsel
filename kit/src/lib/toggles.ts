// How a Toggles row splits its toggles into pages of lines, from their measured widths.

export interface Room {
  /** The row's width. */
  width: number;
  gap: number;
  /** The pager's width, kept free at the end of a page's last line when there are several pages. */
  pager: number;
  /** Lines per page. */
  lines: number;
}

/** Each page's line starts, as indexes into `widths`; a toggle wider than its line gets the line alone. */
export function pack(widths: readonly number[], room: Room): number[][] {
  const fill = (reserve: boolean): number[][] => {
    const pages: number[][] = [];
    let line = 0;
    let used = 0;
    widths.forEach((w, i) => {
      const page = pages[pages.length - 1];
      const limit = room.width - (reserve && line === room.lines - 1 ? room.pager + room.gap : 0);
      if (page !== undefined && used + room.gap + w <= limit) {
        used += room.gap + w;
      } else if (page !== undefined && line < room.lines - 1) {
        page.push(i);
        line++;
        used = w;
      } else {
        pages.push([i]);
        line = 0;
        used = w;
      }
    });
    return pages.length === 0 ? [[0]] : pages;
  };
  const one = fill(false);
  return one.length === 1 ? one : fill(true);
}
