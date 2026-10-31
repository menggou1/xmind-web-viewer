import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
  ViewportPortal,
  useOnViewportChange,
  useReactFlow,
  type Edge,
} from "@xyflow/react";
import { Crosshair, Maximize, Minus, Plus } from "lucide-react";
import type { MindmapSheet, MindmapTopic } from "../types/mindmap";
import { bracketPath, type LayoutResult, type Size } from "../lib/layout";
import { measureTopics } from "../lib/measure";
import {
  ancestors,
  collapseToDepth,
  descendants,
  initialCollapsed,
  searchTopics,
} from "../lib/navigation";
import { COLORS, TopicNode, type FlowTopic } from "./TopicNode";

const nodeTypes = { topic: TopicNode };
export interface CanvasActions {
  fit: () => void;
  root: () => void;
  expandAll: () => void;
  depth: (n: number) => void;
  relayout: () => void;
  expandBranch: (id: string) => void;
  collapseBranch: (id: string) => void;
}
interface Props {
  sheet: MindmapSheet;
  spacing: number;
  query: string;
  focusId?: string;
  selectedId?: string;
  onSelect: (id?: string) => void;
  onImage: (topic: MindmapTopic) => void;
}

const Canvas = forwardRef<CanvasActions, Props>(function Canvas(
  { sheet, spacing, query, focusId, selectedId, onSelect, onImage },
  ref,
) {
  const flow = useReactFlow<FlowTopic>();
  const [collapsed, setCollapsed] = useState<string[]>(() =>
    initialCollapsed(sheet),
  );
  const [sizes, setSizes] = useState<Record<string, Size>>();
  const [layout, setLayout] = useState<LayoutResult>();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [zoom, setZoom] = useState(0.85);
  const worker = useRef<Worker | null>(null);
  const sequence = useRef(0);
  const initialized = useRef(false);
  const container = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ id: string; x: number; y: number } | undefined>(
    undefined,
  );
  const pendingFocus = useRef<string | undefined>(undefined);
  const snapshot = useRef<{
    collapsed: string[];
    viewport: ReturnType<typeof flow.getViewport>;
  } | null>(null);
  const previousQuery = useRef("");
  const currentCollapsed = useRef(collapsed);
  currentCollapsed.current = collapsed;
  useOnViewportChange({ onChange: (viewport) => setZoom(viewport.zoom) });
  const matched = useMemo(
    () => new Set(searchTopics(sheet, query)),
    [sheet, query],
  );
  const expandable = useMemo(
    () =>
      new Set(
        Object.values(sheet.topics)
          .filter(
            (t) =>
              t.children.length ||
              t.auxiliary.length ||
              sheet.summaries.some((s) => s.parentId === t.id),
          )
          .map((t) => t.id),
      ),
    [sheet],
  );

  useEffect(() => {
    const instance = new Worker(
      new URL("../lib/layout.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.current = instance;
    instance.onmessage = (e) => {
      if (e.data.sequence !== sequence.current) return;
      if (e.data.error) setError(e.data.error);
      else setLayout(e.data.layout);
      setBusy(false);
    };
    instance.onerror = () => {
      setError("布局计算失败，请刷新页面重试。");
      setBusy(false);
    };
    let cancelled = false;
    document.fonts.ready
      .then(() => {
        if (!cancelled) setSizes(measureTopics(sheet));
      })
      .catch(() => {
        if (!cancelled) setSizes(measureTopics(sheet));
      });
    return () => {
      cancelled = true;
      instance.terminate();
      worker.current = null;
    };
  }, [sheet]);
  useEffect(() => {
    if (!sizes || !worker.current) return;
    setBusy(true);
    const id = ++sequence.current;
    worker.current.postMessage({
      sequence: id,
      input: { sheet, sizes, collapsed, spacing },
    });
  }, [sheet, sizes, collapsed, spacing, revision]);

  const root = useCallback(() => {
    const n = flow.getNode(sheet.rootId);
    if (!n) return;
    const width = container.current?.clientWidth || 1000;
    const rootZoom = width < 600 ? 0.65 : 0.85;
    void flow.setCenter(
      n.position.x + (n.width || 200) / 2 + (width * 0.27) / rootZoom,
      n.position.y + (n.height || 60) / 2,
      { zoom: rootZoom, duration: 250 },
    );
  }, [flow, sheet]);
  useEffect(() => {
    if (!layout) return;
    const frame = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (pendingFocus.current) {
          const n = layout.nodes.find((n) => n.id === pendingFocus.current);
          if (n) {
            void flow.setCenter(n.x + n.width / 2, n.y + n.height / 2, {
              zoom: Math.max(0.75, flow.getZoom()),
              duration: 250,
            });
            pendingFocus.current = undefined;
            initialized.current = true;
          }
        } else if (!initialized.current) {
          root();
          initialized.current = true;
        } else if (anchor.current) {
          const n = layout.nodes.find((n) => n.id === anchor.current!.id);
          if (n) {
            const viewport = flow.getViewport();
            void flow.setViewport({
              ...viewport,
              x: viewport.x + (anchor.current.x - n.x) * viewport.zoom,
              y: viewport.y + (anchor.current.y - n.y) * viewport.zoom,
            });
          }
          anchor.current = undefined;
        }
      }),
    );
    return () => cancelAnimationFrame(frame);
  }, [layout, flow, root]);
  useEffect(() => {
    if (query && !previousQuery.current)
      snapshot.current = {
        collapsed: currentCollapsed.current,
        viewport: flow.getViewport(),
      };
    if (!query && previousQuery.current && snapshot.current) {
      setCollapsed(snapshot.current.collapsed);
      void flow.setViewport(snapshot.current.viewport);
      snapshot.current = null;
    }
    previousQuery.current = query;
  }, [query, flow]);
  useEffect(() => {
    if (!focusId || !sheet.topics[focusId]) return;
    pendingFocus.current = focusId;
    const path = new Set(ancestors(sheet, focusId));
    setCollapsed((old) => old.filter((id) => !path.has(id)));
    setRevision((n) => n + 1);
  }, [focusId, query, sheet]);

  const rememberAnchor = useCallback(
    (id: string) => {
      const n = layout?.nodes.find((n) => n.id === id);
      if (n) anchor.current = { id, x: n.x, y: n.y };
    },
    [layout],
  );
  const toggle = useCallback(
    (id: string) => {
      rememberAnchor(id);
      setCollapsed((old) =>
        old.includes(id) ? old.filter((n) => n !== id) : [...old, id],
      );
    },
    [rememberAnchor],
  );
  useImperativeHandle(
    ref,
    () => ({
      fit: () => {
        void flow.fitView({
          padding: 0.14,
          maxZoom: 1,
          minZoom: 0.03,
          duration: 300,
        });
      },
      root,
      expandAll: () => setCollapsed([]),
      depth: (n) => setCollapsed(collapseToDepth(sheet, n)),
      relayout: () => {
        setSizes(measureTopics(sheet));
        setRevision((n) => n + 1);
      },
      expandBranch: (id) => {
        rememberAnchor(id);
        const ids = new Set([id, ...descendants(sheet, id)]);
        setCollapsed((old) => old.filter((k) => !ids.has(k)));
      },
      collapseBranch: (id) => {
        rememberAnchor(id);
        setCollapsed((old) => [
          ...new Set([
            ...old,
            id,
            ...descendants(sheet, id).filter((k) => expandable.has(k)),
          ]),
        ]);
      },
    }),
    [flow, root, sheet, rememberAnchor, expandable],
  );

  const nodes: FlowTopic[] = useMemo(
    () =>
      layout?.nodes.map((n) => ({
        id: n.id,
        type: "topic",
        position: { x: n.x, y: n.y },
        width: n.width,
        height: n.height,
        initialWidth: n.width,
        initialHeight: n.height,
        style: { width: n.width, height: n.height },
        selected: n.id === selectedId,
        draggable: false,
        connectable: false,
        deletable: false,
        data: {
          topic: sheet.topics[n.id],
          width: n.width,
          branch: n.branch,
          collapsed: collapsed.includes(n.id),
          expandable: expandable.has(n.id),
          matched: matched.has(n.id),
          focused: query ? focusId === n.id : false,
          onToggle: toggle,
          onImage,
        },
        ariaLabel: sheet.topics[n.id].title,
      })) || [],
    [
      layout,
      sheet,
      collapsed,
      expandable,
      matched,
      focusId,
      selectedId,
      query,
      toggle,
      onImage,
    ],
  );
  const edges: Edge[] = useMemo(() => {
    if (!layout) return [];
    const visible = new Map(layout.nodes.map((n) => [n.id, n]));
    const result: Edge[] = [];
    for (const n of layout.nodes) {
      const topic = sheet.topics[n.id];
      if (
        !topic.parentId ||
        !visible.has(topic.parentId) ||
        (topic.kind === "summary" &&
          !sheet.topics[topic.parentId].auxiliary.includes(topic.id))
      )
        continue;
      result.push({
        id: `tree-${n.id}`,
        source: topic.parentId,
        target: n.id,
        type: "default",
        style: {
          stroke: COLORS[n.branch % COLORS.length],
          strokeWidth: 1.7,
          ...(topic.kind === "detached" || topic.kind === "callout"
            ? { strokeDasharray: "5 4" }
            : {}),
        },
        label:
          topic.kind === "detached"
            ? "自由主题"
            : topic.kind === "callout"
              ? "标注"
              : undefined,
      });
    }
    for (const r of sheet.relationships)
      if (visible.has(r.source) && visible.has(r.target))
        result.push({
          id: `relation-${r.id}`,
          source: r.source,
          target: r.target,
          type: "smoothstep",
          label: r.title,
          style: { stroke: "var(--muted)", strokeDasharray: "4 5" },
        });
    return result;
  }, [layout, sheet]);

  return (
    <div
      className="canvas-shell"
      ref={container}
      aria-label="思维导图画布"
      aria-busy={busy}
    >
      {error ? (
        <div className="canvas-error" role="alert">
          {error}
        </div>
      ) : (
        <ReactFlow<FlowTopic>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          edgesReconnectable={false}
          elementsSelectable
          nodesFocusable
          edgesFocusable={false}
          deleteKeyCode={null}
          minZoom={0.03}
          maxZoom={3}
          onlyRenderVisibleElements
          zoomOnPinch
          zoomOnScroll
          panOnDrag
          preventScrolling
          selectionKeyCode={null}
          onNodeClick={(_, node) => onSelect(node.id)}
          onPaneClick={() => onSelect(undefined)}
          onMoveEnd={(_, v) => setZoom(v.zoom)}
          colorMode="system"
          proOptions={{ hideAttribution: false }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={24}
            size={1}
            color="var(--dot)"
          />
          <ViewportPortal>
            <svg
              className="summary-layer"
              aria-label="概要括号"
              width="1"
              height="1"
            >
              {layout?.brackets.map((b) => (
                <g
                  key={b.id}
                  data-summary-id={b.id}
                  data-covered-ids={b.coveredNodeIds.join(",")}
                  style={{ color: COLORS[b.branch % COLORS.length] }}
                >
                  <path className="summary-bracket" d={bracketPath(b)} />
                  <path
                    className="summary-connector"
                    d={`M ${b.x + 12} ${b.center} H ${b.targetX}`}
                  />
                  <title>
                    {sheet.topics[b.topicId].title}：概括{" "}
                    {b.coveredNodeIds.length} 个兄弟节点
                  </title>
                </g>
              ))}
            </svg>
          </ViewportPortal>
        </ReactFlow>
      )}
      {busy && (
        <div className="layout-indicator" role="status">
          <span className="spinner" />
          正在整理导图…
        </div>
      )}
      <div className="canvas-bottom">
        <span className="canvas-status" data-testid="canvas-status">
          {layout?.nodes.length || 0} / {Object.keys(sheet.topics).length} 节点
          <span className="status-extra">
            {" "}
            · {layout?.brackets.length || 0} 个概要 ·{" "}
            {Math.round(layout?.duration || 0)} ms
          </span>
        </span>
        <div className="zoom-controls">
          <button
            aria-label="缩小导图"
            title="缩小"
            onClick={() => {
              void flow.zoomOut({ duration: 150 });
            }}
          >
            <Minus size={17} />
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button
            aria-label="放大导图"
            title="放大"
            onClick={() => {
              void flow.zoomIn({ duration: 150 });
            }}
          >
            <Plus size={17} />
          </button>
          <i />
          <button
            aria-label="适应画布"
            title="适应画布"
            onClick={() => {
              void flow.fitView({
                padding: 0.14,
                minZoom: 0.03,
                maxZoom: 1,
                duration: 250,
              });
            }}
          >
            <Maximize size={17} />
          </button>
          <button aria-label="定位根节点" title="定位根节点" onClick={root}>
            <Crosshair size={17} />
          </button>
        </div>
      </div>
      <span className="canvas-hint">拖动平移 · 滚轮 / 双指缩放</span>
    </div>
  );
});
export const MapCanvas = forwardRef<CanvasActions, Props>(
  function MapCanvas(props, ref) {
    return (
      <ReactFlowProvider>
        <Canvas {...props} ref={ref} />
      </ReactFlowProvider>
    );
  },
);
