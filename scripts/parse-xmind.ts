import { createHash } from "node:crypto";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import type {
  Mindmap,
  MindmapSheet,
  MindmapSummary,
  MindmapTopic,
  ParseWarning,
  TopicKind,
} from "../src/types/mindmap.js";
import { XmindArchive } from "./archive.js";
import { extractImage, type Asset } from "./extract-assets.js";

type Raw = Record<string, any>;
const array = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];
const text = (v: any): string => {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.map(text).join("\n");
  return Object.entries(v)
    .filter(([k]) => !k.startsWith("@_"))
    .map(([k, val]) => text(val) + (["p", "div", "br"].includes(k) ? "\n" : ""))
    .join("");
};

export function parseSummaryRange(
  value: unknown,
  childCount: number,
): [number, number] {
  const match =
    typeof value === "string"
      ? /^\(\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(value)
      : null;
  if (!match) throw new Error(`无法识别概要范围：${JSON.stringify(value)}`);
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (start > end || end >= childCount)
    throw new Error(
      `概要范围 ${value} 超出 ${childCount} 个兄弟节点（索引两端均包含）`,
    );
  return [start, end];
}

export function safeLink(value: unknown): string | undefined {
  if (typeof value !== "string" || /[\u0000-\u0020\u007f]/.test(value))
    return undefined;
  try {
    const url = new URL(value);
    return ["https:", "http:", "mailto:"].includes(url.protocol)
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

function legacySheets(xml: string): Raw[] {
  if (/<!\s*(DOCTYPE|ENTITY)/i.test(xml))
    throw new Error("禁止 XML DTD 和外部实体");
  const valid = XMLValidator.validate(xml);
  if (valid !== true) throw new Error(`content.xml 损坏：${valid.err.msg}`);
  const doc = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false,
    processEntities: true,
    htmlEntities: true,
  }).parse(xml);
  const convert = (t: Raw): Raw => {
    const children: Raw = {};
    for (const group of array<Raw>(t.children?.topics)) {
      const kind = group["@_type"] || "attached";
      children[kind] = [
        ...(children[kind] || []),
        ...array<Raw>(group.topic).map(convert),
      ];
    }
    return {
      ...t,
      id: t["@_id"],
      title: text(t.title),
      branch: t["@_branch"],
      href: t["@_href"],
      children,
      notes: t.notes,
      labels: array(t.labels?.label).map(text),
      image: t.image
        ? {
            src: t.image["@_src"],
            width: t.image["@_width"],
            height: t.image["@_height"],
          }
        : undefined,
      summaries: array<Raw>(t.summaries?.summary).map((s) => ({
        ...s,
        id: s["@_id"],
        topicId: s["@_topic-id"],
        range: s["@_range"],
      })),
    };
  };
  return array<Raw>(doc["xmap-content"]?.sheet).map((s) => ({
    ...s,
    id: s["@_id"],
    title: text(s.title),
    rootTopic: convert(s.topic),
    relationships: array<Raw>(s.relationships?.relationship).map((r) => ({
      id: r["@_id"],
      end1Id: r["@_end1"],
      end2Id: r["@_end2"],
      title: text(r.title),
    })),
  }));
}

export async function parseXmind(
  buffer: Buffer,
  sourcePath: string,
): Promise<{ map: Mindmap; assets: Map<string, Asset> }> {
  const archive = await XmindArchive.open(buffer).catch((error) => {
    throw new Error(
      `${sourcePath}：${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  });
  const warnings: ParseWarning[] = [];
  const assets = new Map<string, Asset>();
  try {
    const format = archive.entries.has("content.json") ? "json" : "xml";
    if (format === "xml" && !archive.entries.has("content.xml"))
      throw new Error("文件不含 content.json 或 content.xml");
    let rawSheets: Raw[];
    if (format === "json") {
      const raw = JSON.parse(
        (await archive.read("content.json", 32 * 1024 ** 2)).toString("utf8"),
      );
      rawSheets = Array.isArray(raw) ? raw : raw.sheets;
    } else {
      rawSheets = legacySheets(
        (await archive.read("content.xml", 32 * 1024 ** 2)).toString("utf8"),
      );
    }
    if (!Array.isArray(rawSheets) || !rawSheets.length)
      throw new Error("没有可读取的画布");
    if (rawSheets.length > 200) throw new Error("画布超过 200 个");
    const sheets: MindmapSheet[] = [];
    const sheetIds = new Set<string>();
    let totalNodes = 0;
    for (const rawSheet of rawSheets) {
      const sheetId = String(rawSheet.id || "");
      if (!sheetId || sheetIds.has(sheetId))
        throw new Error("画布 ID 缺失或重复");
      sheetIds.add(sheetId);
      const topics: Record<string, MindmapTopic> = Object.create(null);
      const summaries: MindmapSummary[] = [];
      const rawTopics = new Map<string, Raw>();
      const warn = (code: string, message: string, topicId?: string) =>
        warnings.push({ code, message, sheetId, topicId });
      function visit(
        raw: Raw,
        parentId: string | null,
        kind: TopicKind,
        depth: number,
        order: number,
      ): string {
        if (!raw || typeof raw !== "object") throw new Error("节点结构损坏");
        if (depth > 128 || ++totalNodes > 50000)
          throw new Error("导图超过 128 层或 50000 个节点");
        const id = String(raw.id || "");
        if (!id || Object.hasOwn(topics, id))
          throw new Error(`节点 ID 缺失或重复：${id}`);
        if (raw.title != null && typeof raw.title !== "string")
          throw new Error(`节点 ${id} 的标题不是纯文本，无法保证文字完整性`);
        const { children: _children, ...source } = raw;
        const topic: MindmapTopic = {
          id,
          title: raw.title ?? "",
          parentId,
          kind,
          depth,
          order,
          children: [],
          auxiliary: [],
          folded: raw.branch === "folded",
          labels: array(raw.labels).map(text),
          source,
        };
        topics[id] = topic;
        rawTopics.set(id, raw);
        if (raw.notes)
          topic.notes =
            typeof raw.notes === "string"
              ? raw.notes
              : text(
                  raw.notes.plain?.content ??
                    raw.notes.html?.content ??
                    raw.notes,
                );
        if (raw.href) {
          topic.href = safeLink(raw.href);
          if (!topic.href)
            warn("UNSUPPORTED_LINK", `超链接协议未获支持：${raw.href}`, id);
        }
        const children = raw.children || {};
        for (const [childKind, nodes] of Object.entries(children)) {
          if (!Array.isArray(nodes))
            throw new Error(`节点 ${id} 的 ${childKind} 子节点不是数组`);
          if (
            !["attached", "summary", "detached", "callout"].includes(childKind)
          )
            warn(
              "CHILD_KIND",
              `未知主题类型 ${childKind}，作为独立主题保留`,
              id,
            );
          for (const [index, child] of nodes.entries()) {
            const knownKind = [
              "attached",
              "summary",
              "detached",
              "callout",
            ].includes(childKind)
              ? (childKind as TopicKind)
              : "detached";
            const childId = visit(child, id, knownKind, depth + 1, index);
            if (knownKind === "attached") topic.children.push(childId);
            else if (knownKind !== "summary") topic.auxiliary.push(childId);
          }
        }
        if (raw.boundaries?.length || raw.boundaries?.boundary)
          warn("BOUNDARY", "边界原始数据已保留；当前未绘制边界框", id);
        if (raw.markers?.length || raw.extensions?.length)
          warn("ANNOTATION", "图标或扩展元数据已保留；当前不还原其外观", id);
        return id;
      }
      const rootId = visit(rawSheet.rootTopic, null, "root", 0, 0);
      const summaryIds = new Set<string>();
      const linkedSummaryTopics = new Set<string>();
      for (const [id, raw] of rawTopics) {
        const owner = topics[id];
        for (const s of array<Raw>(raw.summaries)) {
          const topicId = String(s.topicId || "");
          const summaryId = String(s.id || "");
          if (!summaryId || summaryIds.has(summaryId))
            throw new Error(`概要 ID 缺失或重复：${summaryId}`);
          if (
            !Object.hasOwn(topics, topicId) ||
            topics[topicId].kind !== "summary" ||
            topics[topicId].parentId !== id ||
            linkedSummaryTopics.has(topicId)
          )
            throw new Error(
              `概要 ${summaryId} 的主题引用缺失、重复或不属于该父节点`,
            );
          const [startIndex, endIndex] = parseSummaryRange(
            s.range,
            owner.children.length,
          );
          const summary: MindmapSummary = {
            id: summaryId,
            topicId,
            parentId: id,
            startIndex,
            endIndex,
            coveredNodeIds: owner.children.slice(startIndex, endIndex + 1),
          };
          summaries.push(summary);
          summaryIds.add(summaryId);
          linkedSummaryTopics.add(topicId);
        }
        if (raw.image) {
          owner.image = await extractImage(
            archive,
            String(raw.image.src || ""),
            assets,
          );
          if (owner.image.error) warn("IMAGE", owner.image.error, id);
        }
      }
      for (const topic of Object.values(topics)) {
        if (topic.kind === "summary" && !linkedSummaryTopics.has(topic.id)) {
          topics[topic.parentId!].auxiliary.push(topic.id);
          warn(
            "ORPHAN_SUMMARY",
            "概要主题没有范围，作为独立主题显示；不会猜测概要覆盖关系",
            topic.id,
          );
        }
      }
      const relationships: MindmapSheet["relationships"] = [];
      for (const [index, r] of array<Raw>(rawSheet.relationships).entries()) {
        if (Object.hasOwn(topics, r.end1Id) && Object.hasOwn(topics, r.end2Id))
          relationships.push({
            id: String(r.id || `relationship-${index}`),
            source: r.end1Id,
            target: r.end2Id,
            title: String(r.title || ""),
          });
        else warn("RELATIONSHIP", "关系线端点不存在，原始关系数据已保留");
      }
      const { rootTopic: _root, ...sheetSource } = rawSheet;
      sheets.push({
        id: sheetId,
        title: String(rawSheet.title ?? ""),
        rootId,
        topics,
        summaries,
        relationships,
        source: sheetSource,
      });
    }
    const normalizedPath = sourcePath.replaceAll("\\", "/");
    const parts = normalizedPath.split("/");
    const id = createHash("sha256")
      .update(`${sheets[0].id}\0${sheets[0].rootId}`)
      .digest("hex")
      .slice(0, 20);
    return {
      map: {
        schemaVersion: 1,
        id,
        name: parts.at(-1)!.replace(/\.xmind$/i, ""),
        folder: parts.slice(0, -1).join("/"),
        sourcePath: normalizedPath,
        sha256: createHash("sha256").update(buffer).digest("hex"),
        format,
        sheets,
        warnings,
      },
      assets,
    };
  } catch (error) {
    throw new Error(
      `${sourcePath}：${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  } finally {
    archive.close();
  }
}
