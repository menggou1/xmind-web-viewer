export interface MapImage {
  source: string;
  url?: string;
  originalUrl?: string;
  width?: number;
  height?: number;
  error?: string;
}

export type TopicKind =
  "root" | "attached" | "summary" | "detached" | "callout";
export interface MindmapTopic {
  id: string;
  title: string;
  parentId: string | null;
  children: string[];
  auxiliary: string[];
  depth: number;
  order: number;
  kind: TopicKind;
  folded: boolean;
  image?: MapImage;
  href?: string;
  notes?: string;
  labels: string[];
  source: Record<string, unknown>;
}

export interface MindmapSummary {
  id: string;
  topicId: string;
  parentId: string;
  startIndex: number;
  endIndex: number;
  coveredNodeIds: string[];
}

export interface MindmapSheet {
  id: string;
  title: string;
  rootId: string;
  topics: Record<string, MindmapTopic>;
  summaries: MindmapSummary[];
  relationships: {
    id: string;
    source: string;
    target: string;
    title: string;
  }[];
  source: Record<string, unknown>;
}

export interface ParseWarning {
  code: string;
  message: string;
  sheetId?: string;
  topicId?: string;
}
export interface Mindmap {
  schemaVersion: 1;
  id: string;
  name: string;
  folder: string;
  sourcePath: string;
  sha256: string;
  format: "json" | "xml";
  sheets: MindmapSheet[];
  warnings: ParseWarning[];
}

export interface CatalogEntry {
  id: string;
  name: string;
  folder: string;
  sourcePath: string;
  nodeCount: number;
  sheetCount: number;
  imageCount: number;
  summaryCount: number;
  maxDepth: number;
  bytes: number;
  updatedAt?: string;
  warningCount: number;
  dataUrl: string;
}
export interface Catalog {
  schemaVersion: 1;
  maps: CatalogEntry[];
}
