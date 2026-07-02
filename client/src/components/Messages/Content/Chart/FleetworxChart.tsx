import React, { memo, useMemo, useRef, useState, useCallback } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { createPortal } from 'react-dom';
import zoomPlugin from 'chartjs-plugin-zoom';
import { ZoomIn, ZoomOut, RotateCcw, Maximize2, Minimize2 } from 'lucide-react';
import { Bar, Pie, Line, Doughnut } from 'react-chartjs-2';

// Register Chart.js components once
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  zoomPlugin,
);

interface ChartDataset {
  label?: string;
  data: number[];
  backgroundColor?: string | string[];
  borderColor?: string | string[];
  borderWidth?: number;
}

interface ChartSpec {
  type: string;
  title?: string;
  labels: string[];
  datasets: ChartDataset[];
  download_url?: string;
  // Optional cosmetic Chart.js options from the backend (e.g. axis min/max/step).
  // Deep-merged over the renderer defaults so requests like "y-axis start at
  // 300,000 with steps of 10,000" are honoured.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options?: Record<string, any>;
}

interface FleetworxChartProps {
  children: string;
}

// Fleetworx 2025 brand palette (fallback when the backend omits colours).
const DEFAULT_COLOURS = [
  '#00798F',
  '#F99D3E',
  '#36BFBE',
  '#2D2D2C',
  '#FDCC99',
  '#E3E9EC',
  '#EBF6F5',
  '#FFEDDB',
];

/** Deep-merge `source` onto `target` (objects merged, other values overwrite). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deepMerge(target: any, source: any): any {
  if (!source || typeof source !== 'object') {
    return target;
  }
  for (const key of Object.keys(source)) {
    const sv = source[key];
    if (sv && typeof sv === 'object' && !Array.isArray(sv)) {
      target[key] = deepMerge(
        target[key] && typeof target[key] === 'object' ? target[key] : {},
        sv,
      );
    } else {
      target[key] = sv;
    }
  }
  return target;
}

const FleetworxChart: React.FC<FleetworxChartProps> = memo(({ children }) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef = useRef<any>(null);
  const [expanded, setExpanded] = useState(false);
  const zoomIn = useCallback(() => chartRef.current?.zoom(1.15), []);
  const zoomOut = useCallback(() => chartRef.current?.zoom(0.87), []);
  const resetZoom = useCallback(() => chartRef.current?.resetZoom(), []);

  const spec = useMemo<ChartSpec | null>(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = JSON.parse(children.trim()) as any;
      if (!raw || typeof raw !== 'object') {
        return null;
      }

      // Accept BOTH supported shapes:
      //   • flat (our chart tool):     { type, title, labels, datasets }
      //   • nested (standard Chart.js): { type, data: { labels, datasets }, options }
      // Normalise nested → flat so the renderer only deals with one shape.
      const hasNested = raw.data && (raw.data.labels || raw.data.datasets);
      const labels = raw.labels ?? raw.data?.labels;
      const datasets = raw.datasets ?? raw.data?.datasets;
      const title =
        raw.title ??
        raw.options?.plugins?.title?.text ?? // Chart.js v3+
        raw.options?.title?.text; // Chart.js v2

      if (!labels || !datasets) {
        return hasNested || raw.type ? ({ type: raw.type } as ChartSpec) : null;
      }

      return {
        type: raw.type,
        title,
        labels,
        datasets,
        download_url: raw.download_url,
        // Carry cosmetic options through (nested Chart.js shape or flat).
        options: raw.options ?? raw.data?.options,
      } as ChartSpec;
    } catch {
      return null;
    }
  }, [children]);

  // While streaming, JSON is incomplete — show loading instead of error
  if (!spec || !spec.labels || !spec.datasets?.length) {
    const trimmed = children.trim();
    const looksLikeStreaming = !trimmed.endsWith('}') || trimmed.length < 20;

    if (looksLikeStreaming) {
      return (
        <div className="my-3 flex items-center gap-2 rounded-xl border border-border-light bg-white p-6 dark:bg-white">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          <span className="text-sm text-gray-500">Loading chart...</span>
        </div>
      );
    }

    return (
      <div className="my-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/20 dark:text-red-400">
        Unable to render chart: invalid data format.
      </div>
    );
  }

  const chartType = (spec.type || 'bar').toLowerCase();

  // Ensure datasets have colours
  const datasets = spec.datasets.map((ds, i) => ({
    ...ds,
    backgroundColor: ds.backgroundColor || DEFAULT_COLOURS.slice(0, spec.labels.length),
    borderColor:
      ds.borderColor ||
      (chartType === 'line' ? DEFAULT_COLOURS[i % DEFAULT_COLOURS.length] : '#ffffff'),
    borderWidth: ds.borderWidth ?? (chartType === 'line' ? 2 : 1),
  }));

  const data = {
    labels: spec.labels,
    datasets,
  };

  // Build base options — cast to `any` to avoid Chart.js strict per-type generics
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const options: any = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: chartType === 'horizontalbar' ? 'y' : 'x',
    plugins: {
      title: {
        display: !!spec.title,
        text: spec.title || '',
        font: { size: 14, weight: 'bold' },
        color: '#374151',
      },
      legend: {
        display: chartType === 'pie' || chartType === 'doughnut' || datasets.length > 1,
        position: 'bottom',
        labels: {
          color: '#374151',
          padding: 16,
        },
      },
    },
  };

  // Add scales only for non-circular charts
  if (chartType !== 'pie' && chartType !== 'doughnut') {
    options.scales = {
      x: {
        ticks: { color: '#6B7280' },
        grid: { color: '#E5E7EB' },
      },
      y: {
        beginAtZero: true,
        ticks: {
          color: '#6B7280',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          callback: (value: any) => {
            const num = Number(value);
            if (!isNaN(num) && Math.abs(num) >= 1000) {
              return num.toLocaleString();
            }
            return value;
          },
        },
        grid: { color: '#E5E7EB' },
      },
    };
  }

  // Interactive pan/zoom for cartesian charts (driven by the toolbar buttons,
  // drag-to-pan, and pinch on touch). Wheel zoom is OFF so it never hijacks the
  // page scroll while reading the chat.
  const isCartesian = chartType !== 'pie' && chartType !== 'doughnut';
  if (isCartesian) {
    options.plugins.zoom = {
      pan: { enabled: true, mode: 'xy' },
      zoom: {
        wheel: { enabled: false },
        pinch: { enabled: true },
        drag: { enabled: false },
        mode: 'xy',
      },
    };
  }

  // Honour cosmetic options supplied by the backend (e.g. axis min/max/step,
  // legend position), deep-merged over the defaults above. This is what makes
  // "set the y-axis to start at 300,000 with steps of 10,000" actually apply.
  if (spec.options) {
    deepMerge(options, spec.options);
  }

  const renderChart = () => {
    switch (chartType) {
      case 'pie':
        return <Pie ref={chartRef} data={data} options={options} />;
      case 'doughnut':
        return <Doughnut ref={chartRef} data={data} options={options} />;
      case 'line':
        return <Line ref={chartRef} data={data} options={options} />;
      case 'horizontalbar':
      case 'bar':
      default:
        return <Bar ref={chartRef} data={data} options={options} />;
    }
  };

  const btnCls =
    'rounded-md bg-white/90 p-1.5 text-gray-600 shadow-sm ring-1 ring-gray-200 transition hover:bg-gray-100 hover:text-gray-900';

  const toolbar = (
    <div className="absolute right-1 top-1 z-10 flex gap-1">
      {isCartesian && (
        <>
          <button
            type="button"
            onClick={zoomIn}
            aria-label="Zoom in"
            title="Zoom in"
            className={btnCls}
          >
            <ZoomIn size={15} />
          </button>
          <button
            type="button"
            onClick={zoomOut}
            aria-label="Zoom out"
            title="Zoom out"
            className={btnCls}
          >
            <ZoomOut size={15} />
          </button>
          <button
            type="button"
            onClick={resetZoom}
            aria-label="Reset zoom"
            title="Reset zoom"
            className={btnCls}
          >
            <RotateCcw size={15} />
          </button>
        </>
      )}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-label={expanded ? 'Exit fullscreen' : 'Enlarge chart'}
        title={expanded ? 'Exit fullscreen' : 'Enlarge chart'}
        className={btnCls}
      >
        {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
      </button>
    </div>
  );

  const card = (
    <div
      className={`w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm ${
        expanded ? 'flex h-full flex-col p-4' : 'my-3 p-5'
      }`}
    >
      <div
        className={`relative ${expanded ? 'min-h-0 flex-1' : ''}`}
        style={{ height: expanded ? '100%' : '400px', maxWidth: '100%' }}
      >
        {toolbar}
        {renderChart()}
      </div>
      {spec.download_url && (
        <div className="mt-3 border-t border-gray-200 pt-3 text-sm">
          <a
            href={spec.download_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-blue-600 hover:underline"
          >
            <span>📥</span>
            <span>Download Excel with backing data</span>
          </a>
        </div>
      )}
    </div>
  );

  if (expanded) {
    // Render the overlay via a portal on <body> so it escapes any ancestor with
    // a transform/filter (message containers) — otherwise `fixed` anchors to
    // that ancestor and the "fullscreen" chart only covers the message column.
    return createPortal(
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        onClick={() => setExpanded(false)}
        role="dialog"
        aria-modal="true"
      >
        <div className="h-[90vh] w-[92vw] max-w-6xl" onClick={(e) => e.stopPropagation()}>
          {card}
        </div>
      </div>,
      document.body,
    );
  }

  return card;
});

FleetworxChart.displayName = 'FleetworxChart';

export default FleetworxChart;
