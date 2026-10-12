import { describe, expect, it } from "vite-plus/test";
import type { MessagesTimelineRow } from "./MessagesTimeline.logic";
import {
  findThreadMatches,
  initialMatchIndex,
  mapOffsetsToSegments,
  matchOffsets,
  stepMatchIndex,
  threadFindPattern,
} from "./ThreadFind.logic";

function messageRow(id: string, text: string): MessagesTimelineRow {
  return {
    kind: "message",
    id,
    createdAt: "2026-10-12T12:00:00.000Z",
    message: { id, role: "assistant", text } as never,
    durationStart: "2026-10-12T12:00:00.000Z",
    showAssistantMeta: false,
    showAssistantCopyButton: false,
    assistantCopyStreaming: false,
  };
}

function foldRow(id: string): MessagesTimelineRow {
  return { kind: "context-compaction", id, createdAt: "2026-10-12T12:00:00.000Z", label: id };
}

describe("threadFindPattern", () => {
  it("matches the query literally and ignores case", () => {
    const pattern = threadFindPattern("a.b (c)");
    expect(matchOffsets("A.B (C) axb (c) a.b (c)", pattern!)).toEqual([
      [0, 7],
      [16, 23],
    ]);
  });

  it("finds nothing for a blank query", () => {
    expect(threadFindPattern("   ")).toBeNull();
  });
});

describe("findThreadMatches", () => {
  it("lists every occurrence in message rows, in thread order", () => {
    const rows = [
      messageRow("a", "fix the bug, then the other bug"),
      foldRow("bug compaction"),
      messageRow("b", "no match here"),
      messageRow("c", "Bug report"),
    ];
    expect(findThreadMatches(rows, threadFindPattern("bug"))).toEqual([
      { rowId: "a", occurrence: 0 },
      { rowId: "a", occurrence: 1 },
      { rowId: "c", occurrence: 0 },
    ]);
  });
});

describe("initialMatchIndex", () => {
  const rows = [messageRow("a", "x"), messageRow("b", "x"), messageRow("c", "x")];
  const matches = findThreadMatches(rows, threadFindPattern("x"));

  it("starts at the first match at or below the first visible row", () => {
    expect(initialMatchIndex(matches, rows, 1)).toBe(1);
  });

  it("wraps to the first match when none are below", () => {
    expect(initialMatchIndex(matches, rows, 3)).toBe(0);
  });

  it("is -1 without matches", () => {
    expect(initialMatchIndex([], rows, 0)).toBe(-1);
  });
});

describe("stepMatchIndex", () => {
  it("wraps in both directions", () => {
    expect(stepMatchIndex(2, 1, 3)).toBe(0);
    expect(stepMatchIndex(0, -1, 3)).toBe(2);
  });

  it("enters from either end when nothing is selected", () => {
    expect(stepMatchIndex(-1, 1, 3)).toBe(0);
    expect(stepMatchIndex(-1, -1, 3)).toBe(2);
  });
});

describe("mapOffsetsToSegments", () => {
  it("maps matches inside, across, and at the edges of segments", () => {
    // "hello " + "wor" + "ld"
    expect(
      mapOffsetsToSegments(
        [6, 3, 2],
        [
          [0, 5],
          [6, 9],
          [7, 11],
        ],
      ),
    ).toEqual([
      { startSegment: 0, startOffset: 0, endSegment: 0, endOffset: 5 },
      { startSegment: 1, startOffset: 0, endSegment: 1, endOffset: 3 },
      { startSegment: 1, startOffset: 1, endSegment: 2, endOffset: 2 },
    ]);
  });
});
