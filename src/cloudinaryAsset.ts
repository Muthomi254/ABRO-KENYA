export function isCloudinaryAccountImage(imageUrl: string, cloudName: string): boolean {
  try {
    const url = new URL(imageUrl);
    const segments = url.pathname.split("/").filter(Boolean);
    return url.hostname === "res.cloudinary.com"
      && url.protocol === "https:"
      && !url.username
      && !url.password
      && segments[0] === cloudName
      && segments[1] === "image"
      && segments[2] === "upload";
  } catch {
    return false;
  }
}

export function getManagedCloudinaryPublicId(imageUrl: string, cloudName: string): string | null {
  try {
    const url = new URL(imageUrl);
    if (!isCloudinaryAccountImage(imageUrl, cloudName)) {
      return null;
    }

    const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    const uploadIndex = segments.findIndex((segment, index) =>
      segment === "upload" && segments[index - 1] === "image"
    );
    if (uploadIndex === -1) {
      return null;
    }

    const assetIndex = segments.findIndex((segment, index) =>
      index > uploadIndex && /^abro_[^/]+$/i.test(segment.replace(/\.[^.]+$/, ""))
    );
    if (assetIndex === -1) {
      return null;
    }

    const versionIndex = segments.findIndex((segment, index) =>
      index > uploadIndex && /^v\d+$/.test(segment)
    );
    const folderIndex = assetIndex > uploadIndex + 1
      && !/^[a-z]{1,3}_[^/]+(?:,[a-z]{1,3}_[^/]+)*$/i.test(segments[assetIndex - 1])
      ? assetIndex - 1
      : assetIndex;
    const assetSegments = segments.slice(versionIndex >= 0 ? versionIndex + 1 : folderIndex);
    const fileNameIndex = assetSegments.findIndex((segment) => /^abro_[^/]+$/i.test(segment.replace(/\.[^.]+$/, "")));
    if (fileNameIndex === -1) {
      return null;
    }

    assetSegments[fileNameIndex] = assetSegments[fileNameIndex].replace(/\.[^.]+$/, "");
    return assetSegments.join("/");
  } catch {
    return null;
  }
}

export function getProductImagePublicId(sku: string): string {
  const normalizedSku = String(sku || "").trim().replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
  return `abro_${normalizedSku || "product"}`;
}
