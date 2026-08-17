import * as React from "react";
import { formatCents } from "@/lib/commerce/money";
import { seriesCountPeak, seriesPeak } from "@/lib/analytics/compute";
import type { Series, StatusCount } from "@/lib/analytics/types";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Charts, drawn on the server as inline SVG.
 *
 * NO CHARTING LIBRARY, deliberately. Recharts or Chart.js would pull a
 * client-side runtime and a hydration boundary into an admin that is otherwise
 * entirely server-rendered, to draw two shapes. The whole of what Phase 7 needs
 * is a bar per bucket and a proportional bar per status; both are a `map` over
 * a rect.
 *
 * ACCESSIBILITY
 *
 * An SVG is invisible to a screen reader no matter how it is labelled, so every
 * chart is accompanied by the same numbers as a visually-hidden table. That is
 * the WCAG-conformant answer (SC 1.1.1) and it is also what makes the figures
 * copyable. `role="img"` plus a summary label carries the shape; the table
 * carries the data.
 *
 * RESPONSIVENESS
 *
 * A `viewBox` with `width: 100%` scales to the container, so the same markup
 * works on a studio laptop and on a phone. Labels are thinned rather than
 * rotated — an axis of overlapping dates is worse than an axis of four.
 */

const CHART_WIDTH = 720;
const CHART_HEIGHT = 200;
const AXIS_HEIGHT = 22;

function thinnedIndices(count: number, maximum: number): Set<number> {
  if (count <= maximum) return new Set(Array.from({ length: count }, (_, index) => index));
  const step = Math.ceil(count / maximum);
  const kept = new Set<number>();
  for (let index = 0; index < count; index += step) kept.add(index);
  kept.add(count - 1);
  return kept;
}

export function SeriesChart({
  series,
  mode,
  title,
  emptyTitle,
  emptyDescription,
}: {
  series: Series;
  /** Whether the bars measure money or a count. */
  mode: "money" | "count";
  title: string;
  emptyTitle: string;
  emptyDescription: string;
}) {
  const points = series.points;

  const hasData = points.some((point) => (mode === "money" ? point.cents : point.count) > 0);
  if (points.length === 0 || !hasData) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  const peak = mode === "money" ? seriesPeak(points) : seriesCountPeak(points);
  const plotHeight = CHART_HEIGHT - AXIS_HEIGHT;
  const slot = CHART_WIDTH / points.length;
  const barWidth = Math.max(2, Math.min(28, slot * 0.62));
  const labelled = thinnedIndices(points.length, 8);

  const format = (point: (typeof points)[number]) =>
    mode === "money" ? formatCents(point.cents, series.currency) : String(point.count);

  return (
    <figure className="flex flex-col gap-3">
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${title}. Peak ${
          mode === "money" ? formatCents(peak, series.currency) : peak
        } across ${points.length} ${series.granularity === "day" ? "days" : "months"}. The same figures follow as a table.`}
        className="h-[200px] w-full"
      >
        <line
          x1={0}
          y1={plotHeight}
          x2={CHART_WIDTH}
          y2={plotHeight}
          stroke="currentColor"
          strokeWidth={1}
          className="text-border"
        />
        {points.map((point, index) => {
          const value = mode === "money" ? point.cents : point.count;
          const height = value > 0 ? Math.max(2, (value / peak) * (plotHeight - 8)) : 0;
          const x = index * slot + (slot - barWidth) / 2;
          return (
            <rect
              key={point.key}
              x={x}
              y={plotHeight - height}
              width={barWidth}
              height={height}
              rx={1}
              className="fill-primary"
            />
          );
        })}
        {points.map((point, index) =>
          labelled.has(index) ? (
            <text
              key={`label-${point.key}`}
              x={index * slot + slot / 2}
              y={CHART_HEIGHT - 6}
              textAnchor="middle"
              className="fill-current text-muted-foreground"
              style={{ fontSize: "11px" }}
            >
              {point.label}
            </text>
          ) : null,
        )}
      </svg>

      <figcaption className="sr-only">
        <table>
          <caption>{title}</caption>
          <thead>
            <tr>
              <th scope="col">Period</th>
              <th scope="col">{mode === "money" ? "Revenue" : "Count"}</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.key}>
                <th scope="row">{point.label}</th>
                <td>{format(point)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>

      {series.ungapped ? (
        <p className="text-metadata text-muted-foreground">
          Only periods containing activity are shown — over all time there is no start
          date to count empty periods from.
        </p>
      ) : null}
    </figure>
  );
}

/**
 * A status distribution.
 *
 * A list of proportional bars rather than a pie chart. A pie of eight
 * fulfilment statuses is unreadable at any size, and comparing two slices by
 * angle is measurably harder than comparing two bars by length. Zero-count
 * statuses are kept: "no cancelled orders" is a fact worth stating, and hiding
 * empty categories makes the remaining bars look like the whole picture.
 */
export function DistributionBars({
  rows,
  emptyLabel,
}: {
  rows: StatusCount[];
  emptyLabel: string;
}) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);

  if (total === 0) {
    return <p className="text-body-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((row) => {
        const percent = total > 0 ? (row.count / total) * 100 : 0;
        return (
          <li key={row.status} className="flex items-center gap-4">
            <span className="text-body-sm w-44 shrink-0 truncate">{row.label}</span>
            <span
              className="h-2 min-w-px flex-1 rounded-full bg-surface-sunken"
              aria-hidden="true"
            >
              <span
                className="block h-2 rounded-full bg-primary"
                style={{ width: `${percent.toFixed(2)}%` }}
              />
            </span>
            <span className="text-body-sm w-24 shrink-0 text-right tabular-nums text-muted-foreground">
              {row.count} ({percent.toFixed(0)}%)
            </span>
          </li>
        );
      })}
    </ul>
  );
}
