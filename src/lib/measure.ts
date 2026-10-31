import type { MindmapSheet, MindmapTopic } from "../types/mindmap";
import type { Size } from "./layout";

export function imageSize(
  topic: MindmapTopic,
  nodeWidth: number,
): Size | undefined {
  if (!topic.image) return;
  if (!topic.image.width || !topic.image.height || topic.image.error)
    return { width: nodeWidth - 32, height: 72 };
  const ratio = Math.min(
    (nodeWidth - 32) / topic.image.width,
    180 / topic.image.height,
    1,
  );
  return {
    width: Math.max(1, topic.image.width * ratio),
    height: Math.max(1, topic.image.height * ratio),
  };
}

/** Measure the exact plain-text DOM/CSS used by the cards, once per sheet. */
export function measureTopics(sheet: MindmapSheet): Record<string, Size> {
  const host = document.createElement("div");
  host.className = "measurement-host";
  document.body.append(host);
  const sizes: Record<string, Size> = Object.create(null);
  for (const t of Object.values(sheet.topics)) {
    const element = document.createElement("div");
    element.className = `mind-node kind-${t.kind} measuring`;
    const title = document.createElement("div");
    title.className = "node-title";
    title.textContent = t.title || "（空白主题）";
    element.append(title);
    host.append(element);
    let width = Math.ceil(element.getBoundingClientRect().width);
    if (t.image) {
      width = Math.max(width, 240);
      element.style.width = `${width}px`;
    }
    const image = imageSize(t, width);
    if (image) {
      const spacer = document.createElement("div");
      spacer.className = "node-image";
      spacer.style.height = `${image.height}px`;
      spacer.style.width = `${image.width}px`;
      element.append(spacer);
    }
    const rect = element.getBoundingClientRect();
    sizes[t.id] = {
      width: Math.ceil(rect.width),
      height: Math.ceil(rect.height),
    };
    element.remove();
  }
  host.remove();
  return sizes;
}
