'use client';

export default function MatchReport({ results }) {
  if (!results) return null;

  const { summary, results: mockupResults } = results;

  return (
    <div className="mb-8">
      <h2 className="text-2xl font-bold text-[#1A1A2E] mb-2">Match Report</h2>
      <p className="text-gray-500 mb-6">
        Overview of detected ad slots and creative matches across all publisher URLs.
      </p>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <SummaryCard
          label="URLs Processed"
          value={summary.urlsProcessed}
          icon="🌐"
        />
        <SummaryCard
          label="Slots Detected"
          value={summary.totalSlotsDetected}
          icon="🎯"
        />
        <SummaryCard
          label="Slots Matched"
          value={summary.totalSlotsMatched}
          icon="✅"
          highlight={summary.totalSlotsMatched > 0}
        />
        <SummaryCard
          label="Errors"
          value={summary.errors}
          icon="⚠️"
          warning={summary.errors > 0}
        />
      </div>

      {/* Per-URL breakdown */}
      <div className="space-y-4">
        {mockupResults.map((result, i) => (
          <div
            key={result.mockupId || i}
            className="bg-white rounded-xl border border-gray-200 p-5"
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="font-semibold text-[#1A1A2E] flex items-center gap-2">
                  {result.status === 'completed' ? '✅' : '❌'}
                  {result.domain}
                </div>
                <div className="text-xs text-gray-400 mt-0.5 truncate max-w-lg">{result.url}</div>
              </div>
              <StatusBadge status={result.status} />
            </div>

            {result.status === 'error' ? (
              <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3">
                {result.error}
              </div>
            ) : result.matchReport ? (
              <div>
                <div className="flex gap-6 text-sm mb-3">
                  <span className="text-gray-500">
                    <strong className="text-[#1A1A2E]">{result.matchReport.totalSlotsDetected}</strong> slots detected
                  </span>
                  <span className="text-gray-500">
                    <strong className="text-green-600">{result.matchReport.totalMatched}</strong> matched
                  </span>
                  <span className="text-gray-500">
                    <strong className="text-orange-500">{result.matchReport.totalUnmatchedSlots}</strong> unmatched
                  </span>
                </div>

                {/* Matched sizes */}
                {result.matchReport.matched.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {result.matchReport.matched.map((m, j) => (
                      <span
                        key={j}
                        className="px-2 py-1 bg-green-50 text-green-700 rounded text-xs font-medium"
                      >
                        {m.sizeKey} ✓
                      </span>
                    ))}
                  </div>
                )}

                {/* Unmatched sizes */}
                {result.matchReport.unmatchedSlots.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {[...new Set(result.matchReport.unmatchedSlots.map(u => u.sizeKey))].map((size, j) => (
                      <span
                        key={j}
                        className="px-2 py-1 bg-orange-50 text-orange-600 rounded text-xs font-medium"
                      >
                        {size} — no creative
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, icon, highlight, warning }) {
  let bg = 'bg-white';
  if (highlight) bg = 'bg-green-50 border-green-200';
  if (warning) bg = 'bg-red-50 border-red-200';

  return (
    <div className={`${bg} rounded-xl border border-gray-200 p-4 text-center`}>
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-3xl font-bold text-[#1A1A2E]">{value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  );
}

function StatusBadge({ status }) {
  if (status === 'completed') {
    return <span className="px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">Completed</span>;
  }
  if (status === 'error') {
    return <span className="px-2.5 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">Error</span>;
  }
  return <span className="px-2.5 py-1 bg-gray-100 text-gray-500 rounded-full text-xs font-medium">{status}</span>;
}
