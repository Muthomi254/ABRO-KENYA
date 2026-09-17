/**
 * Cloudinary Image Storage Integration Helper
 * Direct integration with Cloudinary cloud storage environment:
 * Cloud name: muthomi254
 * API Key: 595797988235321
 * Target Folder: Abro Kenya
 */

export interface CloudinaryConfig {
  configured: boolean;
  cloud_name: string;
  api_key: string;
  folder: string;
  has_secret: boolean;
  preset: string;
}

export interface CloudinaryUploadResult {
  success: boolean;
  url?: string;
  public_id?: string;
  format?: string;
  bytes?: number;
  width?: number;
  height?: number;
  cloud_name?: string;
  folder?: string;
  error?: string;
  hint?: string;
}

/**
 * Fetch the active Cloudinary server configuration status
 */
export async function getCloudinaryConfig(): Promise<CloudinaryConfig> {
  try {
    const res = await fetch("/api/cloudinary/config");
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn("[Cloudinary] Config check error:", err);
  }
  return {
    configured: true,
    cloud_name: "muthomi254",
    api_key: "595797988235321",
    folder: "Abro Kenya",
    has_secret: false,
    preset: "Abro_kenya"
  };
}

/**
 * Upload an image File, Blob, or base64 Data URI to Cloudinary via server proxy
 */
export async function uploadToCloudinary(
  fileOrDataUri: File | Blob | string,
  options: {
    folder?: string;
    public_id?: string;
    productSku?: string;
  } = {}
): Promise<CloudinaryUploadResult> {
  try {
    let filePayload: string;

    if (typeof fileOrDataUri === "string") {
      filePayload = fileOrDataUri;
    } else {
      // Convert File or Blob to base64 Data URI
      filePayload = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === "string") {
            resolve(reader.result);
          } else {
            reject(new Error("Failed to read image as base64 string."));
          }
        };
        reader.onerror = () => reject(reader.error || new Error("File read error"));
        reader.readAsDataURL(fileOrDataUri);
      });
    }

    const publicId = options.public_id || (options.productSku ? `abro_${options.productSku.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase()}_${Date.now()}` : undefined);

    const res = await fetch("/api/cloudinary/upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        file: filePayload,
        folder: options.folder || "Abro Kenya",
        public_id: publicId
      })
    });

    const data = await res.json();

    if (res.ok && data.success && data.url) {
      return {
        success: true,
        url: data.url,
        public_id: data.public_id,
        format: data.format,
        bytes: data.bytes,
        width: data.width,
        height: data.height,
        cloud_name: data.cloud_name,
        folder: data.folder
      };
    }

    return {
      success: false,
      error: data.error || "Cloudinary upload failed.",
      hint: data.details?.hint
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Failed to communicate with Cloudinary upload service."
    };
  }
}

/**
 * Checks if an image URL is hosted on Cloudinary
 */
export function isCloudinaryUrl(url?: string): boolean {
  if (!url) return false;
  return url.includes("res.cloudinary.com");
}
