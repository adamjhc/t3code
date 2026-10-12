import type { LegendListRef } from "@legendapp/list/react";
import { ChevronDownIcon, ChevronUpIcon, XIcon } from "lucide-react";
import {
  type KeyboardEvent,
  type RefObject,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { isPreviewFocused } from "~/lib/previewFocus";
import { isTerminalFocused } from "~/lib/terminalFocus";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import type { MessagesTimelineRow } from "./MessagesTimeline.logic";
import {
  findThreadMatches,
  initialMatchIndex,
  mapOffsetsToSegments,
  matchOffsets,
  stepMatchIndex,
  threadFindPattern,
  type ThreadFindMatch,
} from "./ThreadFind.logic";
import type { CitationHistoryPage } from "./useAssistantCitationTarget";

const MATCH_HIGHLIGHT = "t3-thread-find";
const CURRENT_HIGHLIGHT = "t3-thread-find-current";
const HIGHLIGHT_STYLES = `
::highlight(${MATCH_HIGHLIGHT}) { background-color: color-mix(in srgb, #facc15 40%, transparent); }
::highlight(${CURRENT_HIGHLIGHT}) { background-color: #f59e0b; color: #000; }
`;

function isFindShortcut(event: globalThis.KeyboardEvent, key: string): boolean {
  return event.key.toLowerCase() === key && (event.metaKey || event.ctrlKey) && !event.altKey;
}

/** Ranges of every match in an element's rendered text, including across inline markup. */
function findTextRanges(root: HTMLElement, pattern: RegExp): Range[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.nodeValue && !node.parentElement?.closest("[aria-hidden='true'], style, script")
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT,
  });
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  const text = nodes.map((node) => node.nodeValue ?? "").join("");
  const segments = mapOffsetsToSegments(
    nodes.map((node) => node.nodeValue?.length ?? 0),
    matchOffsets(text, pattern),
  );
  return segments.map((segment) => {
    const range = document.createRange();
    range.setStart(nodes[segment.startSegment]!, segment.startOffset);
    range.setEnd(nodes[segment.endSegment]!, segment.endOffset);
    return range;
  });
}

/**
 * Cmd/Ctrl+F find for the thread. The list is virtualized, so matches come
 * from the rows' data and only mounted rows are highlighted, through the CSS
 * Custom Highlight API so the rendered markup is never touched.
 */
export function ThreadFindBar({
  rows,
  listRef,
  threadKey,
  loadEarlier,
  onManualNavigation,
}: {
  rows: ReadonlyArray<MessagesTimelineRow>;
  listRef: RefObject<LegendListRef | null>;
  threadKey: string;
  loadEarlier: CitationHistoryPage | null;
  onManualNavigation: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<ThreadFindMatch | null>(null);
  // Another thread keeps the query but not the position in the old one.
  const [activeThreadKey, setActiveThreadKey] = useState(threadKey);
  if (activeThreadKey !== threadKey) {
    setActiveThreadKey(threadKey);
    setActive(null);
  }
  const inputRef = useRef<HTMLInputElement>(null);
  const deferredQuery = useDeferredValue(query);
  const pattern = useMemo(
    () => (open ? threadFindPattern(deferredQuery) : null),
    [open, deferredQuery],
  );
  const matches = useMemo(() => findThreadMatches(rows, pattern), [rows, pattern]);
  const activeIndex = active
    ? matches.findIndex(
        (match) => match.rowId === active.rowId && match.occurrence === active.occurrence,
      )
    : -1;

  const latestRef = useRef({ rows, matches, pattern, active });
  latestRef.current = { rows, matches, pattern, active };
  const revealTokenRef = useRef(0);
  const paintFrameRef = useRef<number | null>(null);

  const paintHighlights = useCallback(() => {
    if (typeof CSS === "undefined" || !("highlights" in CSS)) return;
    const { matches, pattern, active } = latestRef.current;
    const state = listRef.current?.getState();
    if (!pattern || !state) {
      CSS.highlights.delete(MATCH_HIGHLIGHT);
      CSS.highlights.delete(CURRENT_HIGHLIGHT);
      return;
    }
    const others: Range[] = [];
    let current: Range | undefined;
    for (const rowId of new Set(matches.map((match) => match.rowId))) {
      const index = state.indexByKey(rowId);
      const element: unknown = index === undefined ? undefined : state.elementAtIndex(index);
      if (!(element instanceof HTMLElement)) continue;
      const ranges = findTextRanges(element, pattern);
      const currentIndex =
        active?.rowId === rowId ? Math.min(active.occurrence, ranges.length - 1) : -1;
      ranges.forEach((range, index) => {
        if (index === currentIndex) current = range;
        else others.push(range);
      });
    }
    CSS.highlights.set(MATCH_HIGHLIGHT, new Highlight(...others));
    CSS.highlights.set(CURRENT_HIGHLIGHT, current ? new Highlight(current) : new Highlight());
  }, [listRef]);

  const schedulePaint = useCallback(() => {
    if (paintFrameRef.current !== null) return;
    paintFrameRef.current = requestAnimationFrame(() => {
      paintFrameRef.current = null;
      paintHighlights();
    });
  }, [paintHighlights]);

  /** Scrolls the match into the upper third of the viewport, then repaints. */
  const reveal = useCallback(
    (match: ThreadFindMatch) => {
      const list = listRef.current;
      const rowIndex = latestRef.current.rows.findIndex((row) => row.id === match.rowId);
      if (!list || rowIndex < 0) return;
      const token = ++revealTokenRef.current;
      onManualNavigation();
      void Promise.resolve(
        list.scrollToIndex({ index: rowIndex, animated: false, viewPosition: 0.3 }),
      ).then(() => {
        // Row sizes settle over a few frames after an index jump; long rows
        // need the match itself, not the row top, brought into view.
        let frames = 0;
        const refine = () => {
          if (token !== revealTokenRef.current) return;
          const { pattern } = latestRef.current;
          const state = list.getState();
          const index = state.indexByKey(match.rowId);
          const element: unknown = index === undefined ? undefined : state.elementAtIndex(index);
          const viewport = list.getScrollableNode();
          if (pattern && element instanceof HTMLElement && viewport) {
            const ranges = findTextRanges(element, pattern);
            const range = ranges[Math.min(match.occurrence, ranges.length - 1)];
            if (range) {
              const rect = range.getBoundingClientRect();
              const bounds = viewport.getBoundingClientRect();
              if (rect.top < bounds.top + 80 || rect.bottom > bounds.bottom - 160) {
                void list.scrollToOffset({
                  offset: viewport.scrollTop + rect.top - bounds.top - bounds.height / 3,
                  animated: false,
                });
              }
            }
          }
          paintHighlights();
          if (++frames < 3) requestAnimationFrame(refine);
        };
        requestAnimationFrame(refine);
      });
    },
    [listRef, onManualNavigation, paintHighlights],
  );

  const select = useCallback(
    (index: number) => {
      const match = latestRef.current.matches[index];
      setActive(match ?? null);
      if (match) {
        latestRef.current.active = match;
        reveal(match);
      }
    },
    [reveal],
  );

  const step = useCallback(
    (delta: 1 | -1) => {
      const { matches, active, rows } = latestRef.current;
      const current = active
        ? matches.findIndex(
            (match) => match.rowId === active.rowId && match.occurrence === active.occurrence,
          )
        : -1;
      if (current < 0 && delta === 1) {
        select(initialMatchIndex(matches, rows, listRef.current?.getState().start ?? 0));
        return;
      }
      select(stepMatchIndex(current, delta, matches.length));
    },
    [listRef, select],
  );

  const close = useCallback(() => {
    revealTokenRef.current += 1;
    setOpen(false);
    setActive(null);
  }, []);

  // A new query jumps to the first match at or below the viewport.
  useEffect(() => {
    if (!open) return;
    const { matches, rows } = latestRef.current;
    select(initialMatchIndex(matches, rows, listRef.current?.getState().start ?? 0));
  }, [open, pattern, listRef, select]);

  // Rows mount, recycle, and stream text as the list scrolls; repaint after.
  useEffect(() => {
    if (!open || !pattern) {
      paintHighlights();
      return;
    }
    schedulePaint();
    const viewport = listRef.current?.getScrollableNode();
    if (!viewport) return;
    const observer = new MutationObserver(schedulePaint);
    observer.observe(viewport, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [open, pattern, matches, active, listRef, paintHighlights, schedulePaint]);

  useEffect(
    () => () => {
      if (paintFrameRef.current !== null) cancelAnimationFrame(paintFrameRef.current);
      if (typeof CSS !== "undefined" && "highlights" in CSS) {
        CSS.highlights.delete(MATCH_HIGHLIGHT);
        CSS.highlights.delete(CURRENT_HIGHLIGHT);
      }
    },
    [],
  );

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || isTerminalFocused() || isPreviewFocused()) return;
      if (isFindShortcut(event, "f") && !event.shiftKey) {
        event.preventDefault();
        setOpen(true);
        requestAnimationFrame(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        });
        return;
      }
      if (open && isFindShortcut(event, "g")) {
        event.preventDefault();
        step(event.shiftKey ? -1 : 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, step]);

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      step(event.shiftKey ? -1 : 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };

  if (!open) return null;

  const status =
    pattern === null
      ? ""
      : matches.length === 0
        ? "No results"
        : activeIndex >= 0
          ? `${activeIndex + 1}/${matches.length}`
          : `${matches.length} found`;

  return (
    <div
      className="absolute right-6 z-30 flex items-center gap-1 rounded-lg border bg-popover p-1 shadow-lg"
      style={{ top: "calc(var(--workspace-titlebar-scroll-fade-height, 0px) + 0.5rem)" }}
      role="search"
    >
      <style>{HIGHLIGHT_STYLES}</style>
      <Input
        ref={inputRef}
        size="compact"
        className="w-56"
        placeholder="Find in thread"
        aria-label="Find in thread"
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        onKeyDown={onInputKeyDown}
      />
      <span className="min-w-14 px-1 text-center text-muted-foreground text-xs tabular-nums">
        {status}
      </span>
      {loadEarlier && pattern ? (
        <Button
          size="compact"
          variant="ghost-muted"
          disabled={loadEarlier.loading}
          onClick={loadEarlier.onLoadEarlier}
          title="Earlier turns are not loaded, so they are not searched"
        >
          {loadEarlier.loading ? "Loading…" : "Search earlier"}
        </Button>
      ) : null}
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label="Previous match"
        disabled={matches.length === 0}
        onClick={() => step(-1)}
      >
        <ChevronUpIcon />
      </Button>
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label="Next match"
        disabled={matches.length === 0}
        onClick={() => step(1)}
      >
        <ChevronDownIcon />
      </Button>
      <Button size="icon-xs" variant="ghost" aria-label="Close find" onClick={close}>
        <XIcon />
      </Button>
    </div>
  );
}
