import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  parseXmind,
  parseSummaryRange,
  safeLink,
} from "../scripts/parse-xmind";
import { safeArchivePath } from "../scripts/archive";
import { modernZip, rawSheets, tinyPng, zip } from "./fixtures";
import type { Mindmap } from "../src/types/mindmap";

describe("现代 Xmind 与概要语义", () => {
  it("保留标题、换行、独立画布、图片、备注及链接", async () => {
    const { map, assets } = await parseXmind(
      modernZip(),
      "中文目录/第五章脂质.xmind",
    );
    expect(map.sheets).toHaveLength(2);
    expect(map.sheets[0].title).toBe("第一画布（不能改）");
    expect(map.sheets[0].topics.root.title).toBe("第五章脂质\n章节原文！");
    expect(map.sheets[1].topics.root.title).toBe("独立画布，同 ID 不合并");
    expect(map.sheets[0].topics.a.notes).toBe("保留备注\n第二段");
    expect(map.sheets[0].topics.a.href).toContain("https://example.com");
    expect(map.sheets[0].topics.a.image?.url).toMatch(
      /^data\/assets\/[a-f0-9]{64}\.png$/,
    );
    expect(assets.size).toBe(1);
    expect(map.warnings).toHaveLength(0);
  });
  it("包含两端的范围、嵌套及部分范围；概要不混入普通子节点", async () => {
    const { map } = await parseXmind(modernZip(), "a.xmind");
    const s = map.sheets[0];
    expect(s.topics.root.children).toEqual(["a", "b", "c", "d"]);
    expect(s.summaries.map((s) => s.coveredNodeIds)).toEqual([
      ["a", "b", "c"],
      ["b"],
      ["c", "d"],
    ]);
    expect(s.topics["sum-outer"].children).toEqual(["sum-desc"]);
    expect(s.topics["sum-outer"].title.length).toBe(150);
  });
  it("文件名、文件夹或正文修改不影响身份；原始章节字符串不归一化", async () => {
    const a = await parseXmind(modernZip(), "原路径/（完结）_副本.xmind");
    const data = rawSheets();
    data[0].rootTopic.title = "更新内容";
    const b = await parseXmind(
      zip({ "content.json": JSON.stringify(data) }),
      "新路径/干净名字.xmind",
    );
    expect(a.map.id).toBe(b.map.id);
  });
  it.each(["(0,4)", "(3,1)", "[-1,2]", "(a,b)", undefined])(
    "非法概要范围明确报错：%s",
    (range) => {
      expect(() => parseSummaryRange(range, 4)).toThrow();
    },
  );
  it("缺少概要引用时报错，不猜测覆盖范围", async () => {
    const data = rawSheets();
    data[0].rootTopic.summaries![0].topicId = "missing";
    await expect(
      parseXmind(zip({ "content.json": JSON.stringify(data) }), "broken.xmind"),
    ).rejects.toThrow("引用");
  });
});

describe("旧版 XML", () => {
  it("解析命名空间、多画布、概要、折叠、图片、备注与换行", async () => {
    const xml = `<?xml version="1.0"?><xmap-content xmlns="urn:xmind:xmap:xmlns:content:2.0" xmlns:xhtml="http://www.w3.org/1999/xhtml"><sheet id="s1"><title>旧画布</title><topic id="r" branch="folded"><title>第一章 &amp; 原文&#10;第二行</title><children><topics type="attached"><topic id="a"><title>甲</title><image xhtml:src="xap:resources/p.png"/><notes><plain><![CDATA[备注\n原文]]></plain></notes></topic><topic id="b"><title>乙</title></topic></topics><topics type="summary"><topic id="st"><title>概要</title><children><topics type="attached"><topic id="sc"><title>概要后代</title></topic></topics></children></topic></topics></children><summaries><summary id="su" topic-id="st" range="(0,1)"/></summaries></topic></sheet><sheet id="s2"><title>第二张</title><topic id="r"><title>独立</title></topic></sheet></xmap-content>`;
    const { map } = await parseXmind(
      zip({ "content.xml": xml, "resources/p.png": tinyPng }),
      "旧版.xmind",
    );
    expect(map.format).toBe("xml");
    expect(map.sheets).toHaveLength(2);
    const s = map.sheets[0];
    expect(s.topics.r.title).toBe("第一章 & 原文\n第二行");
    expect(s.topics.r.folded).toBe(true);
    expect(s.topics.a.notes).toBe("备注\n原文");
    expect(s.topics.a.image?.error).toBeUndefined();
    expect(s.summaries[0].coveredNodeIds).toEqual(["a", "b"]);
  });
});

describe("不可信归档与资源", () => {
  it.each(["../escape.png", "/abs.png", "C:/escape.png", "a/../b", "a\\b"])(
    "拒绝危险路径 %s",
    (p) => expect(() => safeArchivePath(p)).toThrow(),
  );
  it("损坏 ZIP、JSON、XML、重复节点均明确报错", async () => {
    await expect(
      parseXmind(Buffer.from("not zip"), "坏文件.xmind"),
    ).rejects.toThrow();
    await expect(
      parseXmind(zip({ "content.json": "{" }), "坏文件.xmind"),
    ).rejects.toThrow("坏文件");
    await expect(
      parseXmind(zip({ "content.xml": "<broken>" }), "坏文件.xmind"),
    ).rejects.toThrow();
    const raw = rawSheets();
    raw[0].rootTopic.children!.attached![1].id = "a";
    await expect(
      parseXmind(zip({ "content.json": JSON.stringify(raw) }), "重复.xmind"),
    ).rejects.toThrow("重复");
  });
  it("CRC 校验拒绝内容已被改写的归档条目", async () => {
    const buffer = zip({ "content.json": "[]" });
    buffer[30 + Buffer.byteLength("content.json")] = 32;
    await expect(parseXmind(buffer, "crc.xmind")).rejects.toThrow("CRC-32");
  });
  it("拒绝目录穿越 ZIP、压缩炸弹、超大声明、XML 实体", async () => {
    await expect(
      parseXmind(zip({ "../evil": "a", "content.json": "[]" }), "evil.xmind"),
    ).rejects.toThrow();
    await expect(
      parseXmind(
        zip({ "content.json": Buffer.alloc(2 * 1024 ** 2, 32) }, true),
        "bomb.xmind",
      ),
    ).rejects.toThrow("压缩比");
    const declared = zip({ "content.json": "[]" }, true);
    const cd = declared.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    declared.writeUInt32LE(65 * 1024 ** 2, cd + 24);
    await expect(parseXmind(declared, "large.xmind")).rejects.toThrow("体积");
    await expect(
      parseXmind(
        zip({
          "content.xml":
            '<!DOCTYPE x [<!ENTITY steal SYSTEM "file:///private">]><x/>',
        }),
        "entity.xmind",
      ),
    ).rejects.toThrow("实体");
  });
  it.each([
    "javascript:alert(1)",
    "data:text/html,evil",
    "file:///private",
    "//example.com",
    "java\nscript:evil",
  ])("阻止活动链接 %s", (url) => expect(safeLink(url)).toBeUndefined());
  it("SVG、损坏图片、缺失资源均报告明确占位原因", async () => {
    for (const [source, value] of [
      ["resources/p.svg", '<svg onload="alert(1)"></svg>'],
      ["resources/p.png", "bad-image"],
      ["resources/missing.png", undefined],
    ] as const) {
      const data = [
        {
          id: "s",
          rootTopic: {
            id: "r",
            title: "安全文字 <script>alert(1)</script>",
            image: { src: `xap:${source}` },
          },
        },
      ];
      const { map } = await parseXmind(
        zip({
          "content.json": JSON.stringify(data),
          ...(value ? { [source]: value } : {}),
        }),
        "图片.xmind",
      );
      expect(map.warnings[0].code).toBe("IMAGE");
      expect(map.sheets[0].topics.r.image?.error).toBeTruthy();
      expect(map.sheets[0].topics.r.title).toContain("<script>");
    }
  });
});

describe("18 份真实文件与重命名完整性", () => {
  it("每个节点标题、画布名称、图片及概要范围逐项对照源归档，重命名后内容哈希一致", async () => {
    const records = JSON.parse(
      await fs.readFile("docs/file-renames.json", "utf8"),
    ) as { from: string; to: string; sha256: string }[];
    expect(records).toHaveLength(18);
    let count = 0,
      images = 0,
      summaries = 0;
    for (const record of records) {
      const buffer = await fs.readFile(path.join("maps", record.to));
      expect(createHash("sha256").update(buffer).digest("hex")).toBe(
        record.sha256,
      );
      expect(record.to).not.toMatch(/完结|_副本|整理完成/);
      const { map } = await parseXmind(buffer, record.to);
      const { XmindArchive } = await import("../scripts/archive");
      const archive = await XmindArchive.open(buffer);
      const raw = JSON.parse((await archive.read("content.json")).toString());
      archive.close();
      for (let i = 0; i < raw.length; i++) {
        const sheet = map.sheets[i];
        expect(sheet.title).toBe(raw[i].title);
        const walk = (t: any) => {
          expect(sheet.topics[t.id].title).toBe(t.title);
          count++;
          if (t.image) {
            images++;
            expect(sheet.topics[t.id].image?.error).toBeUndefined();
          }
          for (const summary of t.summaries || []) {
            summaries++;
            const parsed = sheet.summaries.find((s) => s.id === summary.id)!;
            const [start, end] = parseSummaryRange(
              summary.range,
              t.children.attached.length,
            );
            expect(parsed.coveredNodeIds).toEqual(
              t.children.attached.slice(start, end + 1).map((c: any) => c.id),
            );
            expect(parsed.topicId).toBe(summary.topicId);
          }
          for (const children of Object.values(t.children || {}) as any[][])
            children.forEach(walk);
        };
        walk(raw[i].rootTopic);
      }
      expect(map.warnings).toHaveLength(0);
      if (record.to.includes("第五章脂质"))
        expect([
          Object.keys(map.sheets[0].topics).length,
          map.sheets[0].summaries.length,
        ]).toEqual([334, 7]);
      if (record.to.includes("第二章微生物主要类群及形态结构"))
        expect(Object.keys(map.sheets[0].topics)).toHaveLength(367);
    }
    expect([count, images, summaries]).toEqual([3465, 15, 53]);
  });
});
