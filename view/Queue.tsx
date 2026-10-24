import {
  CATEGORIES,
  REQUESTERS,
  RISKS,
  SORTS,
  type QueryInput,
  type QueueOutput,
} from "../server/domain/schemas.ts";
import type { ViewSnapshot } from "./sessionStore.ts";

interface QueueProps {
  snapshot: ViewSnapshot;
  onQuery: (partial: QueryInput) => void;
  onSelect: (id: string) => void;
}

const SORT_LABELS: Record<(typeof SORTS)[number], string> = {
  submittedAsc: "Oldest first",
  riskDesc: "Highest risk",
  amountDesc: "Largest amount",
  idAsc: "Request id",
};

export function Queue({ snapshot, onQuery, onSelect }: QueueProps) {
  const { query, queue, queueLoading, queueError, selection } = snapshot;
  const disabled = snapshot.phase !== "ready" || queueLoading;
  return (
    <section aria-labelledby="queue-heading" className="queue">
      <h2 id="queue-heading">Queue</h2>
      <form className="filters" onSubmit={(e) => e.preventDefault()}>
        <label>
          Status
          <select
            value={query.status}
            disabled={disabled}
            onChange={(e) => onQuery({ status: e.target.value as QueryInput["status"] })}
          >
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="all">All</option>
          </select>
        </label>
        <FilterSelect
          label="Category"
          value={query.category}
          options={CATEGORIES}
          disabled={disabled}
          onChange={(v) => onQuery({ category: v as QueryInput["category"] })}
        />
        <FilterSelect
          label="Risk"
          value={query.risk}
          options={RISKS}
          disabled={disabled}
          onChange={(v) => onQuery({ risk: v as QueryInput["risk"] })}
        />
        <FilterSelect
          label="Requester"
          value={query.requesterId}
          options={REQUESTERS}
          disabled={disabled}
          onChange={(v) => onQuery({ requesterId: v as QueryInput["requesterId"] })}
        />
        <label>
          Sort
          <select
            value={query.sort}
            disabled={disabled}
            onChange={(e) => onQuery({ sort: e.target.value as QueryInput["sort"] })}
          >
            {SORTS.map((s) => (
              <option key={s} value={s}>
                {SORT_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
      </form>
      {queueError ? (
        <p role="alert" className="error">
          {queueError}
        </p>
      ) : null}
      {queue ? <QueueTable queue={queue} selectedId={selection.id} onSelect={onSelect} /> : null}
      {!queue && !queueError ? <p className="muted">{queueLoading ? "Loading…" : "Waiting for queue data."}</p> : null}
      {queue ? <Pager queue={queue} disabled={disabled} onQuery={onQuery} /> : null}
    </section>
  );
}

function FilterSelect(props: {
  label: string;
  value: string | null;
  options: readonly string[];
  disabled: boolean;
  onChange: (value: string | undefined) => void;
}) {
  return (
    <label>
      {props.label}
      <select
        value={props.value ?? ""}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.value === "" ? undefined : e.target.value)}
      >
        <option value="">Any</option>
        {props.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function QueueTable(props: { queue: QueueOutput; selectedId: string | null; onSelect: (id: string) => void }) {
  const { queue } = props;
  return (
    <>
      <p className="count" aria-live="polite">
        {queue.total} matching · equipment {queue.facets.category.equipment} · software {queue.facets.category.software} ·
        travel {queue.facets.category.travel} · high risk {queue.facets.risk.high}
      </p>
      {queue.rows.length === 0 ? (
        <p className="muted">No requests match these filters.</p>
      ) : (
        <table>
          <caption className="visually-hidden">Approval requests</caption>
          <thead>
            <tr>
              <th scope="col">Id</th>
              <th scope="col">Title</th>
              <th scope="col">Category</th>
              <th scope="col">Risk</th>
              <th scope="col">Amount</th>
              <th scope="col">Status</th>
              <th scope="col">
                <span className="visually-hidden">Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {queue.rows.map((row) => (
              <tr key={row.id} aria-selected={row.id === props.selectedId}>
                <td>{row.id}</td>
                <td className="title" title={row.titleTruncated ? "Title truncated" : undefined}>
                  {row.title}
                </td>
                <td>{row.category}</td>
                <td>{row.risk}</td>
                <td className="num">{row.amountText}</td>
                <td>{row.status}</td>
                <td>
                  <button type="button" data-action="select" data-id={row.id} onClick={() => props.onSelect(row.id)}>
                    Open<span className="visually-hidden"> {row.id}</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function Pager(props: { queue: QueueOutput; disabled: boolean; onQuery: (partial: QueryInput) => void }) {
  const { query, total, nextOffset, rows } = props.queue;
  const prev = Math.max(0, query.offset - query.pageSize);
  return (
    <nav className="pager" aria-label="Pages">
      <button
        type="button"
        data-action="prev-page"
        disabled={props.disabled || query.offset === 0}
        onClick={() => props.onQuery({ offset: prev })}
      >
        Previous
      </button>
      <span>
        {rows.length === 0 ? 0 : query.offset + 1}–{query.offset + rows.length} of {total}
      </span>
      <button
        type="button"
        data-action="next-page"
        disabled={props.disabled || nextOffset === null}
        onClick={() => nextOffset !== null && props.onQuery({ offset: nextOffset })}
      >
        Next
      </button>
    </nav>
  );
}
