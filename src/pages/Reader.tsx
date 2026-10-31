import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Copy,
  ExternalLink,
  FoldVertical,
  GitBranch,
  Link2,
  MoreHorizontal,
  RotateCw,
  Search,
  UnfoldVertical,
  X,
} from "lucide-react";
import type { Mindmap, MindmapTopic } from "../types/mindmap";
import { ThemeControl } from "../components/ThemeControl";
import { MapCanvas, type CanvasActions } from "../components/MapCanvas";
import { ImageViewer } from "../components/ImageViewer";
import { copyText, mapHash, searchTopics } from "../lib/navigation";

export function Reader({
  map,
  sheetId,
  nodeId,
}: {
  map: Mindmap;
  sheetId?: string;
  nodeId?: string;
}) {
  const sheet = map.sheets.find((s) => s.id === sheetId) || map.sheets[0];
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [selectedId, setSelectedId] = useState<string>();
  const [image, setImage] = useState<MindmapTopic>();
  const [spacing, setSpacing] = useState(28);
  const [more, setMore] = useState(false);
  const [report, setReport] = useState(false);
  const [message, setMessage] = useState("");
  const canvas = useRef<CanvasActions>(null);
  const input = useRef<HTMLInputElement>(null);
  const matches = useMemo(
    () =>
      map.sheets.flatMap((s) =>
        searchTopics(s, query).map((id) => ({ sheetId: s.id, id })),
      ),
    [map, query],
  );
  const active = matches.length
    ? matches[((cursor % matches.length) + matches.length) % matches.length]
    : undefined;
  const current = selectedId ? sheet.topics[selectedId] : undefined;
  const closeImage = useCallback(() => setImage(undefined), []);
  useEffect(() => {
    if (active && active.sheetId !== sheet.id) {
      setSelectedId(undefined);
      location.hash = mapHash(map.id, active.sheetId);
    }
  }, [active, sheet.id, map.id]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement) &&
        !image
      ) {
        e.preventDefault();
        input.current?.focus();
      }
      if (e.key === "Escape") {
        setMore(false);
        setReport(false);
        setSelectedId(undefined);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [image]);
  async function copy(value: string, success: string) {
    try {
      await copyText(value);
      setMessage(success);
    } catch (e) {
      setMessage(String(e));
    }
    setTimeout(() => setMessage(""), 3000);
  }
  return (
    <div className="reader-shell">
      <header className="reader-header">
        <a href="#/" className="back-link" aria-label="返回导图库">
          <ArrowLeft size={19} />
          <span>导图库</span>
        </a>
        <span className="header-divider" />
        <div className="reader-title">
          <span>
            <GitBranch size={18} />
            {map.name}
          </span>
          <small>
            {map.folder} · {Object.keys(sheet.topics).length} 个节点
          </small>
        </div>
        <div className="reader-header-actions">
          <button
            className="icon-button"
            aria-label="复制当前导图分享链接"
            title="复制当前画布分享链接"
            onClick={() =>
              copy(
                `${location.href.split("#")[0]}${mapHash(map.id, sheet.id)}`,
                "当前画布的分享链接已复制",
              )
            }
          >
            <Link2 size={18} />
          </button>
          <ThemeControl />
        </div>
      </header>
      <div className="reader-toolbar">
        <div className="reader-search search-box">
          <Search size={17} />
          <input
            ref={input}
            aria-label="搜索节点内容"
            placeholder="搜索全部画布的节点…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing)
                setCursor((n) => n + (e.shiftKey ? -1 : 1));
            }}
          />
          {query ? (
            <>
              <span className="search-count" role="status">
                {matches.length
                  ? (((cursor % matches.length) + matches.length) %
                      matches.length) +
                    1
                  : 0}
                /{matches.length}
              </span>
              <button
                aria-label="上一个匹配"
                disabled={!matches.length}
                onClick={() => setCursor((n) => n - 1)}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                aria-label="下一个匹配"
                disabled={!matches.length}
                onClick={() => setCursor((n) => n + 1)}
              >
                <ChevronRight size={16} />
              </button>
              <button aria-label="清除搜索" onClick={() => setQuery("")}>
                <X size={15} />
              </button>
            </>
          ) : (
            <kbd>/</kbd>
          )}
        </div>
        {map.sheets.length > 1 && (
          <label className="sheet-select">
            <BookOpen size={15} />
            <select
              aria-label="切换画布"
              value={sheet.id}
              onChange={(e) => {
                setQuery("");
                setSelectedId(undefined);
                location.hash = mapHash(map.id, e.target.value);
              }}
            >
              {map.sheets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title || "（未命名画布）"}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="toolbar-actions">
          <button
            className="toolbar-button expand-all"
            onClick={() => canvas.current?.expandAll()}
          >
            <UnfoldVertical size={16} />
            <span>全部展开</span>
          </button>
          <label className="depth-control">
            <FoldVertical size={16} />
            <select
              aria-label="折叠到指定层级"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value)
                  canvas.current?.depth(Number(e.target.value));
                e.target.value = "";
              }}
            >
              <option value="" disabled>
                折叠层级
              </option>
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? "仅保留根节点" : `展开至 ${n} 级`}
                </option>
              ))}
            </select>
          </label>
          <button
            className="icon-button more-toggle"
            aria-label="更多导图工具"
            aria-expanded={more}
            onClick={() => setMore(!more)}
          >
            <MoreHorizontal size={21} />
          </button>
        </div>
        {more && (
          <div className="more-menu">
            <button
              onClick={() => {
                canvas.current?.expandAll();
                setMore(false);
              }}
            >
              <UnfoldVertical size={16} />
              全部展开
            </button>
            <button
              onClick={() => {
                canvas.current?.depth(0);
                setMore(false);
              }}
            >
              <FoldVertical size={16} />
              全部折叠
            </button>
            <button
              onClick={() => {
                canvas.current?.relayout();
                setMore(false);
              }}
            >
              <RotateCw size={16} />
              重新整理布局
            </button>
            <label>
              节点间距
              <select
                aria-label="节点间距"
                value={spacing}
                onChange={(e) => setSpacing(Number(e.target.value))}
              >
                <option value="20">紧凑</option>
                <option value="28">标准</option>
                <option value="48">宽松</option>
              </select>
            </label>
            <button
              onClick={() => {
                setReport(!report);
                setMore(false);
              }}
            >
              <CircleHelp size={16} />
              兼容性与阅读说明
            </button>
          </div>
        )}
      </div>
      <div
        className={`reader-workspace ${current || report ? "with-details" : ""}`}
      >
        <MapCanvas
          ref={canvas}
          key={sheet.id}
          sheet={sheet}
          spacing={spacing}
          query={query}
          focusId={active?.sheetId === sheet.id ? active.id : nodeId}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id);
            setReport(false);
          }}
          onImage={setImage}
        />
        {current && (
          <aside className="node-details" aria-label="节点阅读面板">
            <header>
              <span>
                <GitBranch size={16} />
                节点内容
              </span>
              <button
                className="icon-button"
                aria-label="关闭节点面板"
                onClick={() => setSelectedId(undefined)}
              >
                <X size={18} />
              </button>
            </header>
            <span className="detail-kind">
              {current.kind === "summary"
                ? "概要主题"
                : current.depth === 0
                  ? "根节点"
                  : `${current.depth} 级节点`}
            </span>
            <h2>{current.title || "（空白主题）"}</h2>
            <div className="detail-actions">
              <button onClick={() => copy(current.title, "节点文字已复制")}>
                <Copy size={15} />
                复制全文
              </button>
              <button
                title="分享并定位到这个节点"
                onClick={() =>
                  copy(
                    `${location.href.split("#")[0]}${mapHash(map.id, sheet.id, current.id)}`,
                    "节点分享链接已复制",
                  )
                }
              >
                <Link2 size={15} />
                分享节点
              </button>
            </div>
            {current.image && (
              <button
                className="detail-image-link"
                disabled={!current.image.url}
                onClick={() => setImage(current)}
              >
                查看节点图片 <ExternalLink size={14} />
              </button>
            )}
            {current.notes && (
              <section>
                <h3>备注</h3>
                <p>{current.notes}</p>
              </section>
            )}
            {current.href && (
              <a
                className="detail-external"
                href={current.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                打开节点链接 <ExternalLink size={14} />
              </a>
            )}
            {current.labels.length > 0 && (
              <section>
                <h3>标签</h3>
                <p>{current.labels.join(" · ")}</p>
              </section>
            )}
            <div className="branch-actions">
              <button onClick={() => canvas.current?.expandBranch(current.id)}>
                <UnfoldVertical size={16} />
                展开此分支全部后代
              </button>
              <button
                onClick={() => canvas.current?.collapseBranch(current.id)}
              >
                <FoldVertical size={16} />
                折叠此分支全部后代
              </button>
            </div>
          </aside>
        )}
        {report && !current && (
          <aside className="node-details" aria-label="兼容性报告">
            <header>
              <span>阅读说明</span>
              <button
                className="icon-button"
                aria-label="关闭阅读说明"
                onClick={() => setReport(false)}
              >
                <X size={18} />
              </button>
            </header>
            <h2>完整保留，清晰阅读。</h2>
            <p>
              点击节点打开全文；使用节点右侧按钮展开或折叠。搜索包含全部画布及隐藏节点，会自动展开祖先并定位。
            </p>
            <h3>概要显示规则</h3>
            <p>
              括号严格覆盖源文件指定的兄弟节点范围，并包含这些节点当前可见的后代。折叠被概括的分支后跨度随之缩短；折叠概要所属父节点时，同时隐藏概要。
            </p>
            <h3>当前文件</h3>
            <p>
              {map.format === "json" ? "现代 JSON Xmind" : "旧版 XML Xmind"} ·{" "}
              {map.sheets.length} 个画布 · {map.warnings.length} 条兼容性提示。
            </p>
            {map.warnings.map((w, i) => (
              <p className="compat-warning" key={i}>
                {w.code}：{w.message}
              </p>
            ))}
            <p>
              浏览器按需加载预处理数据。原始文字与图片不会因默认折叠而丢失。
            </p>
          </aside>
        )}
      </div>
      {image && <ImageViewer topic={image} onClose={closeImage} />}
      {message && (
        <div className="toast" role="status">
          <Check size={16} />
          {message}
        </div>
      )}
    </div>
  );
}
