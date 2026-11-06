import { useEffect, useRef, useState } from "react";

type Props = {
  onClose: () => void;
  onRecognized: (name: string) => void;
};

export default function CardScanner({ onClose, onRecognized }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [message, setMessage] = useState("Starting camera…");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage("Camera access is not available in this browser. Use HTTPS or localhost.");
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
      .then((camera) => {
        if (!active) {
          camera.getTracks().forEach((track) => track.stop());
          return;
        }
        stream.current = camera;
        if (video.current) {
          video.current.srcObject = camera;
          setMessage("");
        }
      })
      .catch((reason: unknown) => {
        if (active) setMessage(reason instanceof Error ? `Could not start camera: ${reason.message}` : "Could not start camera.");
      });
    return () => {
      active = false;
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
    };
  }, []);

  async function captureAndRead() {
    const element = video.current;
    if (!element || !element.videoWidth || !element.videoHeight) {
      setMessage("Camera is not ready yet.");
      return;
    }
    setBusy(true);
    setMessage("Reading card text…");
    let worker: Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>> | undefined;
    try {
      const { createWorker } = await import("tesseract.js");
      worker = await createWorker("eng", undefined, {
        logger: (event) => {
          if (event.status === "recognizing text") setMessage(`Reading card text… ${Math.round(event.progress * 100)}%`);
        },
      });
      const result = await worker.recognize(element);
      const name = result.data.text.split(/\r?\n/).find((line) => line.trim())?.trim().replace(/\s+/g, " ") ?? "";
      if (!name) {
        setMessage("No card name was recognized. Try better lighting and hold the card steady.");
        return;
      }
      onRecognized(name);
    } catch (reason) {
      setMessage(reason instanceof Error ? `Card text recognition failed: ${reason.message}` : "Card text recognition failed.");
    } finally {
      await worker?.terminate();
      setBusy(false);
    }
  }

  return (
    <div className="scanner-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <section className="scanner-panel" role="dialog" aria-modal="true" aria-labelledby="scanner-title">
        <div className="scanner-heading">
          <div><div className="eyebrow">CAMERA TOOL</div><h2 id="scanner-title">Scan a card</h2></div>
          <button className="export-button" onClick={onClose} disabled={busy}>Close</button>
        </div>
        <p>Center the card in the frame. Text recognition runs in your browser; check the search results before adding a card.</p>
        <div className="camera-frame">
          <video ref={video} autoPlay playsInline muted aria-label="Live camera preview" />
          <div className="camera-guide" aria-hidden="true" />
        </div>
        {message && <p className="scanner-message" role="status">{message}</p>}
        <button className="primary-button" onClick={captureAndRead} disabled={busy || Boolean(message && !video.current?.srcObject)}>
          {busy ? "Reading…" : "Capture and identify"}
        </button>
        <p className="scanner-note">Camera access requires HTTPS (except on localhost). The first scan may download the English OCR model.</p>
      </section>
    </div>
  );
}
