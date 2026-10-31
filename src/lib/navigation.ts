import type { MindmapSheet } from "../types/mindmap";

export function descendants(sheet: MindmapSheet, id: string): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  const summaries = new Map<string, string[]>();
  for (const s of sheet.summaries)
    summaries.set(s.parentId, [
      ...(summaries.get(s.parentId) || []),
      s.topicId,
    ]);
  function walk(key: string) {
    if (seen.has(key)) return;
    seen.add(key);
    const t = sheet.topics[key];
    if (!t) return;
    for (const child of [
      ...t.children,
      ...t.auxiliary,
      ...(summaries.get(key) || []),
    ]) {
      result.push(child);
      walk(child);
    }
  }
  walk(id);
  return result;
}
export function ancestors(sheet: MindmapSheet, id: string): string[] {
  const ids: string[] = [];
  let current = sheet.topics[id]?.parentId;
  while (current) {
    ids.push(current);
    current = sheet.topics[current]?.parentId;
  }
  return ids;
}
export function collapseToDepth(sheet: MindmapSheet, depth: number): string[] {
  return Object.values(sheet.topics)
    .filter(
      (t) =>
        t.depth >= depth &&
        (t.children.length ||
          t.auxiliary.length ||
          sheet.summaries.some((s) => s.parentId === t.id)),
    )
    .map((t) => t.id);
}
export function initialCollapsed(sheet: MindmapSheet): string[] {
  const originals = Object.values(sheet.topics)
    .filter((t) => t.folded)
    .map((t) => t.id);
  return [
    ...new Set([
      ...originals,
      ...(Object.keys(sheet.topics).length > 200
        ? collapseToDepth(sheet, 2)
        : []),
    ]),
  ];
}
export function searchTopics(sheet: MindmapSheet, query: string): string[] {
  const normalized = query.trim().toLocaleLowerCase();
  return normalized
    ? Object.values(sheet.topics)
        .filter((t) =>
          `${t.title}\n${t.notes || ""}`
            .toLocaleLowerCase()
            .includes(normalized),
        )
        .map((t) => t.id)
    : [];
}
export function readRoute(): {
  mapId?: string;
  sheetId?: string;
  nodeId?: string;
} {
  const [route, query = ""] = location.hash.slice(1).split("?");
  const match = /^\/map\/([a-z0-9-]+)$/i.exec(route);
  const params = new URLSearchParams(query);
  return {
    mapId: match?.[1],
    sheetId: params.get("sheet") || undefined,
    nodeId: params.get("node") || undefined,
  };
}
export function mapHash(id: string, sheetId?: string, nodeId?: string): string {
  const p = new URLSearchParams();
  if (sheetId) p.set("sheet", sheetId);
  if (nodeId) p.set("node", nodeId);
  return `#/map/${id}${p.size ? `?${p}` : ""}`;
}
export function assetUrl(path: string) {
  return `${import.meta.env.BASE_URL}${path}`;
}
export async function copyText(value: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const box = document.createElement("textarea");
  box.value = value;
  box.style.position = "fixed";
  box.style.opacity = "0";
  document.body.append(box);
  box.select();
  const ok = document.execCommand("copy");
  box.remove();
  if (!ok) throw new Error("浏览器不允许复制，请手动选中文字");
}
