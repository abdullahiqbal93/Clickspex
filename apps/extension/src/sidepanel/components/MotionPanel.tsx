import { PlaySquare } from "lucide-react";
import { useState } from "react";

import { sendMessageToActiveTab } from "../../chrome/messaging";

export const MotionPanel = () => {
  const [speed, setSpeed] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);

  const handleSpeedChange = async (newSpeed: number) => {
    setSpeed(newSpeed);
    setError(null);
    try {
      await sendMessageToActiveTab({ type: "SET_ANIMATION_SPEED", payload: { speed: newSpeed } });
    } catch {
      setError("Failed to communicate with the page.");
    }
  };

  return (
    <div className="space-y-3">
      <section className="rounded-lg border border-slate-200 bg-panel p-4 shadow-panel">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <PlaySquare size={16} />
              Motion & Scrubber
            </h2>
            <p className="mt-1 text-xs text-muted">
              Control the playback speed of all CSS animations and transitions on the page.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-panel p-4 shadow-panel">
        <h3 className="text-sm font-semibold mb-3">Playback Speed</h3>

        {error && <div className="text-xs text-red-600 mb-3">{error}</div>}

        <div className="flex items-center gap-2 mb-4">
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={speed}
            onChange={(e) => void handleSpeedChange(parseFloat(e.target.value))}
            className="w-full accent-accent"
          />
          <span className="text-xs font-mono font-medium text-slate-700 w-10 text-right">
            {speed.toFixed(1)}x
          </span>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {[0, 0.25, 0.5, 1].map((preset) => (
            <button
              key={preset}
              onClick={() => void handleSpeedChange(preset)}
              className={`py-1.5 text-xs font-medium rounded-md border transition ${
                speed === preset
                  ? "border-accent bg-accent text-white"
                  : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
              }`}
            >
              {preset === 0 ? "Pause" : `${preset}x`}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};
