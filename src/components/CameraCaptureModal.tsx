import React, { useState, useRef, useEffect, useCallback } from "react";
import { Camera, X, RefreshCw, Check, AlertCircle, SwitchCamera, Image, Sparkles } from "lucide-react";

interface CameraCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
  theme?: "light" | "dark";
  title?: string;
}

export default function CameraCaptureModal({
  isOpen,
  onClose,
  onCapture,
  theme = "dark",
  title = "Take Product Photo"
}: CameraCaptureModalProps) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isLoadingCamera, setIsLoadingCamera] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement | null>(null);
  const [nativePickerKey, setNativePickerKey] = useState(0);

  // Stop all active tracks
  const stopStream = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  }, [stream]);

  // Check available camera devices
  const checkCameraDevices = useCallback(async () => {
    try {
      if (navigator.mediaDevices?.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter((d) => d.kind === "videoinput");
        setHasMultipleCameras(videoInputs.length > 1);
      }
    } catch {
      // Ignore device enumeration issues
    }
  }, []);

  // Start video stream
  const startCamera = useCallback(async (facing: "environment" | "user") => {
    setIsLoadingCamera(true);
    setCameraError(null);
    setCapturedDataUrl(null);
    setCapturedFile(null);

    // Stop existing tracks first
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
    }

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Live camera streaming is not supported by this browser. Use the native camera button below.");
      }

      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      });

      setStream(newStream);
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }
      checkCameraDevices();
    } catch (err: any) {
      console.warn("[Camera] getUserMedia failed:", err);
      let errorMsg = "Unable to access camera.";
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        errorMsg = "Camera permission was denied. Please allow camera access in your browser settings or use your phone's native camera below.";
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        errorMsg = "No camera found on this device. Use your phone's camera or choose from folders.";
      } else if (err.message) {
        errorMsg = err.message;
      }
      setCameraError(errorMsg);
    } finally {
      setIsLoadingCamera(false);
    }
  }, [stream, checkCameraDevices]);

  // When modal opens or facing mode changes
  useEffect(() => {
    if (isOpen) {
      startCamera(facingMode);
    } else {
      stopStream();
      setCapturedDataUrl(null);
      setCapturedFile(null);
      setCameraError(null);
    }
    return () => {
      stopStream();
    };
  }, [isOpen]);

  // Flip between front and back cameras
  const handleToggleFacingMode = () => {
    const nextMode = facingMode === "environment" ? "user" : "environment";
    setFacingMode(nextMode);
    startCamera(nextMode);
  };

  // Capture snapshot from video stream
  const handleTakeSnapshot = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;

    // Trigger visual flash
    setIsFlashing(true);
    setTimeout(() => setIsFlashing(false), 200);

    const canvas = document.createElement("canvas");
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // If user camera, mirror it
    if (facingMode === "user") {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0, width, height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const fileName = `abro-photo-${Date.now()}.jpg`;
        const file = new File([blob], fileName, { type: "image/jpeg" });
        const dataUrl = canvas.toDataURL("image/jpeg", 0.92);

        setCapturedDataUrl(dataUrl);
        setCapturedFile(file);

        // Pause stream preview
        if (stream) {
          stream.getTracks().forEach((t) => t.stop());
          setStream(null);
        }
      },
      "image/jpeg",
      0.92
    );
  };

  // Retake photo
  const handleRetake = () => {
    setCapturedDataUrl(null);
    setCapturedFile(null);
    startCamera(facingMode);
  };

  // Confirm photo
  const handleUsePhoto = () => {
    if (capturedFile) {
      onCapture(capturedFile);
      handleClose();
    }
  };

  // Handle native camera fallback input
  const handleNativeCameraChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    setNativePickerKey((k) => k + 1);
    if (!file) return;

    onCapture(file);
    handleClose();
  };

  const handleClose = () => {
    stopStream();
    setCapturedDataUrl(null);
    setCapturedFile(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      {/* Hidden native camera capture fallback input */}
      <input
        key={`native-camera-${nativePickerKey}`}
        ref={nativeCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onClick={(e) => {
          (e.target as HTMLInputElement).value = "";
        }}
        onCancel={() => {
          setNativePickerKey((k) => k + 1);
        }}
        onChange={handleNativeCameraChange}
      />

      <div
        className={`w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[92vh] ${
          theme === "dark"
            ? "bg-slate-900 border-white/10 text-white"
            : "bg-white border-slate-200 text-slate-800"
        }`}
      >
        {/* Modal Header */}
        <div
          className={`flex items-center justify-between px-4 py-3 border-b ${
            theme === "dark" ? "border-white/10 bg-slate-950/60" : "border-slate-100 bg-slate-50"
          }`}
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm leading-none">{title}</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">Capture genuine ABRO product directly</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-slate-700/30 text-slate-400 hover:text-white transition-colors cursor-pointer"
            aria-label="Close camera"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewfinder / Preview Area */}
        <div className="relative bg-black flex-1 min-h-[320px] max-h-[480px] flex items-center justify-center overflow-hidden">
          {/* Flash animation */}
          {isFlashing && (
            <div className="absolute inset-0 bg-white z-30 pointer-events-none animate-ping" />
          )}

          {/* Live Camera Stream */}
          {!capturedDataUrl && !cameraError && (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                onLoadedMetadata={() => {
                  if (videoRef.current) {
                    videoRef.current.play().catch(() => {});
                  }
                }}
                className={`w-full h-full object-cover ${facingMode === "user" ? "-scale-x-100" : ""}`}
              />

              {/* Viewfinder Guide Overlay */}
              <div className="absolute inset-6 border-2 border-white/30 rounded-xl pointer-events-none flex flex-col justify-between p-3">
                <div className="flex justify-between text-[10px] text-white/70 font-mono tracking-widest uppercase">
                  <span>ABRO KENYA</span>
                  <span>PRODUCT SHOT</span>
                </div>
                <div className="text-center text-[10px] text-white/60 bg-black/40 py-1 px-3 rounded-full backdrop-blur-xs mx-auto">
                  Center product label in frame
                </div>
              </div>

              {/* Flip camera control */}
              {hasMultipleCameras && (
                <button
                  type="button"
                  onClick={handleToggleFacingMode}
                  title="Switch Camera (Front/Back)"
                  className="absolute top-4 right-4 z-20 p-2.5 rounded-full bg-black/60 text-white hover:bg-black/80 backdrop-blur-sm border border-white/20 transition-all cursor-pointer shadow-lg"
                >
                  <SwitchCamera className="w-5 h-5" />
                </button>
              )}
            </>
          )}

          {/* Captured Preview */}
          {capturedDataUrl && (
            <div className="relative w-full h-full flex items-center justify-center bg-black/90">
              <img
                src={capturedDataUrl}
                alt="Captured product preview"
                className="w-full h-full object-contain max-h-[480px]"
              />
              <div className="absolute top-3 left-3 bg-emerald-500/90 text-white text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 shadow-md">
                <Check className="w-3 h-3" />
                <span>Photo Captured</span>
              </div>
            </div>
          )}

          {/* Camera Loading Spinner */}
          {isLoadingCamera && (
            <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-2 text-white z-20">
              <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
              <p className="text-xs font-medium">Starting camera...</p>
            </div>
          )}

          {/* Camera Error / Permission Denied Fallback */}
          {cameraError && (
            <div className="p-6 text-center space-y-3 max-w-sm z-20">
              <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-sm text-white">Direct Camera Option</h4>
              <p className="text-xs text-slate-300 leading-relaxed">{cameraError}</p>

              <button
                type="button"
                onClick={() => {
                  if (nativeCameraInputRef.current) {
                    nativeCameraInputRef.current.value = "";
                    nativeCameraInputRef.current.click();
                  }
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                <span>Open Device Camera App</span>
              </button>
            </div>
          )}
        </div>

        {/* Modal Controls / Footer */}
        <div
          className={`p-4 border-t flex items-center justify-between gap-3 ${
            theme === "dark" ? "border-white/10 bg-slate-950/80" : "border-slate-100 bg-slate-50"
          }`}
        >
          {capturedDataUrl ? (
            /* Controls after photo captured */
            <>
              <button
                type="button"
                onClick={handleRetake}
                className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-2 cursor-pointer ${
                  theme === "dark"
                    ? "bg-slate-800 hover:bg-slate-700 text-slate-200 border-white/10"
                    : "bg-white hover:bg-slate-100 text-slate-700 border-slate-200"
                }`}
              >
                <RefreshCw className="w-4 h-4" />
                <span>Retake Photo</span>
              </button>
              <button
                type="button"
                onClick={handleUsePhoto}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Use This Photo</span>
              </button>
            </>
          ) : (
            /* Live controls before photo captured */
            <>
              {/* Secondary button: Use phone's native camera app */}
              <button
                type="button"
                onClick={() => {
                  if (nativeCameraInputRef.current) {
                    nativeCameraInputRef.current.value = "";
                    nativeCameraInputRef.current.click();
                  }
                }}
                title="Open device camera application"
                className={`py-2 px-3 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition-all cursor-pointer ${
                  theme === "dark"
                    ? "bg-slate-800 hover:bg-slate-700 text-slate-300 border-white/10"
                    : "bg-white hover:bg-slate-100 text-slate-700 border-slate-200"
                }`}
              >
                <Camera className="w-3.5 h-3.5 text-emerald-500" />
                <span className="hidden sm:inline">Device Camera App</span>
                <span className="sm:hidden">Native</span>
              </button>

              {/* Primary Shutter Button */}
              <button
                type="button"
                disabled={isLoadingCamera || Boolean(cameraError)}
                onClick={handleTakeSnapshot}
                className="flex-1 max-w-[200px] mx-auto py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer active:scale-95"
              >
                <div className="w-4 h-4 rounded-full border-2 border-white flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-white" />
                </div>
                <span>Snap Photo</span>
              </button>

              <button
                type="button"
                onClick={handleClose}
                className={`py-2 px-3 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                  theme === "dark" ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
