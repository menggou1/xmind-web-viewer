import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowLeft, RefreshCw } from "lucide-react";
import type { Catalog, Mindmap } from "./types/mindmap";
import { assetUrl, readRoute } from "./lib/navigation";
import { Library } from "./pages/Library";
import { Reader } from "./pages/Reader";
import "@xyflow/react/dist/style.css";
import "./styles/app.css";

const mapCache = new Map<string, Mindmap>();
function App() {
  const [route, setRoute] = useState(readRoute);
  const [catalog, setCatalog] = useState<Catalog>();
  const [map, setMap] = useState<Mindmap>();
  const [error, setError] = useState("");
  useEffect(() => {
    const change = () => {
      setRoute(readRoute());
      setError("");
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch(assetUrl("data/index.json"), {
      signal: controller.signal,
      cache: "no-cache",
    })
      .then((r) => {
        if (!r.ok) throw new Error("导图目录加载失败，请刷新页面。");
        return r.json();
      })
      .then(setCatalog)
      .catch((e) => {
        if (e.name !== "AbortError") setError(String(e.message));
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!catalog || !route.mapId) {
      setMap(undefined);
      return;
    }
    const entry = catalog.maps.find((m) => m.id === route.mapId);
    if (!entry) {
      setError("这份导图不存在或已被移除。请返回导图库选择其他章节。");
      return;
    }
    const cached = mapCache.get(entry.dataUrl);
    if (cached) {
      setMap(cached);
      return;
    }
    setMap(undefined);
    const controller = new AbortController();
    fetch(assetUrl(entry.dataUrl), { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error("导图内容加载失败，请稍后重试。");
        return r.json();
      })
      .then((m: Mindmap) => {
        mapCache.set(entry.dataUrl, m);
        if (mapCache.size > 4) mapCache.delete(mapCache.keys().next().value!);
        setMap(m);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [catalog, route.mapId]);
  useEffect(() => {
    document.title = map
      ? `${map.name} · Xmind Web Viewer`
      : "Xmind Web Viewer · 学习导图库";
  }, [map]);
  if (error)
    return (
      <main className="page-message" role="alert">
        <h1>暂时无法打开</h1>
        <p>{error}</p>
        <div>
          <a href="#/">
            <ArrowLeft size={16} />
            返回导图库
          </a>
          <button onClick={() => location.reload()}>
            <RefreshCw size={16} />
            重新加载
          </button>
        </div>
      </main>
    );
  if (!catalog || (route.mapId && !map))
    return (
      <div className="page-message" role="status">
        <span className="spinner" />
        正在打开知识的脉络…
      </div>
    );
  return route.mapId && map ? (
    <Reader
      key={map.id}
      map={map}
      sheetId={route.sheetId}
      nodeId={route.nodeId}
    />
  ) : (
    <Library catalog={catalog} />
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
