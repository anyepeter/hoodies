// Re-mounts on every navigation, so each page fades up into place instead of snapping in.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-in">{children}</div>;
}
