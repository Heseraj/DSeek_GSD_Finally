// Test harness — shared mocks for every vitest file (03-RESEARCH.md:511,
// 03-PATTERNS.md:428-434). Loaded via vitest.config.ts setupFiles.
import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// vitest.config.ts does not enable `globals`, so @testing-library/react's
// auto-cleanup never registers. Without this, mounted components from earlier
// tests stay subscribed to the shared zustand store and re-render on later
// tests' setState — duplicate matches / cross-test DOM bleed. (03-02 Task 1)
afterEach(() => cleanup());

// ---------------------------------------------------------------------------
// 1. EventSource class mock — constructor captures the instance into a shared
//    registry; tests dispatch synthetic `open` / `error` / `message` events
//    (`message` carries `{ data: JSON.stringify(frame) }`); `close()` records a
//    closed flag; `readyState` is mutable for CONNECTING/OPEN/CLOSED mapping.
// ---------------------------------------------------------------------------
export interface MockEventSourceEvent {
  data?: string;
  type?: string;
}

export class MockEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;

  static instances: MockEventSource[] = [];

  url: string;
  readyState: number = MockEventSource.CONNECTING;
  closed = false;
  onopen: ((ev: MockEventSourceEvent) => void) | null = null;
  onerror: ((ev: MockEventSourceEvent) => void) | null = null;
  onmessage: ((ev: MockEventSourceEvent) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  /** Dispatch a synthetic event to the corresponding handler. */
  __emit(type: 'open' | 'error' | 'message', payload?: MockEventSourceEvent) {
    const ev: MockEventSourceEvent = { type, ...payload };
    if (type === 'open' && this.onopen) this.onopen(ev);
    if (type === 'error' && this.onerror) this.onerror(ev);
    if (type === 'message' && this.onmessage) this.onmessage(ev);
  }

  close() {
    this.closed = true;
    this.readyState = MockEventSource.CLOSED;
  }
}

vi.stubGlobal('EventSource', MockEventSource);

// ---------------------------------------------------------------------------
// 2. Global fetch mock — every test file can `vi.mocked(fetch)` without
//    per-file stubbing (03-PATTERNS.md:433).
// ---------------------------------------------------------------------------
vi.stubGlobal('fetch', vi.fn());

// ---------------------------------------------------------------------------
// 3. lightweight-charts module mock — hoisted factory so canvas components
//    render safely in jsdom; chart instances captured for lifecycle assertions.
// ---------------------------------------------------------------------------
const lwc = vi.hoisted(() => {
  const charts: { remove: ReturnType<typeof vi.fn>; applyOptions: ReturnType<typeof vi.fn> }[] = [];
  return {
    charts,
    createChart: vi.fn(() => {
      const chart = {
        addSeries: vi.fn(() => ({ setData: vi.fn(), update: vi.fn() })),
        timeScale: vi.fn(() => ({ fitContent: vi.fn() })),
        applyOptions: vi.fn(),
        remove: vi.fn(),
      };
      charts.push(chart as never);
      return chart;
    }),
  };
});

vi.mock('lightweight-charts', () => ({
  createChart: lwc.createChart,
  AreaSeries: { name: 'AreaSeries' },
  LineSeries: { name: 'LineSeries' },
  ColorType: { Solid: 'solid' },
}));
