import { useEffect, useRef, useState } from "react";
import { ImagePlus, Video, X } from "lucide-react";
import { DEFAULT_FEED_LIMITS, checkClubFile, type CheckedFile, type ClubUploadPurpose } from "../../lib/clubMedia";

/** Picking one photo or video, checked against the club's limits before upload. */
export function MediaPicker({ purpose, file, onFile, isCoach = false, label }: {
  purpose: ClubUploadPurpose; file: CheckedFile | null; onFile: (f: CheckedFile | null, error?: string) => void; isCoach?: boolean; label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const pick = async (f: File | undefined) => {
    if (!f) return;
    const checked = await checkClubFile(f, purpose, DEFAULT_FEED_LIMITS, isCoach);
    if ("error" in checked) { onFile(null, checked.error); return; }
    setPreview(URL.createObjectURL(f));
    onFile(checked);
  };
  const clear = () => { setPreview(null); onFile(null); if (input.current) input.current.value = ""; };
  const video = purpose === "CHALLENGE";
  return (
    <div className="post-attach">
      <input ref={input} type="file" hidden accept={video ? "video/*" : "image/*,video/*"} onChange={(e) => void pick(e.target.files?.[0])} />
      {file && preview ? (
        <div className="attach-preview">
          {file.kind === "VIDEO" ? <video src={preview} muted playsInline /> : <img src={preview} alt="Your proof" />}
          <button type="button" className="iconbtn" aria-label="Remove" onClick={clear}><X /></button>
        </div>
      ) : (
        <button type="button" className="ghost" onClick={() => input.current?.click()}>
          {video ? <><Video />{label ?? "Add a video"}</> : <><ImagePlus />{label ?? "Add a photo or video"}</>}
        </button>
      )}
    </div>
  );
}

