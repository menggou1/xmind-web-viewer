import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownAZ,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  Code2,
  FileText,
  FolderClosed,
  GitBranch,
  Images,
  Layers,
  Link2,
  Network,
  Search,
} from "lucide-react";
import type { Catalog } from "../types/mindmap";
import { Brand } from "../components/Brand";
import { ThemeControl } from "../components/ThemeControl";
import { copyText, mapHash } from "../lib/navigation";

export function Library({ catalog }: { catalog: Catalog }) {
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState("");
  const [sort, setSort] = useState("asc");
  const [message, setMessage] = useState("");
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const shortcut = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  const folders = [...new Set(catalog.maps.map((m) => m.folder))];
  const maps = useMemo(
    () =>
      catalog.maps
        .filter(
          (m) =>
            (!folder || m.folder === folder) &&
            `${m.name} ${m.folder}`
              .toLocaleLowerCase()
              .includes(query.toLocaleLowerCase()),
        )
        .sort(
          (a, b) =>
            a.name.localeCompare(b.name, "zh-CN", { numeric: true }) *
            (sort === "asc" ? 1 : -1),
        ),
    [catalog, folder, query, sort],
  );
  async function share(id: string) {
    try {
      await copyText(`${location.href.split("#")[0]}${mapHash(id)}`);
      setMessage("分享链接已复制");
    } catch (e) {
      setMessage(String(e));
    }
    setTimeout(() => setMessage(""), 3000);
  }
  return (
    <div className="library-shell">
      <header className="site-header">
        <Brand />
        <div className="header-actions">
          <a
            className="icon-button"
            href="https://github.com/menggou1/xmind-web-viewer"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub 源码"
          >
            <Code2 size={19} />
          </a>
          <ThemeControl />
        </div>
      </header>
      <aside className="library-sidebar">
        <div className="sidebar-caption">工作空间</div>
        <button
          className={`sidebar-item ${!folder ? "active" : ""}`}
          onClick={() => setFolder("")}
        >
          <BookOpen size={17} />
          <span>全部导图</span>
          <span className="count">{catalog.maps.length}</span>
        </button>
        <div className="sidebar-caption subjects-caption">学科目录</div>
        {folders.map((f, i) => (
          <button
            className={`sidebar-item ${folder === f ? "active" : ""}`}
            key={f}
            onClick={() => setFolder(f)}
          >
            <FolderClosed size={17} className={`subject-${i % 2}`} />
            <span>{f || "未分类"}</span>
            <span className="count">
              {catalog.maps.filter((m) => m.folder === f).length}
            </span>
          </button>
        ))}
        <div className="sidebar-note">
          <Network size={21} />
          <strong>从一个节点开始</strong>
          <p>
            搜索、展开、看清关联。
            <br />
            让每一份笔记都更好读。
          </p>
          <span>
            <i /> 开源 · 免费 · 无需登录
          </span>
        </div>
        <a
          className="sidebar-footer"
          href="https://github.com/menggou1/xmind-web-viewer#readme"
          target="_blank"
          rel="noreferrer"
        >
          使用说明 <ArrowUpRight size={14} />
        </a>
      </aside>
      <main className="library-main">
        <div className="breadcrumb">
          <BookOpen size={14} />
          <span>学习资料</span>
          <ChevronRight size={13} />
          <span>{folder || "全部导图"}</span>
        </div>
        <section className="library-intro">
          <div className="eyebrow">YOUR KNOWLEDGE, CONNECTED</div>
          <h1>
            {folder || "学习导图库"}
            <span className="title-dot">.</span>
          </h1>
          <p>
            把复杂的知识，展开成清晰的脉络。
            <br className="mobile-break" />
            选择一份导图，开始专注阅读。
          </p>
        </section>
        <div className="library-stats">
          <span>
            <FileText size={16} />
            <b>{catalog.maps.length}</b> 份导图
          </span>
          <span>
            <FolderClosed size={16} />
            <b>{folders.length}</b> 个学科
          </span>
          <span>
            <GitBranch size={16} />
            <b>
              {catalog.maps
                .reduce((n, m) => n + m.nodeCount, 0)
                .toLocaleString()}
            </b>{" "}
            个知识节点
          </span>
        </div>
        <div className="catalog-tools">
          <label className="search-box">
            <Search size={18} />
            <input
              ref={search}
              aria-label="搜索导图名称"
              placeholder="搜索导图名称或学科…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <kbd>/</kbd>
          </label>
          <label className="sort-control">
            <ArrowDownAZ size={17} />
            <select
              aria-label="导图排序"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="asc">名称升序</option>
              <option value="desc">名称降序</option>
            </select>
          </label>
        </div>
        <div className="catalog-caption">
          <span>
            {folder || "全部导图"} <b>{maps.length}</b>
          </span>
          <span>原始 Xmind · 交互式阅读</span>
        </div>
        <div className="map-list">
          {maps.map((m) => (
            <article className="map-row" key={m.id}>
              <a className="map-main-link" href={mapHash(m.id)}>
                <span
                  className={`map-file-icon ${m.folder.includes("微生物") ? "purple" : ""}`}
                >
                  <GitBranch size={23} />
                </span>
                <span className="map-description">
                  <h2>{m.name}</h2>
                  <span className="map-meta">
                    <span>{m.folder || "未分类"}</span>
                    <i />
                    <span>{m.nodeCount} 个节点</span>
                    <span className="sheet-meta">
                      <Layers size={12} />
                      {m.sheetCount} 个画布
                    </span>
                    {m.imageCount > 0 && (
                      <span>
                        <Images size={12} />
                        {m.imageCount}
                      </span>
                    )}
                    {m.summaryCount > 0 && (
                      <span className="summary-meta">
                        {m.summaryCount} 个概要
                      </span>
                    )}
                  </span>
                </span>
              </a>
              <div className="map-row-actions">
                {m.updatedAt && (
                  <time dateTime={m.updatedAt} title="最近一次 Git 提交时间">
                    {new Date(m.updatedAt).toLocaleDateString("zh-CN")}
                  </time>
                )}
                <button
                  className="icon-button share-button"
                  aria-label={`复制 ${m.name} 分享链接`}
                  title="复制分享链接"
                  onClick={() => share(m.id)}
                >
                  <Link2 size={17} />
                </button>
                <a
                  className="open-map-link"
                  href={mapHash(m.id)}
                  aria-label={`打开 ${m.name}`}
                >
                  <span>打开导图</span>
                  <ArrowUpRight size={17} />
                </a>
              </div>
            </article>
          ))}
          {!maps.length && (
            <div className="empty-state">
              <Search size={30} />
              <h2>没有找到匹配的导图</h2>
              <p>试试其他章节名称，或切换学科。</p>
              <button
                onClick={() => {
                  setQuery("");
                  setFolder("");
                }}
              >
                查看全部导图
              </button>
            </div>
          )}
        </div>
        <footer className="library-footer">
          <span>知识有脉络，学习有方向。</span>
          <span>原文保留 · 支持图片与概要 · 自由探索</span>
        </footer>
      </main>
      {message && (
        <div className="toast" role="status">
          <Check size={16} />
          {message}
        </div>
      )}
    </div>
  );
}
