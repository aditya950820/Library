"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import {
  DecodeHintType,
  BarcodeFormat,
  type Result,
} from "@zxing/library";
import type { IScannerControls } from "@zxing/browser";

// ISBN barcodes are EAN-13 (sometimes EAN-8/UPC). Keep the set tight for speed.
const ZXING_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
];
const NATIVE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"];

// Minimal typing for the native BarcodeDetector (not in TS DOM libs yet).
type DetectedBarcode = { rawValue: string; format: string };
type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>;
};
type BarcodeDetectorCtor = {
  new (opts?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
};

/** Among detected codes prefer a real ISBN (EAN-13 starting 978/979). */
function pickBest(codes: string[]): string | null {
  const cleaned = codes.map((c) => c.trim()).filter(Boolean);
  if (cleaned.length === 0) return null;
  return (
    cleaned.find((c) => /^(978|979)\d{10}$/.test(c)) ??
    cleaned.find((c) => c.length === 13) ??
    cleaned[0]
  );
}

export default function BarcodeScanner({
  open,
  onClose,
  onDetect,
}: {
  open: boolean;
  onClose: () => void;
  onDetect: (code: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const zxingRef = useRef<IScannerControls | null>(null);
  const rafRef = useRef<number | null>(null);
  const doneRef = useRef(false);

  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [starting, setStarting] = useState(true);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvail, setTorchAvail] = useState(false);

  const finish = useCallback(
    (code: string) => {
      if (doneRef.current) return;
      const best = pickBest([code]);
      if (!best) return;
      doneRef.current = true;
      navigator.vibrate?.(120);
      stopAll();
      onDetect(best);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onDetect]
  );

  function stopAll() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    zxingRef.current?.stop();
    zxingRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({
        // @ts-expect-error torch is a non-standard but widely supported constraint
        advanced: [{ torch: !torchOn }],
      });
      setTorchOn((v) => !v);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (!open) return;
    doneRef.current = false;
    setError(null);
    setStarting(true);
    setTorchOn(false);
    setTorchAvail(false);

    (async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError(
          "Camera needs a secure (https) connection and a supported browser. Enter the ISBN manually below."
        );
        setStarting(false);
        return;
      }

      let stream: MediaStream;
      try {
        // High resolution + back camera => sharp enough for dense ISBN bars.
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(
          /permission|denied|notallowed/i.test(msg)
            ? "Camera permission was denied. Allow access, or enter the ISBN manually below."
            : "Could not start the camera. Enter the ISBN manually below."
        );
        setStarting(false);
        return;
      }

      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        /* autoplay quirks — ignore */
      }

      // Continuous autofocus + torch capability (best-effort).
      const track = stream.getVideoTracks()[0];
      try {
        const caps = track.getCapabilities?.() as
          | (MediaTrackCapabilities & { torch?: boolean; focusMode?: string[] })
          | undefined;
        if (caps?.focusMode?.includes("continuous")) {
          await track.applyConstraints({
            // @ts-expect-error focusMode is non-standard
            advanced: [{ focusMode: "continuous" }],
          });
        }
        if (caps?.torch) setTorchAvail(true);
      } catch {
        /* ignore */
      }

      setStarting(false);

      // Path 1: native BarcodeDetector (fast, hardware/ML accelerated).
      const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
        .BarcodeDetector;
      if (Detector) {
        let formats = NATIVE_FORMATS;
        try {
          const supported = (await Detector.getSupportedFormats?.()) ?? [];
          if (supported.length)
            formats = NATIVE_FORMATS.filter((f) => supported.includes(f));
        } catch {
          /* use defaults */
        }
        const detector = new Detector({ formats });
        const tick = async () => {
          if (doneRef.current || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const best = pickBest(codes.map((c) => c.rawValue));
            if (best) {
              finish(best);
              return;
            }
          } catch {
            /* transient — keep scanning */
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // Path 2: ZXing fallback (iOS Safari), tuned for ISBN.
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, ZXING_FORMATS);
      hints.set(DecodeHintType.TRY_HARDER, true);
      const reader = new BrowserMultiFormatReader(hints, {
        delayBetweenScanAttempts: 100,
      });
      try {
        zxingRef.current = await reader.decodeFromStream(
          stream,
          video,
          (result?: Result) => {
            if (result && !doneRef.current) finish(result.getText());
          }
        );
      } catch {
        setError("Could not start scanning. Enter the ISBN manually below.");
      }
    })();

    return () => {
      stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function close() {
    stopAll();
    setManual("");
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="font-medium">Scan ISBN barcode</span>
        <div className="flex items-center gap-3">
          {torchAvail && (
            <button
              onClick={toggleTorch}
              className="rounded-lg border border-white/30 px-3 py-1 text-sm"
            >
              {torchOn ? "Torch off" : "Torch on"}
            </button>
          )}
          <button onClick={close} aria-label="Close" className="text-2xl leading-none">
            ✕
          </button>
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          playsInline
          muted
        />
        {!error && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative h-32 w-72 max-w-[80%] rounded-xl border-2 border-white/80">
              <div className="scan-line absolute inset-x-2 top-1/2 h-0.5 bg-[var(--accent)]" />
            </div>
          </div>
        )}
        {!error && (
          <div className="absolute inset-x-0 bottom-6 text-center text-sm text-white/80">
            {starting ? "Starting camera…" : "Hold steady over the barcode"}
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white/90">
            {error}
          </div>
        )}
      </div>

      <div className="bg-surface p-4">
        <label className="label">Or enter ISBN manually</label>
        <div className="flex gap-2">
          <input
            className="input"
            inputMode="numeric"
            placeholder="e.g. 9780201616224"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && manual.trim()) finish(manual.trim());
            }}
          />
          <button
            className="btn btn-primary"
            disabled={!manual.trim()}
            onClick={() => manual.trim() && finish(manual.trim())}
          >
            Use
          </button>
        </div>
      </div>

      <style>{`
        .scan-line { animation: scanmove 1.6s ease-in-out infinite; }
        @keyframes scanmove {
          0%, 100% { transform: translateY(-52px); opacity: 0.4; }
          50% { transform: translateY(52px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
