import type { MindmapSheet, MindmapTopic } from "../types/mindmap";

export interface Size {
  width: number;
  height: number;
}
export interface PlacedTopic extends Size {
  id: string;
  x: number;
  y: number;
  branch: number;
}
export interface Bracket {
  id: string;
  topicId: string;
  parentId: string;
  coveredNodeIds: string[];
  x: number;
  top: number;
  bottom: number;
  center: number;
  targetX: number;
  branch: number;
}
export interface LayoutResult {
  nodes: PlacedTopic[];
  brackets: Bracket[];
  width: number;
  height: number;
  duration: number;
}
export interface LayoutInput {
  sheet: MindmapSheet;
  sizes: Record<string, Size>;
  collapsed: string[];
  spacing: number;
}
interface Block {
  nodes: PlacedTopic[];
  brackets: Bracket[];
  width: number;
  height: number;
}

/** Summary-aware recursive bands. Each subtree occupies a disjoint rectangle.
 * Reserve a vertical band before placing summaries, then assign each summary its
 * own right-hand lane. Inclusive ranges use semantic IDs, never spatial guesses.
 */
export function layoutMindmap({
  sheet,
  sizes,
  collapsed: hidden,
  spacing,
}: LayoutInput): LayoutResult {
  const start = performance.now();
  const collapsed = new Set(hidden);
  const owned = new Map<string, typeof sheet.summaries>();
  for (const s of sheet.summaries)
    owned.set(s.parentId, [...(owned.get(s.parentId) || []), s]);
  const verticalGap = Math.max(20, spacing);
  const horizontalGap = Math.max(64, spacing * 2);

  function shift(block: Block, x: number, y: number) {
    for (const n of block.nodes) {
      n.x += x;
      n.y += y;
    }
    for (const b of block.brackets) {
      b.x += x;
      b.targetX += x;
      b.top += y;
      b.bottom += y;
      b.center += y;
    }
  }
  function build(topic: MindmapTopic, branch: number): Block {
    const size = sizes[topic.id] || { width: 220, height: 60 };
    const node: PlacedTopic = { id: topic.id, ...size, x: 0, y: 0, branch };
    if (collapsed.has(topic.id))
      return { nodes: [node], brackets: [], ...size };
    const childIds = [...topic.children, ...topic.auxiliary];
    if (!childIds.length) return { nodes: [node], brackets: [], ...size };
    const blocks = childIds.map((id, i) =>
      build(sheet.topics[id], topic.kind === "root" ? i : branch),
    );
    const bands = blocks.map((b) => b.height);
    const summaries = (owned.get(topic.id) || [])
      .map((s) => ({
        s,
        block: build(sheet.topics[s.topicId], branch),
        top: 0,
        bottom: 0,
      }))
      .sort(
        (a, b) =>
          a.s.endIndex - a.s.startIndex - (b.s.endIndex - b.s.startIndex) ||
          a.s.startIndex - b.s.startIndex,
      );
    for (const { s, block } of summaries) {
      const count = s.endIndex - s.startIndex + 1;
      const available =
        bands.slice(s.startIndex, s.endIndex + 1).reduce((n, h) => n + h, 0) +
        verticalGap * (count - 1);
      const extra = Math.max(0, block.height + 24 - available);
      for (let i = s.startIndex; i <= s.endIndex; i++)
        bands[i] += extra / count;
    }
    const totalHeight = Math.max(
      size.height,
      bands.reduce((n, h) => n + h, 0) + (bands.length - 1) * verticalGap,
    );
    let cursor =
      (totalHeight -
        (bands.reduce((n, h) => n + h, 0) + (bands.length - 1) * verticalGap)) /
      2;
    const starts: number[] = [];
    const nodes = [node];
    const brackets: Bracket[] = [];
    for (let i = 0; i < blocks.length; i++) {
      starts.push(cursor);
      const block = blocks[i];
      shift(
        block,
        size.width + horizontalGap,
        cursor + (bands[i] - block.height) / 2,
      );
      nodes.push(...block.nodes);
      brackets.push(...block.brackets);
      cursor += bands[i] + verticalGap;
    }
    node.y = (totalHeight - size.height) / 2;
    let right =
      size.width + horizontalGap + Math.max(...blocks.map((b) => b.width));
    for (const { s, block } of summaries) {
      const top = starts[s.startIndex];
      const bottom = starts[s.endIndex] + bands[s.endIndex];
      const center = (top + bottom) / 2;
      const x = right + 32;
      const targetX = x + 52;
      shift(block, targetX, center - block.height / 2);
      brackets.push({
        id: s.id,
        topicId: s.topicId,
        parentId: s.parentId,
        coveredNodeIds: s.coveredNodeIds,
        x,
        top: top + 4,
        bottom: bottom - 4,
        center,
        targetX,
        branch,
      });
      nodes.push(...block.nodes);
      brackets.push(...block.brackets);
      right = targetX + block.width;
    }
    return { nodes, brackets, width: right, height: totalHeight };
  }
  const block = build(sheet.topics[sheet.rootId], 0);
  return { ...block, duration: performance.now() - start };
}

export function bracketPath(b: Bracket): string {
  const { x, top: t, bottom: d, center: c } = b;
  const r = Math.min(12, (d - t) / 4);
  return `M ${x - 14} ${t} Q ${x} ${t} ${x} ${t + r} L ${x} ${c - r} Q ${x} ${c} ${x + 12} ${c} Q ${x} ${c} ${x} ${c + r} L ${x} ${d - r} Q ${x} ${d} ${x - 14} ${d}`;
}
