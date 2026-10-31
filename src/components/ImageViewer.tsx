import { useEffect, useRef, useState } from "react";
import { Download, Maximize, Minus, Plus, X } from "lucide-react";
import type { MindmapTopic } from "../types/mindmap";
import { assetUrl } from "../lib/navigation";

export function ImageViewer({
  topic,
  onClose,
}: {
  topic: MindmapTopic;
  onClose: () => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const close = useRef<HTMLButtonElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const lastDistance = useRef(0);
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [onClose]);
  const change = (n: number) =>
    setZoom((z) => Math.max(0.2, Math.min(8, z * n)));
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) =>
        Math.max(0.2, Math.min(8, z * (e.deltaY < 0 ? 1.1 : 1 / 1.1))),
      );
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);
  return (
    <div
      className="image-modal"
      role="dialog"
      aria-modal="true"
      aria-label="图片查看器"
      onKeyDown={(e) => {
        if (e.key === "Tab") {
          const items =
            e.currentTarget.querySelectorAll<HTMLElement>("button,a");
          const first = items[0],
            last = items[items.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }}
    >
      <header>
        <span className="image-modal-title">{topic.title}</span>
        <span className="image-zoom">{Math.round(zoom * 100)}%</span>
        <button aria-label="缩小图片" onClick={() => change(1 / 1.25)}>
          <Minus size={19} />
        </button>
        <button aria-label="放大图片" onClick={() => change(1.25)}>
          <Plus size={19} />
        </button>
        <button
          aria-label="重置图片"
          onClick={() => {
            setZoom(1);
            setOffset({ x: 0, y: 0 });
          }}
        >
          <Maximize size={18} />
        </button>
        <a
          aria-label="查看原始图片"
          href={assetUrl(topic.image!.originalUrl || topic.image!.url!)}
          target="_blank"
          rel="noreferrer"
        >
          <Download size={18} />
        </a>
        <button ref={close} aria-label="关闭图片" onClick={onClose}>
          <X size={21} />
        </button>
      </header>
      <div
        className="image-stage"
        ref={stage}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        }}
        onPointerMove={(e) => {
          const before = pointers.current.get(e.pointerId);
          if (!before) return;
          const old = [...pointers.current.values()];
          const oldDistance =
            old.length === 2
              ? Math.hypot(old[0].x - old[1].x, old[0].y - old[1].y)
              : 0;
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          const now = [...pointers.current.values()];
          if (now.length === 2) {
            const distance = Math.hypot(
              now[0].x - now[1].x,
              now[0].y - now[1].y,
            );
            if (oldDistance > 0) change(distance / oldDistance);
            lastDistance.current = distance;
          } else
            setOffset((p) => ({
              x: p.x + e.clientX - before.x,
              y: p.y + e.clientY - before.y,
            }));
        }}
        onPointerUp={(e) => {
          pointers.current.delete(e.pointerId);
        }}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId);
        }}
      >
        <img
          draggable={false}
          alt={topic.title}
          src={assetUrl(topic.image!.url!)}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
          }}
        />
      </div>
      <p className="image-hint">滚轮或双指缩放 · 拖动查看细节 · Esc 关闭</p>
    </div>
  );
}
