import { deflateRawSync } from "node:zlib";
import type { MindmapSheet } from "../src/types/mindmap";

export function zip(
  entries: Record<string, string | Buffer>,
  deflate = false,
): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  function crc(buffer: Buffer) {
    let value = 0xffffffff;
    for (const b of buffer) {
      value ^= b;
      for (let j = 0; j < 8; j++)
        value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    }
    return (value ^ 0xffffffff) >>> 0;
  }
  for (const [file, value] of Object.entries(entries)) {
    const name = Buffer.from(file);
    const bytes = typeof value === "string" ? Buffer.from(value) : value;
    const packed = deflate ? deflateRawSync(bytes) : bytes;
    const checksum = crc(bytes);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(bytes.length, 22);
    local.writeUInt16LE(name.length, 26);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(20, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(0x800, 8);
    record.writeUInt16LE(deflate ? 8 : 0, 10);
    record.writeUInt32LE(checksum, 16);
    record.writeUInt32LE(packed.length, 20);
    record.writeUInt32LE(bytes.length, 24);
    record.writeUInt16LE(name.length, 28);
    record.writeUInt32LE(offset, 42);
    locals.push(local, name, packed);
    central.push(record, name);
    offset += local.length + name.length + packed.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

export const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWMoXvv/PwgzwBgAbF4MeRl3GicAAAAASUVORK5CYII=",
  "base64",
);
export function rawSheets() {
  return [
    {
      id: "sheet-one",
      title: "第一画布（不能改）",
      rootTopic: {
        id: "root",
        title: "第五章脂质\n章节原文！",
        children: {
          attached: [
            {
              id: "a",
              title: "节点A：α + β",
              image: { src: "xap:resources/中文 空格%23图片.png" },
              notes: { plain: { content: "保留备注\n第二段" } },
              href: "https://example.com/page?a=1&b=2",
              children: {
                attached: [{ id: "a1", title: "隐藏节点：搜索应找到" }],
              },
            },
            {
              id: "b",
              title: "节点B\n第二行",
              children: { attached: [{ id: "b1", title: "更深层知识" }] },
            },
            { id: "c", title: "节点C" },
            { id: "d", title: "节点D，不属于短范围" },
          ],
          summary: [
            {
              id: "sum-outer",
              title: "长概要".repeat(50),
              children: {
                attached: [{ id: "sum-desc", title: "概要后续节点" }],
              },
            },
            { id: "sum-inner", title: "部分范围概要" },
            { id: "sum-third", title: "并存概要" },
          ],
        },
        summaries: [
          { id: "outer", topicId: "sum-outer", range: "(0,2)" },
          { id: "inner", topicId: "sum-inner", range: "(1,1)" },
          { id: "third", topicId: "sum-third", range: "(2,3)" },
        ],
      },
    },
    {
      id: "sheet-two",
      title: "第二画布",
      rootTopic: {
        id: "root",
        title: "独立画布，同 ID 不合并",
        children: { attached: [{ id: "a", title: "第二画布搜索词" }] },
      },
    },
  ];
}
export function modernZip() {
  return zip({
    "content.json": JSON.stringify(rawSheets()),
    "resources/中文 空格#图片.png": tinyPng,
  });
}
export function dimensions(sheet: MindmapSheet) {
  return Object.fromEntries(
    Object.values(sheet.topics).map((t) => [
      t.id,
      {
        width: t.title.length > 40 ? 336 : 180,
        height: t.title.length > 40 ? 220 : 70,
      },
    ]),
  );
}
