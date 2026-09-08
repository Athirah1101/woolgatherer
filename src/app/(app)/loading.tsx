// Shown instantly by Next.js while a page's data loads, so switching modules
// feels snappy (a skeleton appears immediately instead of a frozen page).
export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 h-8 w-48 rounded bg-gray-200" />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-gray-100" />
        ))}
      </div>
      <div className="mb-4 flex items-center justify-between">
        <div className="h-8 w-56 rounded bg-gray-200" />
        <div className="h-8 w-40 rounded bg-gray-200" />
      </div>
      <div className="space-y-2 rounded-xl border border-border bg-surface p-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-10 rounded bg-gray-100" />
        ))}
      </div>
    </div>
  );
}
