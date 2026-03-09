import { useEffect, useState } from "react";
import QRCode from "qrcode";
import api from "../services/api";

interface QrPayload {
  token: string;
  subject_type: string;
  subject_name: string;
  member_number?: string | null;
  email?: string | null;
}

interface PortalQrCardProps {
  onError: (message: string) => void;
}

export default function PortalQrCard({ onError }: PortalQrCardProps) {
  const [payload, setPayload] = useState<QrPayload | null>(null);
  const [qrImage, setQrImage] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await api.get<QrPayload>("/identity/my-qr");
        if (cancelled) return;

        setPayload(res.data);
        const dataUrl = await QRCode.toDataURL(res.data.token, {
          margin: 1,
          width: 280,
          color: {
            dark: "#0b1b34",
            light: "#f6f1e6",
          },
        });

        if (!cancelled) {
          setQrImage(dataUrl);
        }
      } catch {
        if (!cancelled) {
          onError("Unable to load your QR code right now.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [onError]);

  return (
    <div className="rounded-xl border border-white/20 bg-white/10 p-4">
      <h2 className="font-heading text-2xl text-offwhite">My QR Code</h2>
      <p className="mt-2 text-sm text-mist/80">
        Show this code to the secretary for attendance and club identification.
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="flex items-center justify-center rounded-xl border border-gold/30 bg-offwhite/95 p-4">
          {qrImage ? (
            <img src={qrImage} alt="Personal attendance QR code" className="h-auto w-full max-w-[280px]" />
          ) : (
            <div className="flex h-[280px] w-[280px] items-center justify-center text-sm text-ink/70">
              Generating QR code...
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-xl border border-white/15 bg-white/5 p-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-gold-soft">Profile</p>
            <p className="mt-1 text-lg font-semibold text-offwhite">{payload?.subject_name ?? "Loading..."}</p>
          </div>
          <p className="text-sm text-mist/85">
            Type: <span className="text-offwhite capitalize">{payload?.subject_type ?? "—"}</span>
          </p>
          <p className="text-sm text-mist/85">
            Member Number: <span className="text-offwhite">{payload?.member_number ?? "—"}</span>
          </p>
          <p className="text-sm text-mist/85">
            Email: <span className="text-offwhite">{payload?.email ?? "—"}</span>
          </p>
          <p className="text-xs text-mist/70">
            Keep this QR code private to your account. The code is verified server-side before attendance is recorded.
          </p>
        </div>
      </div>
    </div>
  );
}
