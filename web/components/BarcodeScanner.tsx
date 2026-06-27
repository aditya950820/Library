"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { DecodeHintType, BarcodeFormat } from "@zxing/library";
import type { IScannerControls } from "@zxing/browser";

const FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.QR_CODE,
];

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
  const controlsRef = useRef<IScannerControls | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setStarting(true);

    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, FORMATS);
    const reader = new BrowserMultiFormatReader(hints);

    (async () => {
      if (!window.isSecureContext) {
        setError("Camera needs a secure connection (https). Enter the ISBN manually below.");
        setStarting(false);
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Camera not supported on this device. Enter the ISBN manually below.");
        setStarting(false);
        return;
      }
      try {
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          videoRef.current!,
          (result) => {
            if (result && !cancelled) {
              const text = result.getText().trim();
              navigator.vibrate?.(120);
              handleDetect(text);
            }
          }
        );
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setStarting(false);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(
          /permission|denied|notallowed/i.test(msg)
            ? "Camera permission was denied. Allow camera access, or enter the ISBN manually below."
            : "Could not start the camera. Enter the ISBN manually below."
        );
        setStarting(false);
      }
    })();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleDetect(code: string) {
    controlsRef.current?.stop();
    controlsRef.current = null;
    onDetect(code);
  }

  function close() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setManual("");
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="font-medium">Scan ISBN barcode</span>
        <button onClick={close} aria-label="Close" className="text-2xl leading-none">
          ✕
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          playsInline
          muted
        />
        {/* Aiming frame */}
        {!error && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative h-32 w-72 max-w-[80%] rounded-xl border-2 border-white/80">
              <div className="scan-line absolute inset-x-2 top-1/2 h-0.5 bg-[var(--accent)]" />
            </div>
          </div>
        )}
        {starting && !error && (
          <div className="absolute inset-x-0 bottom-6 text-center text-sm text-white/80">
            Starting camera…
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white/90">
            {error}
          </div>
        )}
      </div>

      {/* Manual fallback */}
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
              if (e.key === "Enter" && manual.trim()) handleDetect(manual.trim());
            }}
          />
          <button
            className="btn btn-primary"
            disabled={!manual.trim()}
            onClick={() => manual.trim() && handleDetect(manual.trim())}
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
