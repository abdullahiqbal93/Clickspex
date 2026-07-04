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
      <section className="ub-card p-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <PlaySquare aria-hidden="true" size={16} />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight">Motion &amp; Scrubber</h2>
            <p className="text-2xs text-muted">
              Control playback speed of all CSS animations and transitions.
            </p>
          </div>
        </div>

        <div className="mt-4 border-t border-line pt-4">
          <h3 className="ub-heading">Playback speed</h3>

          {error && (
            <div className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-2xs text-rose-700">
              {error}
            </div>
          )}

          <div className="mt-3 flex items-center gap-3">
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={speed}
              onChange={(e) => void handleSpeedChange(parseFloat(e.target.value))}
              className="w-full accent-accent"
            />
            <span className="ub-chip w-12 justify-center tabular-nums">{speed.toFixed(1)}x</span>
          </div>

          <div className="mt-3 grid grid-cols-4 gap-1.5">
            {[0, 0.25, 0.5, 1].map((preset) => (
              <button
                key={preset}
                onClick={() => void handleSpeedChange(preset)}
                type="button"
                className={`rounded-xl py-1.5 text-xs font-medium transition-colors ${
                  speed === preset
                    ? "bg-accent text-white shadow-sm"
                    : "bg-accent-softer text-muted hover:bg-accent-soft hover:text-ink"
                }`}
              >
                {preset === 0 ? "Pause" : `${preset}x`}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};