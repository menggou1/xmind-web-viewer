import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { parseXmind } from "./parse-xmind.js";
import type { Catalog, CatalogEntry } from "../src/types/mindmap.js";

const root = process.cwd();
const mapsRoot = path.join(root, "maps");
const dataRoot = path.join(root, "public", "data");
const stage = path.join(root, "public", `.data-stage-${process.pid}`);
for (const target of [dataRoot, stage]) {
  if (
    path.dirname(path.resolve(target)) !== path.resolve(root, "public") ||
    !/^(data|\.data-stage-\d+)$/.test(path.basename(target))
  )
    throw new Error(`生成目录边界检查失败：${target}`);
}
async function scan(dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (e.isSymbolicLink()) throw new Error(`maps/ 不允许符号链接：${e.name}`);
    if (e.isDirectory()) found.push(...(await scan(path.join(dir, e.name))));
    else if (/\.xmind$/i.test(e.name)) found.push(path.join(dir, e.name));
  }
  return found.sort((a, b) => a.localeCompare(b, "zh-CN", { numeric: true }));
}
await fs.mkdir(path.join(stage, "assets"), { recursive: true });
const maps: CatalogEntry[] = [];
const ids = new Set<string>();
const report: any[] = [];
try {
  for (const file of await scan(mapsRoot)) {
    const relative = path.relative(mapsRoot, file).replaceAll("\\", "/");
    const buffer = await fs.readFile(file);
    const start = performance.now();
    const { map, assets } = await parseXmind(buffer, relative);
    const parseMs = Math.round(performance.now() - start);
    if (ids.has(map.id))
      throw new Error(
        `导图身份冲突：${relative} 与另一文件具有相同首画布及根节点 ID；请移除重复文件或在 Xmind 中另存为独立导图`,
      );
    ids.add(map.id);
    const nodes = map.sheets.flatMap((s) => Object.values(s.topics));
    let updatedAt: string | undefined;
    try {
      const date = execFileSync(
        "git",
        ["log", "-1", "--format=%cI", "--", file],
        { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      ).trim();
      if (date) updatedAt = date;
    } catch {
      /* Uncommitted files have no reliable update date. */
    }
    const serialized = JSON.stringify(map);
    const dataName = `${map.id}.${createHash("sha256").update(serialized).digest("hex").slice(0, 12)}.json`;
    const entry: CatalogEntry = {
      id: map.id,
      name: map.name,
      folder: map.folder,
      sourcePath: relative,
      nodeCount: nodes.length,
      sheetCount: map.sheets.length,
      imageCount: nodes.filter((n) => n.image).length,
      summaryCount: map.sheets.reduce((n, s) => n + s.summaries.length, 0),
      maxDepth: Math.max(...nodes.map((n) => n.depth)) + 1,
      bytes: buffer.length,
      updatedAt,
      warningCount: map.warnings.length,
      dataUrl: `data/${dataName}`,
    };
    await fs.writeFile(path.join(stage, dataName), serialized);
    for (const asset of assets.values())
      await fs.writeFile(path.join(stage, "assets", asset.name), asset.buffer);
    maps.push(entry);
    report.push({
      ...entry,
      format: map.format,
      sha256: map.sha256,
      parseMs,
      warnings: map.warnings,
      summaries: map.sheets.flatMap((s) =>
        s.summaries.map((summary) => ({
          sheetId: s.id,
          ...summary,
          parentTitle: s.topics[summary.parentId].title,
          topicTitle: s.topics[summary.topicId].title,
          coveredTitles: summary.coveredNodeIds.map((id) => s.topics[id].title),
        })),
      ),
    });
    console.log(
      `${relative} · ${entry.nodeCount} 节点 / ${entry.imageCount} 图片 / ${entry.summaryCount} 概要${entry.warningCount ? ` / ${entry.warningCount} 警告` : ""}`,
    );
  }
  const catalog: Catalog = { schemaVersion: 1, maps };
  await fs.writeFile(path.join(stage, "index.json"), JSON.stringify(catalog));
  await fs.writeFile(
    path.join(stage, "report.json"),
    JSON.stringify({ maps: report }, null, 2),
  );
  // Only replace the known generated directory after every source file has parsed successfully.
  if (path.resolve(dataRoot) !== path.resolve(root, "public", "data"))
    throw new Error("生成目录边界检查失败");
  await fs.rm(dataRoot, { recursive: true, force: true });
  await fs.rename(stage, dataRoot);
  console.log(
    `已生成 ${maps.length} 份导图，${maps.reduce((n, m) => n + m.nodeCount, 0)} 个节点。`,
  );
} catch (error) {
  await fs.rm(stage, { recursive: true, force: true });
  console.error(error);
  process.exitCode = 1;
}
