import yauzl, { type Entry, type ZipFile } from "yauzl";
import { crc32 } from "node:zlib";

export const ZIP_LIMITS = {
  input: 128 * 1024 ** 2,
  expanded: 512 * 1024 ** 2,
  entry: 64 * 1024 ** 2,
  count: 20000,
  ratio: 500,
};

export function safeArchivePath(name: string): string {
  if (
    !name ||
    name.includes("\\") ||
    name.includes("\0") ||
    name.startsWith("/") ||
    /^[a-z]:/i.test(name) ||
    name.includes(":") ||
    name.split("/").some((p) => p === ".." || p === ".")
  ) {
    throw new Error(`不安全的 ZIP 路径：${JSON.stringify(name)}`);
  }
  return name;
}

/** Index first, inflate on demand with both declared and actual byte limits. */
export class XmindArchive {
  private constructor(
    private zip: ZipFile,
    readonly entries: Map<string, Entry>,
  ) {}

  static async open(buffer: Buffer): Promise<XmindArchive> {
    if (buffer.length > ZIP_LIMITS.input)
      throw new Error("Xmind 超过 128 MiB 输入限制");
    const zip = await new Promise<ZipFile>((resolve, reject) =>
      yauzl.fromBuffer(
        buffer,
        {
          lazyEntries: true,
          autoClose: false,
          validateEntrySizes: true,
          strictFileNames: true,
        },
        (error, file) => (error ? reject(error) : resolve(file!)),
      ),
    );
    try {
      const entries = await new Promise<Map<string, Entry>>(
        (resolve, reject) => {
          const found = new Map<string, Entry>();
          let total = 0;
          let count = 0;
          zip.on("error", reject);
          zip.on("entry", (entry: Entry) => {
            try {
              const name = safeArchivePath(entry.fileName);
              if (++count > ZIP_LIMITS.count)
                throw new Error("ZIP 条目超过 20000 个");
              if (entry.generalPurposeBitFlag & 1)
                throw new Error("不支持加密的 Xmind");
              if (((entry.externalFileAttributes >>> 16) & 0xf000) === 0xa000)
                throw new Error("不允许 ZIP 符号链接");
              total += entry.uncompressedSize;
              if (
                entry.uncompressedSize > ZIP_LIMITS.entry ||
                total > ZIP_LIMITS.expanded
              )
                throw new Error("ZIP 解压体积超出限制");
              if (
                entry.uncompressedSize > 1024 ** 2 &&
                entry.uncompressedSize / Math.max(1, entry.compressedSize) >
                  ZIP_LIMITS.ratio
              )
                throw new Error("ZIP 压缩比异常");
              if (found.has(name)) throw new Error(`ZIP 存在重复路径：${name}`);
              found.set(name, entry);
              zip.readEntry();
            } catch (error) {
              reject(error);
            }
          });
          zip.on("end", () => resolve(found));
          zip.readEntry();
        },
      );
      return new XmindArchive(zip, entries);
    } catch (error) {
      zip.close();
      throw error;
    }
  }

  async read(name: string, limit = ZIP_LIMITS.entry): Promise<Buffer> {
    const entry = this.entries.get(safeArchivePath(name));
    if (!entry) throw new Error(`ZIP 缺少资源：${name}`);
    if (entry.uncompressedSize > limit)
      throw new Error(`资源超出读取限制：${name}`);
    return new Promise((resolve, reject) =>
      this.zip.openReadStream(entry, (error, stream) => {
        if (error || !stream) {
          reject(error || new Error("无法读取 ZIP"));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        let checksum = 0;
        stream.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > limit || size > entry.uncompressedSize)
            stream.destroy(new Error(`资源实际解压体积异常：${name}`));
          else {
            chunks.push(chunk);
            checksum = crc32(chunk, checksum);
          }
        });
        stream.on("error", reject);
        stream.on("end", () => {
          if (size !== entry.uncompressedSize)
            reject(new Error(`资源大小不符：${name}`));
          else if (checksum !== entry.crc32)
            reject(new Error(`资源 CRC-32 校验失败：${name}`));
          else resolve(Buffer.concat(chunks));
        });
      }),
    );
  }

  close() {
    this.zip.close();
  }
}
