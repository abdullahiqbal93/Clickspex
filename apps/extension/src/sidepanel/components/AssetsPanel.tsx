import { Download, Image as ImageIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import { sendMessageToActiveTab } from "../../chrome/messaging";
import { usePanelStore } from "../store";

export const AssetsPanel = () => {
  const scan = usePanelStore((state) => state.pageScan);
  const loading = usePanelStore((state) => state.pageScanLoading);
  const assetFetch = usePanelStore((state) => state.assetFetch);
  const setAssetFetch = usePanelStore((state) => state.setAssetFetch);
  const setError = usePanelStore((state) => state.setError);
  const pendingDownloads = useRef(new Map<string, string>());

  useEffect(() => {
    if (assetFetch === null) {
      return;
    }

    const filename = pendingDownloads.current.get(assetFetch.src);

    if (filename === undefined) {
      return;
    }

    pendingDownloads.current.delete(assetFetch.src);
    setAssetFetch(null);

    if (assetFetch.dataUrl === null) {
      setError(assetFetch.error ?? "Unable to download this asset (cross-origin).");
      return;
    }

    const anchor = document.createElement("a");
    anchor.href = assetFetch.dataUrl;
    anchor.download = filename;
    anchor.click();
  }, [assetFetch, setAssetFetch, setError]);

  if (loading || !scan) {
    return (
      <div className="ub-card p-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <ImageIcon aria-hidden="true" size={16} />
          </span>
          <div>
            <h2 className="text-sm font-semibold tracking-tight">Assets</h2>
            <p className="text-2xs text-muted">{loading ? "Scanning page assets…" : "Idle"}</p>
          </div>
        </div>
      </div>
    );
  }

  const downloadAsset = async (url: string, filename: string) => {
    // data: URLs download directly; remote URLs are fetched by the content
    // script in the page context, which has the page's origin privileges.
    if (url.startsWith("data:")) {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      return;
    }

    setError(null);
    pendingDownloads.current.set(url, filename);
    try {
      await sendMessageToActiveTab({ type: "FETCH_ASSET", payload: { src: url } });
    } catch (caughtError) {
      pendingDownloads.current.delete(url);
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to download the asset.",
      );
    }
  };

  return (
    <div className="space-y-3">
      <section className="ub-card p-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <ImageIcon aria-hidden="true" size={16} />
          </span>
          <div>
            <h2 className="text-sm font-semibold tracking-tight">Assets</h2>
            <p className="text-2xs text-muted">
              {scan.assets.length} images, SVGs &amp; backgrounds on this page.
            </p>
          </div>
        </div>
      </section>

      {scan.assets.length === 0 ? (
        <section className="ub-card p-6 text-center text-xs text-muted">No assets found</section>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          {scan.assets.map((asset, i) => (
            <div key={i} className="ub-card flex flex-col overflow-hidden">
              <div className="group relative flex h-24 items-center justify-center bg-[repeating-conic-gradient(#f1f5f9_0%_25%,#ffffff_0%_50%)] bg-[length:16px_16px] p-2">
                <img
                  src={asset.src}
                  alt={asset.alt}
                  className="max-h-full max-w-full object-contain"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-ink/40 opacity-0 backdrop-blur-[1px] transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() =>
                      void downloadAsset(
                        asset.src,
                        `asset-${i}.${asset.type === "svg" ? "svg" : "png"}`,
                      )
                    }
                    className="rounded-full bg-panel p-2 text-ink shadow-pop transition-transform hover:scale-110"
                    title="Download"
                    type="button"
                  >
                    <Download size={15} />
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-line bg-panel px-2.5 py-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-accent">
                  {asset.type}
                </span>
                <span className="font-mono text-[10px] tabular-nums text-muted">
                  {asset.width}×{asset.height}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};