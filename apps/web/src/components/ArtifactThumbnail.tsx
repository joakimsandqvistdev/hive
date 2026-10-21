import { useEffect, useState } from "react";
import { Image } from "@mantine/core";
import { apiUrl } from "../apiClient";
import { AppIcon } from "./AppIcon";

export function ArtifactThumbnail({ artifactId, alt = "", size = 50, className = "" }: {
  artifactId: string;
  alt?: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [artifactId]);
  const classes = `media-row-thumbnail${className ? ` ${className}` : ""}`;

  if (failed) {
    return <span className={`${classes} media-row-thumbnail-media`} role={alt ? "img" : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true} style={{ width: size, height: size, flexBasis: size }}>
      <AppIcon name="media" size={Math.max(18, Math.round(size * 0.46))} />
    </span>;
  }

  return <Image className={classes} src={apiUrl(`/api/artifacts/${artifactId}/thumbnail`)} alt={alt} fit="cover" w={size} h={size} onError={() => setFailed(true)} />;
}
