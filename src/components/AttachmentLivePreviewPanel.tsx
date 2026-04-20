import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PlusCircle, MinusCircle, RefreshCcw, Maximize2, X } from 'lucide-react';

type PreviewFile = {
  name: string;
  type?: string;
  data?: string;
  storageKey?: string;
};

interface AttachmentLivePreviewPanelProps {
  file: PreviewFile | null;
}

const AttachmentLivePreviewPanel: React.FC<AttachmentLivePreviewPanelProps> = ({ file }) => {
  const [zoom, setZoom] = useState(1);
  const [isFullViewOpen, setIsFullViewOpen] = useState(false);
  const imageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fullImageCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!isFullViewOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isFullViewOpen]);

  useEffect(() => {
    setZoom(1);
  }, [file?.storageKey, file?.name]);

  const openFullPreview = () => {
    if (!file?.data) return;
    setIsFullViewOpen(true);
  };

  const isImage = useMemo(() => Boolean(file?.type?.includes('image')), [file?.type]);
  const isPdf = useMemo(() => {
    if (!file) return false;
    return Boolean(file.type?.includes('pdf') || file.data?.startsWith('data:application/pdf'));
  }, [file?.type, file?.data, file?.name]);
  const isText = useMemo(() => {
    if (!file) return false;
    return Boolean(file.type?.includes('text') || file.data?.startsWith('data:text/plain'));
  }, [file?.type, file?.data]);
  const textContent = useMemo(() => {
    if (!isText || !file?.data) return '';
    const commaIdx = file.data.indexOf(',');
    if (commaIdx < 0) return '';
    try {
      return decodeURIComponent(file.data.slice(commaIdx + 1));
    } catch {
      return '';
    }
  }, [isText, file?.data]);

  const zoomPct = Math.round(zoom * 100);
  const canRender = Boolean(file?.data && (isImage || isPdf || isText));

  useEffect(() => {
    if (!isImage || !file?.data) return;
    const renderOnCanvas = (canvas: HTMLCanvasElement | null) => {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const img = new Image();
      img.onload = () => {
        const srcW = img.naturalWidth || img.width;
        const srcH = img.naturalHeight || img.height;
        const drawW = Math.max(1, Math.round(srcW * zoom));
        const drawH = Math.max(1, Math.round(srcH * zoom));
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        canvas.width = Math.max(1, Math.round(drawW * dpr));
        canvas.height = Math.max(1, Math.round(drawH * dpr));
        canvas.style.width = `${drawW}px`;
        canvas.style.height = `${drawH}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, drawW, drawH);
        // Keep zoomed-in content crisp instead of soft/blurry.
        ctx.imageSmoothingEnabled = zoom <= 1;
        ctx.imageSmoothingQuality = zoom <= 1 ? 'high' : 'low';
        ctx.drawImage(img, 0, 0, drawW, drawH);
      };
      img.src = file.data!;
    };
    renderOnCanvas(imageCanvasRef.current);
    renderOnCanvas(fullImageCanvasRef.current);
  }, [file?.data, file?.storageKey, file?.name, isImage, zoom, isFullViewOpen]);
  const renderPreview = (heightClass: string) => {
    if (!file) {
      return <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">No report attachment available</p>;
    }
    if (!canRender) {
      return <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Preview unavailable for this file type</p>;
    }
    const previewId = file.storageKey ?? file.name;
    if (isPdf) {
      return (
        <div className={`w-full ${heightClass} overflow-auto`}>
          <div
            style={{
              width: `${100 / zoom}%`,
              height: `${100 / zoom}%`,
              minWidth: '100%',
              minHeight: '100%',
              transform: `scale(${zoom})`,
              transformOrigin: 'center top',
              willChange: 'transform',
            }}
          >
            <iframe
              key={previewId}
              title={file.name}
              src={file.data}
              className="w-full h-full bg-white rounded border-0"
            />
          </div>
        </div>
      );
    }
    if (isText) {
      return (
        <div className={`w-full ${heightClass} overflow-auto p-3`}>
          <pre className="whitespace-pre-wrap break-words text-xs md:text-sm font-medium text-slate-700 dark:text-slate-200 leading-relaxed">
            {textContent || 'No report text available'}
          </pre>
        </div>
      );
    }
    const isFullHeight = heightClass.includes('calc(100vh');
    return (
      <div className={`w-full ${heightClass} overflow-auto flex items-start justify-center`}>
        <canvas
          key={`${previewId}-${isFullHeight ? 'full' : 'panel'}`}
          ref={isFullHeight ? fullImageCanvasRef : imageCanvasRef}
          aria-label={file.name}
          className="rounded max-w-none"
        />
      </div>
    );
  };

  return (
    <>
      <div className="mb-2 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <div className="h-8 px-2.5 flex items-center justify-between border-b border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200">
          <p className="text-[10px] font-black tracking-wider uppercase">Document Viewer</p>
          <div className="flex items-center gap-1 text-[10px]">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              title="Zoom out"
            >
              <MinusCircle className="w-3.5 h-3.5" />
            </button>
            <span className="font-bold min-w-[36px] text-center">{zoomPct}%</span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(2.5, z + 0.1))}
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              title="Zoom in"
            >
              <PlusCircle className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              title="Reset zoom"
            >
              <RefreshCcw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={openFullPreview}
              disabled={!file?.data}
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title={file?.data ? 'Open full view' : 'No file loaded'}
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="h-[min(22rem,55vh)] md:h-[min(32rem,65vh)] bg-slate-100 dark:bg-[#17213a] flex items-center justify-center overflow-auto p-2">
          {renderPreview('h-full')}
        </div>
      </div>
      {isFullViewOpen && (
        <div className="fixed inset-0 z-[9999] bg-white/95 dark:bg-slate-950/95 flex flex-col">
          <div className="sticky top-0 z-20 h-14 px-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">
            <p className="text-xs font-black uppercase tracking-wide truncate">{file?.name || 'Full Preview'}</p>
            <button
              type="button"
              onClick={() => setIsFullViewOpen(false)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors border border-slate-300 dark:border-slate-600"
              title="Close full view"
            >
              <X className="w-5 h-5" />
              <span className="text-xs font-black uppercase tracking-wide">Close</span>
            </button>
          </div>
          <div className="flex-1 overflow-auto p-4 bg-slate-100 dark:bg-[#0f172a] flex items-center justify-center">
            {renderPreview('h-[calc(100vh-8rem)]')}
          </div>
        </div>
      )}
    </>
  );
};

export default AttachmentLivePreviewPanel;
