import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { ChevronRight, Minus, ImageOff } from "lucide-react";
import type { MindmapTopic } from "../types/mindmap";
import { assetUrl } from "../lib/navigation";
import { imageSize } from "../lib/measure";

export const COLORS = [
  "#2f81f7",
  "#2da88a",
  "#ae7bea",
  "#db8a35",
  "#e16882",
  "#44a6b8",
];
export interface TopicData extends Record<string, unknown> {
  topic: MindmapTopic;
  width: number;
  branch: number;
  collapsed: boolean;
  expandable: boolean;
  matched: boolean;
  focused: boolean;
  onToggle: (id: string) => void;
  onImage: (topic: MindmapTopic) => void;
}
export type FlowTopic = Node<TopicData, "topic">;
export const TopicNode = memo(function TopicNode({
  data,
  selected,
}: NodeProps<FlowTopic>) {
  const { topic: t } = data;
  const image = imageSize(t, data.width);
  return (
    <div
      className={`mind-node kind-${t.kind} ${selected ? "is-selected" : ""} ${data.matched ? "is-match" : ""} ${data.focused ? "is-focused" : ""}`}
      style={
        {
          "--branch-color": COLORS[data.branch % COLORS.length],
        } as React.CSSProperties
      }
      data-topic-id={t.id}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <div className="node-title">{t.title || "（空白主题）"}</div>
      {t.image &&
        (t.image.url && !t.image.error ? (
          <button
            className="node-image nodrag nopan"
            style={image}
            aria-label={`放大图片：${t.title}`}
            onClick={(e) => {
              e.stopPropagation();
              data.onImage(t);
            }}
          >
            <img
              src={assetUrl(t.image.url)}
              alt={`${t.title}的内嵌图片`}
              loading="lazy"
              draggable={false}
              onError={(e) => {
                e.currentTarget.hidden = true;
                e.currentTarget.parentElement!.classList.add(
                  "image-load-error",
                );
                e.currentTarget.parentElement!.setAttribute(
                  "aria-label",
                  "图片加载失败，请重新打开导图",
                );
              }}
            />
          </button>
        ) : (
          <div
            className="node-image image-error"
            style={image}
            title={t.image.error}
          >
            <ImageOff size={20} />
            <span>图片无法读取</span>
          </div>
        ))}
      <Handle type="source" position={Position.Right} isConnectable={false} />
      {data.expandable && (
        <button
          className={`collapse-toggle nodrag nopan ${data.collapsed ? "collapsed" : ""}`}
          aria-label={`${data.collapsed ? "展开" : "折叠"}节点：${t.title}`}
          title={data.collapsed ? "展开此节点" : "折叠此节点"}
          onClick={(e) => {
            e.stopPropagation();
            data.onToggle(t.id);
          }}
        >
          {data.collapsed ? <ChevronRight size={12} /> : <Minus size={12} />}
        </button>
      )}
    </div>
  );
});
