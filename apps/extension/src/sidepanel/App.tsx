import { Accessibility, Box, Code2, Crosshair, Paintbrush, Ruler } from "lucide-react";

const tabs = [
  { id: "inspect", label: "Inspect", icon: Crosshair },
  { id: "styles", label: "Styles", icon: Paintbrush },
  { id: "box", label: "Box", icon: Box },
  { id: "measure", label: "Measure", icon: Ruler },
  { id: "accessibility", label: "A11y", icon: Accessibility },
  { id: "export", label: "Export", icon: Code2 },
] as const;

export const App = () => (
  <main className="min-h-screen bg-canvas text-ink">
    <header className="border-b border-slate-200 bg-panel px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-sm font-semibold">UI DevTools</h1>
          <p className="text-xs text-muted">Visual inspection workspace</p>
        </div>
        <button className="inline-flex h-8 items-center gap-2 rounded-md bg-accent px-3 text-xs font-medium text-white shadow-sm">
          <Crosshair aria-hidden="true" size={15} />
          Pick
        </button>
      </div>
    </header>

    <nav
      className="grid grid-cols-6 border-b border-slate-200 bg-panel"
      aria-label="Panel sections"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <button
            className="flex h-12 flex-col items-center justify-center gap-1 text-[10px] font-medium text-slate-600 transition hover:bg-slate-50 hover:text-ink"
            key={tab.id}
            type="button"
          >
            <Icon aria-hidden="true" size={15} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>

    <section className="space-y-4 p-4">
      <div className="rounded-lg border border-slate-200 bg-panel p-4 shadow-panel">
        <h2 className="text-sm font-semibold">No element selected</h2>
        <p className="mt-1 text-xs leading-5 text-muted">
          Use the picker to select an element on the current page. Cross-origin iframes are outside
          the v1 inspection scope.
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-panel p-4 shadow-panel">
        <h2 className="text-sm font-semibold">MVP scope</h2>
        <p className="mt-1 text-xs leading-5 text-muted">
          The shell is ready for typed message routing, Shadow DOM overlays, live style injection,
          measurements, accessibility checks, and export views.
        </p>
      </div>
    </section>
  </main>
);
