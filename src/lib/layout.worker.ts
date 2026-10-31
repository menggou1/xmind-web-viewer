import { layoutMindmap, type LayoutInput } from "./layout";
self.onmessage = (
  event: MessageEvent<{ sequence: number; input: LayoutInput }>,
) => {
  try {
    self.postMessage({
      sequence: event.data.sequence,
      layout: layoutMindmap(event.data.input),
    });
  } catch (error) {
    self.postMessage({ sequence: event.data.sequence, error: String(error) });
  }
};
