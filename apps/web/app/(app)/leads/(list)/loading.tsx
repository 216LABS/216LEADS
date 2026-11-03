// Skeleton rows while the lead list loads (issue #59), instead of a blank page. It lives in the
// (list) group so it doesn't wrap /leads/[id]: under this boundary router.refresh() fetched the
// new lead detail but never showed it, so saved statuses and notes looked lost (issue #75).
export default function LeadsLoading() {
  return (
    <div aria-busy="true" aria-label="Loading your leads">
      <div className="mb-4 h-8 w-32 animate-pulse rounded-[10px] bg-line" />
      <div className="mb-6 h-4 w-64 animate-pulse rounded-[10px] bg-line" />
      <ul className="space-y-4">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i} className="card flex gap-4 p-4">
            <div className="h-10 w-10 shrink-0 animate-pulse rounded-[10px] bg-line" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/2 animate-pulse rounded-[10px] bg-line" />
              <div className="h-4 w-3/4 animate-pulse rounded-[10px] bg-line" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
