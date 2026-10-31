import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import sharp from "sharp";
import { layoutMindmap, type LayoutResult } from "../src/lib/layout";
import {
  ancestors,
  collapseToDepth,
  descendants,
  searchTopics,
} from "../src/lib/navigation";
import { parseXmind } from "../scripts/parse-xmind";
import { dimensions, modernZip, zip } from "./fixtures";
import type { Mindmap, MindmapSheet } from "../src/types/mindmap";

function validate(sheet: MindmapSheet, result: LayoutResult) {
  const nodes = result.nodes;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const n of nodes) {
    const p = sheet.topics[n.id].parentId;
    if (p && byId.has(p))
      expect(n.x).toBeGreaterThan(byId.get(p)!.x + byId.get(p)!.width);
  }
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i],
        b = nodes[j];
      expect(
        a.x + a.width <= b.x + 0.1 ||
          b.x + b.width <= a.x + 0.1 ||
          a.y + a.height <= b.y + 0.1 ||
          b.y + b.height <= a.y + 0.1,
        `${a.id} 与 ${b.id} 重叠`,
      ).toBe(true);
    }
  for (const b of result.brackets) {
    const source = sheet.summaries.find((s) => s.id === b.id)!;
    expect(b.coveredNodeIds).toEqual(source.coveredNodeIds);
    const target = byId.get(b.topicId)!;
    expect(target.x).toBeGreaterThan(b.x);
    expect(Math.abs(target.y + target.height / 2 - b.center)).toBeLessThan(0.1);
    for (const id of b.coveredNodeIds) {
      const n = byId.get(id)!;
      expect(n.x + n.width).toBeLessThan(b.x);
      expect(n.y + n.height).toBeGreaterThan(b.top);
      expect(n.y).toBeLessThan(b.bottom);
    }
  }
}
describe("概要约束布局", () => {
  it("部分范围、并存、嵌套、单节点范围、长概要及其后代均向右且不重叠", async () => {
    const { map } = await parseXmind(modernZip(), "test.xmind");
    const s = map.sheets[0];
    const result = layoutMindmap({
      sheet: s,
      sizes: dimensions(s),
      collapsed: [],
      spacing: 28,
    });
    validate(s, result);
    expect(result.brackets).toHaveLength(3);
    expect(result.nodes).toHaveLength(Object.keys(s.topics).length);
  });
  it("折叠被概括分支缩短跨度，折叠父节点隐藏所属概要", async () => {
    const { map } = await parseXmind(modernZip(), "test.xmind");
    const s = map.sheets[0];
    const sizes = dimensions(s);
    const full = layoutMindmap({ sheet: s, sizes, collapsed: [], spacing: 28 });
    const partial = layoutMindmap({
      sheet: s,
      sizes,
      collapsed: ["a", "b"],
      spacing: 28,
    });
    validate(s, partial);
    expect(partial.nodes.some((n) => n.id === "a1")).toBe(false);
    expect(partial.brackets).toHaveLength(3);
    expect(partial.height).toBeLessThanOrEqual(full.height);
    const root = layoutMindmap({
      sheet: s,
      sizes,
      collapsed: ["root"],
      spacing: 28,
    });
    expect(root.nodes).toHaveLength(1);
    expect(root.brackets).toHaveLength(0);
    const summary = layoutMindmap({
      sheet: s,
      sizes,
      collapsed: ["sum-outer"],
      spacing: 28,
    });
    expect(summary.nodes.some((n) => n.id === "sum-desc")).toBe(false);
    expect(summary.brackets).toHaveLength(3);
  });
  it("搜索全数据，查找折叠概要后代；展开路径与分支包含概要节点", async () => {
    const { map } = await parseXmind(modernZip(), "a.xmind");
    const s = map.sheets[0];
    expect(searchTopics(s, "隐藏节点")).toEqual(["a1"]);
    expect(ancestors(s, "sum-desc")).toEqual(["sum-outer", "root"]);
    expect(descendants(s, "root")).toContain("sum-desc");
    expect(collapseToDepth(s, 0)).toContain("sum-outer");
  });
  it("全部 18 份真实导图完全展开及折叠后均无节点重叠，所有概要范围准确", async () => {
    const catalog = JSON.parse(
      await fs.readFile("public/data/index.json", "utf8"),
    );
    for (const entry of catalog.maps) {
      const map: Mindmap = JSON.parse(
        await fs.readFile(`public/${entry.dataUrl}`, "utf8"),
      );
      for (const s of map.sheets) {
        for (const collapsed of [[], collapseToDepth(s, 2)]) {
          const result = layoutMindmap({
            sheet: s,
            sizes: dimensions(s),
            collapsed,
            spacing: 28,
          });
          validate(s, result);
          if (!collapsed.length)
            expect(result.nodes).toHaveLength(Object.keys(s.topics).length);
        }
      }
    }
  });
  it("500 节点、15 层深度及数十 MiB 原文件的合成压力样本", async () => {
    let seed = 12345678;
    const noise = Buffer.alloc(24 * 1024 ** 2);
    for (let i = 0; i < noise.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      noise[i] = seed >>> 24;
    }
    const root: any = {
      id: "r",
      title: "压力样本",
      children: { attached: [], summary: [] },
    };
    let parent = root;
    let index = 1;
    for (let level = 1; level <= 14; level++) {
      const child: any = {
        id: `n${index++}`,
        title: `第${level}层\n` + "长文本知识。".repeat(30),
        children: { attached: [] },
      };
      parent.children.attached.push(child);
      parent = child;
    }
    while (index < 499)
      root.children.attached.push({
        id: `n${index++}`,
        title: `知识节点 ${index}`,
      });
    root.children.summary.push({
      id: "sum",
      title: "大型概要",
      children: { attached: [{ id: "sumchild", title: "概要后代" }] },
    });
    root.summaries = [{ id: "s", topicId: "sum", range: "(0,12)" }];
    const largeImage = await sharp(noise, {
      raw: { width: 4096, height: 2048, channels: 3 },
    })
      .png({ compressionLevel: 0 })
      .toBuffer();
    root.children.attached[0].image = { src: "xap:resources/中文 大图.png" };
    const buffer = zip({
      "content.json": JSON.stringify([
        { id: "stress", title: "压力测试", rootTopic: root },
      ]),
      "resources/中文 大图.png": largeImage,
    });
    expect(buffer.length).toBeGreaterThan(24 * 1024 ** 2);
    const parseStart = performance.now();
    const parsed = await parseXmind(buffer, "stress.xmind");
    const parseMs = performance.now() - parseStart;
    const s = parsed.map.sheets[0];
    expect(Object.keys(s.topics)).toHaveLength(501);
    expect(Math.max(...Object.values(s.topics).map((t) => t.depth))).toBe(14);
    expect(parsed.map.warnings).toHaveLength(0);
    expect(s.topics.n1.image?.width).toBe(4096);
    expect(parsed.assets.size).toBe(1);
    const result = layoutMindmap({
      sheet: s,
      sizes: dimensions(s),
      collapsed: [],
      spacing: 28,
    });
    validate(s, result);
    expect(result.duration).toBeLessThan(1000);
    console.info(
      JSON.stringify({
        sample: "501 nodes / 15 levels / 24 MiB embedded PNG",
        archiveBytes: buffer.length,
        parseMs: Math.round(parseMs),
        layoutMs: Math.round(result.duration * 100) / 100,
      }),
    );
  });
});
