import { useEffect, useRef, useState, type ChangeEvent } from "react";

type Props = {
  onClose: () => void;
  onRecognized: (name: string) => void;
};

type OcrWorker = Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>>;
type OcrImage = HTMLVideoElement | HTMLImageElement | HTMLCanvasElement;
const maxPhotoBytes = 20 * 1024 * 1024;
const maxPhotoDimension = 2200;

export default function CardScanner({ onClose, onRecognized }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const worker = useRef<OcrWorker | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("Starting camera…");
  const [busy, setBusy] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

  useEffect(() => {
    let active = true;
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage("Camera access is unavailable. Use HTTPS or localhost, or choose a photo instead.");
      return;
    }
    setMessage("Starting camera…");
    navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    })
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
        if (!active) return;
        if (reason instanceof DOMException && reason.name === "NotAllowedError") {
          setMessage("Camera permission was denied. Allow camera access in your browser settings, or choose a photo instead.");
        } else if (reason instanceof DOMException && reason.name === "NotFoundError") {
          setMessage("No camera was found. Choose a photo instead.");
        } else {
          setMessage(reason instanceof Error ? `Could not start camera: ${reason.message}` : "Could not start camera.");
        }
      });
    return () => {
      active = false;
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
      if (video.current) video.current.srcObject = null;
    };
  }, [facingMode]);

  useEffect(() => () => {
    void worker.current?.terminate();
    worker.current = null;
  }, []);

  async function recognize(source: OcrImage) {
    setBusy(true);
    setMessage("Reading card text…");
    try {
      if (!worker.current) {
        const { createWorker } = await import("tesseract.js");
        worker.current = await createWorker("eng", undefined, {
          logger: (event) => {
            if (event.status === "recognizing text") setMessage(`Reading card text… ${Math.round(event.progress * 100)}%`);
          },
        });
      }
      const result = await worker.current.recognize(source);
      const name = result.data.text.split(/\r?\n/).find((line) => line.trim())?.trim().replace(/\s+/g, " ") ?? "";
      if (!name) {
        setMessage("No card name was recognized. Try better lighting and hold the card steady.");
        return;
      }
      onRecognized(name);
    } catch (reason) {
      setMessage(reason instanceof Error ? `Card text recognition failed: ${reason.message}` : "Card text recognition failed.");
    } finally {
      setBusy(false);
    }
  }

  async function captureAndRead() {
    const element = video.current;
    if (!element || !element.videoWidth || !element.videoHeight) {
      setMessage("Camera is not ready yet.");
      return;
    }
    await recognize(element);
  }

  async function readPhoto(event: ChangeEvent<HTMLInputElement>) {
    const photo = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!photo) return;
    if (!photo.type.startsWith("image/")) {
      setMessage("Choose an image file to scan.");
      return;
    }
    if (photo.size > maxPhotoBytes) {
      setMessage("Photo must be 20 MB or smaller.");
      return;
    }
    const url = URL.createObjectURL(photo);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const scale = Math.min(1, maxPhotoDimension / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.naturalWidth * scale);
      canvas.height = Math.round(image.naturalHeight * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not prepare photo for scanning");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      await recognize(canvas);
    } catch (reason) {
      setMessage(reason instanceof Error ? `Could not read photo: ${reason.message}` : "Could not read photo.");
    } finally {
      URL.revokeObjectURL(url);
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
        <p>Center the card in the frame or take a photo. Text recognition runs on this device; check the search results before adding a card.</p>
        <div className="camera-frame">
          <video ref={video} autoPlay playsInline muted aria-label="Live camera preview" />
          <div className="camera-guide" aria-hidden="true" />
        </div>
        {message && <p className="scanner-message" role="status">{message}</p>}
        <input
          ref={photoInput}
          className="file-input"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={readPhoto}
          aria-label="Take or choose a card photo"
        />
        <div className="scanner-actions">
          <button className="primary-button" onClick={captureAndRead} disabled={busy || !video.current?.srcObject}>
            {busy ? "Reading…" : "Capture live view"}
          </button>
          <button className="export-button" onClick={() => setFacingMode((current) => current === "environment" ? "user" : "environment")} disabled={busy}>
            Switch camera
          </button>
          <button className="export-button" onClick={() => photoInput.current?.click()} disabled={busy}>
            Take or choose photo
          </button>
        </div>
        <p className="scanner-note">Live camera access requires HTTPS (except on localhost). The first scan downloads the English OCR model; later scans reuse it.</p>
      </section>
    </div>
  );
}
