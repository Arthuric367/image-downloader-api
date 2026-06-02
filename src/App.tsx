import React, { useState, useRef } from 'react';
import { Search, Download, X, ImageIcon, RefreshCw, Archive } from 'lucide-react';
import { fetchImages, downloadImage, downloadAllImages } from './utils/imageUtils';

interface ImageItem {
  url: string;
  selected: boolean;
}

function getFormat(url: string): string {
  const match = url.match(/\.(jpe?g|png|gif|webp|svg|avif|bmp)/i);
  if (!match) return 'img';
  return match[1].toLowerCase().replace('jpeg', 'jpg');
}

function App() {
  const [inputUrl, setInputUrl] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [downloadingUrls, setDownloadingUrls] = useState<Set<string>>(new Set());
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [error, setError] = useState('');
  const [images, setImages] = useState<ImageItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFetch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = inputUrl.trim();
    if (!trimmed) return;

    setLoading(true);
    setError('');
    setImages([]);
    setSourceUrl(trimmed);

    try {
      const urls = await fetchImages(trimmed);
      setImages(urls.map(url => ({ url, selected: false })));
      if (urls.length === 0) setError('No images found on this page.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch images');
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (idx: number) => {
    setImages(prev =>
      prev.map((img, i) => (i === idx ? { ...img, selected: !img.selected } : img))
    );
  };

  const allSelected = images.length > 0 && images.every(img => img.selected);
  const selectedCount = images.filter(img => img.selected).length;

  const toggleSelectAll = () => {
    setImages(prev => prev.map(img => ({ ...img, selected: !allSelected })));
  };

  const handleDownloadSelected = async () => {
    const urls = images.filter(img => img.selected).map(img => img.url);
    if (!urls.length) return;
    setDownloadingAll(true);
    try {
      await downloadAllImages(urls);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloadingAll(false);
    }
  };

  const handleDownloadAll = async () => {
    setDownloadingAll(true);
    try {
      await downloadAllImages(images.map(img => img.url));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloadingAll(false);
    }
  };

  const handleDownloadSingle = async (url: string) => {
    setDownloadingUrls(prev => new Set(prev).add(url));
    try {
      await downloadImage(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloadingUrls(prev => {
        const next = new Set(prev);
        next.delete(url);
        return next;
      });
    }
  };

  const clearResults = () => {
    setImages([]);
    setError('');
    setInputUrl('');
    inputRef.current?.focus();
  };

  let hostname = '';
  try { hostname = new URL(sourceUrl).hostname; } catch {}

  return (
    <div className="min-h-screen bg-[#f4f6f9]">
      {/* Sticky header / URL bar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-4">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-sm">
              <ImageIcon className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-gray-900 hidden sm:block">ImageGrab</span>
          </div>

          <form onSubmit={handleFetch} className="flex-1 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                ref={inputRef}
                type="url"
                value={inputUrl}
                onChange={e => setInputUrl(e.target.value)}
                placeholder="https://example.com"
                className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-gray-50 transition"
              />
              {inputUrl && (
                <button
                  type="button"
                  onClick={() => setInputUrl('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={loading || !inputUrl.trim()}
              className={`px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors flex items-center gap-2 shrink-0
                ${loading || !inputUrl.trim()
                  ? 'bg-gray-300 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'}`}
            >
              {loading
                ? <><RefreshCw className="w-4 h-4 animate-spin" />Extracting…</>
                : <><Search className="w-4 h-4" />Extract</>}
            </button>
          </form>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Error banner */}
        {error && (
          <div className="mb-5 flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
            <span className="flex-1">{error}</span>
            <button onClick={() => setError('')} className="shrink-0 hover:text-red-900">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && images.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-40 text-gray-400 select-none">
            <div className="w-24 h-24 rounded-3xl bg-white shadow-sm border border-gray-100 flex items-center justify-center mb-6">
              <ImageIcon className="w-12 h-12 text-gray-300" />
            </div>
            <p className="text-xl font-semibold text-gray-500">Extract images from any webpage</p>
            <p className="text-sm mt-2 text-gray-400">Paste a URL above and hit Extract</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2 text-xs text-gray-400">
              {['JPEG', 'PNG', 'WebP', 'GIF', 'SVG', 'AVIF'].map(f => (
                <span key={f} className="px-3 py-1 rounded-full bg-white border border-gray-200 shadow-sm">{f}</span>
              ))}
            </div>
          </div>
        )}

        {/* Loading skeleton grid */}
        {loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="rounded-xl bg-gray-200 animate-pulse aspect-square" />
            ))}
          </div>
        )}

        {/* Results */}
        {!loading && images.length > 0 && (
          <>
            {/* Toolbar */}
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <div className="text-sm font-semibold text-gray-700 mr-1">
                {images.length} image{images.length !== 1 ? 's' : ''}
                {hostname && (
                  <span className="font-normal text-gray-400 ml-1.5">— {hostname}</span>
                )}
              </div>

              <div className="flex items-center gap-2 ml-auto flex-wrap">
                <button
                  onClick={toggleSelectAll}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-600 transition"
                >
                  {allSelected ? 'Deselect All' : 'Select All'}
                </button>

                {selectedCount > 0 && (
                  <button
                    onClick={handleDownloadSelected}
                    disabled={downloadingAll}
                    className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 disabled:opacity-50 transition"
                  >
                    <Archive className="w-3.5 h-3.5" />
                    ZIP {selectedCount} selected
                  </button>
                )}

                <button
                  onClick={handleDownloadAll}
                  disabled={downloadingAll}
                  className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 disabled:opacity-50 transition"
                >
                  {downloadingAll
                    ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Zipping…</>
                    : <><Archive className="w-3.5 h-3.5" />ZIP All ({images.length})</>}
                </button>

                <button
                  onClick={clearResults}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-500 transition"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Image grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {images.map((img, idx) => {
                const isDown = downloadingUrls.has(img.url);
                const fmt = getFormat(img.url);

                return (
                  <div
                    key={idx}
                    onClick={() => toggleSelect(idx)}
                    className={`relative group rounded-xl overflow-hidden cursor-pointer transition-all bg-gray-200
                      ${img.selected
                        ? 'ring-2 ring-offset-2 ring-blue-500 shadow-md'
                        : 'hover:ring-2 hover:ring-offset-1 hover:ring-gray-300'}`}
                  >
                    {/* Image */}
                    <div className="aspect-square">
                      <img
                        src={img.url}
                        alt=""
                        loading="lazy"
                        className="w-full h-full object-cover"
                        onError={e => {
                          const el = e.currentTarget;
                          if (!el.dataset.fallback) {
                            el.dataset.fallback = '1';
                            el.src = `/api/proxy-image?url=${encodeURIComponent(img.url)}&referer=${encodeURIComponent(sourceUrl)}`;
                          } else {
                            el.style.display = 'none';
                            el.parentElement!.innerHTML =
                              '<div class="w-full h-full flex items-center justify-center text-xs text-gray-400 bg-gray-100">No preview</div>';
                          }
                        }}
                      />
                    </div>

                    {/* Hover overlay */}
                    <div className={`absolute inset-0 pointer-events-none transition-opacity
                      ${img.selected ? 'bg-blue-600/10' : 'bg-black/0 group-hover:bg-black/25'}`} />

                    {/* Checkbox */}
                    <div className={`absolute top-2 left-2 transition-opacity
                      ${img.selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                      <div className={`w-5 h-5 rounded flex items-center justify-center shadow border
                        ${img.selected
                          ? 'bg-blue-500 border-blue-500'
                          : 'bg-white/80 border-gray-300'}`}>
                        {img.selected && (
                          <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="2,6 5,9 10,3" />
                          </svg>
                        )}
                      </div>
                    </div>

                    {/* Format badge */}
                    <div className="absolute top-2 right-2">
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md bg-black/50 text-white tracking-wide">
                        {fmt}
                      </span>
                    </div>

                    {/* Individual download button */}
                    <button
                      onClick={e => { e.stopPropagation(); handleDownloadSingle(img.url); }}
                      disabled={isDown}
                      title="Download"
                      className="absolute bottom-2 right-2 w-7 h-7 rounded-lg bg-white/90 hover:bg-white text-gray-700 flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition disabled:opacity-40"
                    >
                      {isDown
                        ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        : <Download className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default App;

