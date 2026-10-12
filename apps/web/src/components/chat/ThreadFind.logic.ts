import type { MessagesTimelineRow } from "./MessagesTimeline.logic";

/** One occurrence of the query: the `occurrence`-th match inside a message row. */
export interface ThreadFindMatch {
  readonly rowId: string;
  readonly occurrence: number;
}

/** A match mapped onto a run of text nodes: segment indices and offsets within them. */
export interface SegmentRange {
  readonly startSegment: number;
  readonly startOffset: number;
  readonly endSegment: number;
  readonly endOffset: number;
}

/** Case-insensitive literal pattern for the query, or null when there is nothing to find. */
export function threadFindPattern(query: string): RegExp | null {
  if (query.trim().length === 0) return null;
  return new RegExp(query.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "giu");
}

export function matchOffsets(text: string, pattern: RegExp): Array<readonly [number, number]> {
  const offsets: Array<readonly [number, number]> = [];
  for (const match of text.matchAll(pattern)) {
    offsets.push([match.index, match.index + match[0].length]);
  }
  return offsets;
}

/**
 * Matches in the text the thread renders as conversation: user prompts and
 * assistant replies. Collapsed reasoning and tool output stay out, the way a
 * browser's find skips hidden text.
 */
export function findThreadMatches(
  rows: ReadonlyArray<MessagesTimelineRow>,
  pattern: RegExp | null,
): ThreadFindMatch[] {
  if (pattern === null) return [];
  const matches: ThreadFindMatch[] = [];
  for (const row of rows) {
    if (row.kind !== "message") continue;
    const count = matchOffsets(row.message.text, pattern).length;
    for (let occurrence = 0; occurrence < count; occurrence += 1) {
      matches.push({ rowId: row.id, occurrence });
    }
  }
  return matches;
}

/** The first match at or below the first visible row, wrapping to the top. */
export function initialMatchIndex(
  matches: ReadonlyArray<ThreadFindMatch>,
  rows: ReadonlyArray<MessagesTimelineRow>,
  firstVisibleRowIndex: number,
): number {
  if (matches.length === 0) return -1;
  const rowIndexById = new Map(rows.map((row, index) => [row.id, index]));
  const index = matches.findIndex(
    (match) => (rowIndexById.get(match.rowId) ?? -1) >= firstVisibleRowIndex,
  );
  return index === -1 ? 0 : index;
}

export function stepMatchIndex(current: number, delta: 1 | -1, length: number): number {
  if (length === 0) return -1;
  if (current < 0) return delta === 1 ? 0 : length - 1;
  return (current + delta + length) % length;
}

/** Maps offsets in the concatenated text of several segments back onto the segments. */
export function mapOffsetsToSegments(
  segmentLengths: ReadonlyArray<number>,
  offsets: ReadonlyArray<readonly [number, number]>,
): SegmentRange[] {
  const starts: number[] = [];
  let total = 0;
  for (const length of segmentLengths) {
    starts.push(total);
    total += length;
  }
  // Offsets arrive in ascending order, so one cursor walks the segments once.
  let segment = 0;
  const locate = (offset: number, isEnd: boolean) => {
    while (
      segment < segmentLengths.length - 1 &&
      (isEnd
        ? offset > starts[segment]! + segmentLengths[segment]!
        : offset >= starts[segment]! + segmentLengths[segment]!)
    ) {
      segment += 1;
    }
    return { segment, offset: offset - starts[segment]! };
  };
  return offsets.map(([start, end]) => {
    const from = locate(start, false);
    const to = locate(end, true);
    return {
      startSegment: from.segment,
      startOffset: from.offset,
      endSegment: to.segment,
      endOffset: to.offset,
    };
  });
}
