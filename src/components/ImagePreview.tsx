import { useEffect, useState } from "react";
import { db } from "../lib/db";
export default function ImagePreview({
  id,
  title,
  openable = true,
}: {
  id: string;
  title: string;
  openable?: boolean;
}) {
  const [source, setSource] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    db.images
      .get(id)
      .then((record) => {
        if (!active) return;
        if (!record) {
          setFailed(true);
          return;
        }
        objectUrl = URL.createObjectURL(record.blob);
        setSource(objectUrl);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);
  if (failed)
    return (
      <p role="status">Image unavailable or unsupported by this browser.</p>
    );
  if (source && !openable)
    return (
      <img
        loading="lazy"
        src={source}
        alt={title}
        onError={() => setFailed(true)}
      />
    );
  return source ? (
    <a
      href={source}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open image: ${title}`}
    >
      <img src={source} alt={title} onError={() => setFailed(true)} />
    </a>
  ) : (
    <p>Loading image…</p>
  );
}
