import { isExtensionMessage, type ElementSnapshot } from "@ui-devtools/shared";
import {
  Accessibility,
  Box,
  Code2,
  Crosshair,
  Paintbrush,
  Ruler,
  SquareMousePointer,
} from "lucide-react";
import { useEffect, useState } from "react";

import { connectSidePanelPort, sendMessageToActiveTab } from "../chrome/messaging";

const tabs = [
  { id: "inspect", label: "Inspect", icon: Crosshair },
  { id: "styles", label: "Styles", icon: Paintbrush },
  { id: "box", label: "Box", icon: Box },
  { id: "measure", label: "Measure", icon: Ruler },
  { id: "accessibility", label: "A11y", icon: Accessibility },
  { id: "export", label: "Export", icon: Code2 },
] as const;

export const App = () => {
  const [pickerActive, setPickerActive] = useState(false);
  const [selectedElement, setSelectedElement] = useState<ElementSnapshot | null>(null);
  const [hoveredSelector, setHoveredSelector] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const port = connectSidePanelPort();

    const handleMessage = (rawMessage: unknown) => {
      if (!isExtensionMessage(rawMessage)) {
        return;
      }

      if (rawMessage.type === "ELEMENT_SELECTED") {
        setSelectedElement(rawMessage.payload);
        setPickerActive(false);
        setHoveredSelector(null);
      }

      if (rawMessage.type === "ELEMENT_HOVERED") {
        setHoveredSelector(rawMessage.payload.selector);
      }

      if (rawMessage.type === "PICKER_DISABLE") {
        setPickerActive(false);
      }
    };

    port.onMessage.addListener(handleMessage);
    return () => port.disconnect();
  }, []);

  const togglePicker = async () => {
    setError(null);
    const nextActive = !pickerActive;

    try {
      await sendMessageToActiveTab({ type: nextActive ? "PICKER_ENABLE" : "PICKER_DISABLE" });
      setPickerActive(nextActive);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to reach the active tab.",
      );
      setPickerActive(false);
    }
  };

  return (
    <main className="min-h-screen bg-canvas text-ink">
      <header className="border-b border-slate-200 bg-panel px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-sm font-semibold">UI DevTools</h1>
            <p className="text-xs text-muted">
              {selectedElement?.selector ?? hoveredSelector ?? "No element selected"}
            </p>
          </div>
          <button
            className="inline-flex h-8 items-center gap-2 rounded-md bg-accent px-3 text-xs font-medium text-white shadow-sm transition hover:bg-blue-700"
            onClick={togglePicker}
            type="button"
          >
            <SquareMousePointer aria-hidden="true" size={15} />
            {pickerActive ? "Stop" : "Pick"}
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

      <section className="space-y-3 p-4">
        {error !== null ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-700">
            {error}
          </div>
        ) : null}

        <div className="rounded-lg border border-slate-200 bg-panel p-4 shadow-panel">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">
                {selectedElement === null ? "Selection" : selectedElement.tagName}
              </h2>
              <p className="mt-1 break-all text-xs leading-5 text-muted">
                {selectedElement?.selector ?? hoveredSelector ?? "Idle"}
              </p>
            </div>
            <span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-normal text-slate-600">
              {pickerActive ? "Picking" : "Ready"}
            </span>
          </div>
        </div>
      </section>
    </main>
  );
};
