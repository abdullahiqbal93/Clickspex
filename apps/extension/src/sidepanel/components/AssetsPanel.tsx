import { Download, Image as ImageIcon } from "lucide-react";

import { usePanelStore } from "../store";

export const AssetsPanel = () => {
  const scan = usePanelStore((state) => state.pageScan);
  const loading = usePanelStore((state) => state.pageScanLoading);

  if (loading || !scan) {
    return (
      <div className="rounded-lg border border-border bg-panel/80 backdrop-blur-sm p-4 shadow-card">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ImageIcon aria-hidden="true" size={16} />
          Assets
        </div>
        <p className="mt-2 text-xs text-muted">{loading ? "Scanning page assets..." : "Idle"}</p>
      </div>
    );
  }

  const downloadAsset = async (url: string, filename: string) => {
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-3">
      <section className="rounded-lg border border-border bg-panel/80 backdrop-blur-sm p-4 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <ImageIcon size={16} />
              Assets
            </h2>
            <p className="mt-1 break-all text-xs text-muted">
              Images, SVGs, and backgrounds found on the page.
            </p>
          </div>
        </div>
      </section>

      {scan.assets.length === 0 ? (
        <section className="rounded-lg border border-border bg-panel/80 backdrop-blur-sm p-4 shadow-card text-xs text-muted">
          No assets found
        </section>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {scan.assets.map((asset, i) => (
            <div
              key={i}
              className="flex flex-col overflow-hidden rounded-lg border border-border bg-panel/80 backdrop-blur-sm shadow-sm"
            >
              <div className="flex h-24 items-center justify-center bg-slate-100 p-2 relative group">
                <img
                  src={asset.src}
                  alt={asset.alt}
                  className="max-h-full max-w-full object-contain"
                />
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() =>
                      void downloadAsset(
                        asset.src,
                        `asset-${i}.${asset.type === "svg" ? "svg" : "png"}`,
                      )
                    }
                    className="p-2 bg-white rounded-full text-slate-900 hover:scale-110 transition-transform"
                    title="Download"
                  >
                    <Download size={16} />
                  </button>
                </div>
              </div>
              <div className="p-2 border-t border-slate-100 bg-white">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase text-slate-500">
                    {asset.type}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {asset.width}×{asset.height}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
