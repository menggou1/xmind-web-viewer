import { GitFork } from "lucide-react";
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <a className="brand" href="#/" aria-label="返回学习导图库">
      <span className="brand-icon">
        <GitFork size={20} />
      </span>
      <span>
        Xmind<span className="brand-secondary"> Web Viewer</span>
        {!compact && <small>把知识展开，慢慢读懂。</small>}
      </span>
    </a>
  );
}
