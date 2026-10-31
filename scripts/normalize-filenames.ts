import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const root = path.resolve("maps");
const records: { from: string; to: string; sha256: string }[] = [];
async function walk(dir: string) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const source = path.join(dir, e.name);
    if (e.isDirectory()) {
      await walk(source);
      continue;
    }
    if (!e.isFile() || !/\.xmind$/i.test(e.name)) continue;
    const name = e.name
      .replace(/[（(](?:完结|整理完成)[）)]/g, "")
      .replace(/_副本(?=\.xmind$)/i, "");
    if (name === e.name) continue;
    const target = path.join(dir, name);
    if (!path.resolve(target).startsWith(root + path.sep))
      throw new Error("目标路径超出 maps/");
    try {
      await fs.access(target);
      throw new Error(`目标已存在：${target}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const before = await fs.readFile(source);
    const hash = createHash("sha256").update(before).digest("hex");
    await fs.rename(source, target);
    if (
      createHash("sha256")
        .update(await fs.readFile(target))
        .digest("hex") !== hash
    )
      throw new Error(`校验失败：${target}`);
    records.push({
      from: path.relative(root, source).replaceAll("\\", "/"),
      to: path.relative(root, target).replaceAll("\\", "/"),
      sha256: hash,
    });
  }
}
await walk(root);
if (records.length) {
  await fs.mkdir("docs", { recursive: true });
  await fs.writeFile(
    "docs/file-renames.json",
    JSON.stringify(records, null, 2) + "\n",
  );
}
console.log(
  `已清理 ${records.length} 个文件名；每份文件的 SHA-256 均保持一致。未改写任何 Xmind 内容。`,
);
