/**
 * Wrapper de Cloudinary para upload de documentos del joven (diplomas,
 * certificados, constancias, CV físico).
 *
 * Diseño: signed uploads server-side (NO unsigned). El backend firma cada
 * upload con `CLOUDINARY_API_SECRET` (server-only, nunca al cliente), el
 * cliente hace POST directo a Cloudinary con los params firmados, y después
 * notifica al backend para persistir la metadata.
 *
 * Por qué signed y no unsigned:
 *  - Sin auth verificada, un troll puede llenarte la cuota gratuita en horas.
 *  - Con signed, cada upload queda atado al `profileId` y `uid` del uploader,
 *    y podemos imponer restricciones dinámicas (tipo de archivo, tamaño,
 *    folder por usuario).
 *  - El API secret nunca toca el frontend.
 */
import { v2 as cloudinary } from "cloudinary";

export type CloudinaryResourceType = "image" | "raw" | "auto";

export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  uploadFolder: string;
}

export function hasCloudinaryConfig(): boolean {
  return (
    !!process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME &&
    !!process.env.CLOUDINARY_API_KEY &&
    !!process.env.CLOUDINARY_API_SECRET
  );
}

export function getCloudinaryConfig(): CloudinaryConfig | null {
  if (!hasCloudinaryConfig()) return null;
  return {
    cloudName: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME!,
    apiKey: process.env.CLOUDINARY_API_KEY!,
    apiSecret: process.env.CLOUDINARY_API_SECRET!,
    uploadFolder: process.env.CLOUDINARY_UPLOAD_FOLDER ?? "salto-documents",
  };
}

/**
 * Inicializa el SDK con las creds del entorno. Se llama una vez por cold-start.
 * El SDK guarda el config global, así que las llamadas subsiguientes a
 * `cloudinary.uploader.*` o `cloudinary.utils.api_sign_request` lo usan.
 */
let _initialized = false;
function ensureInitialized(): boolean {
  if (_initialized) return true;
  const cfg = getCloudinaryConfig();
  if (!cfg) return false;
  cloudinary.config({
    cloud_name: cfg.cloudName,
    api_key: cfg.apiKey,
    api_secret: cfg.apiSecret,
    secure: true,
  });
  _initialized = true;
  return true;
}

export interface SignedUploadParams {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
  publicId: string;
  resourceType: CloudinaryResourceType;
  /** URL completa de upload — el cliente la usa directamente. */
  uploadUrl: string;
  /** Lista de tipos MIME permitidos para validar client-side ANTES del POST. */
  allowedFormats: string[];
  maxBytes: number;
}

/**
 * Genera los parámetros firmados para que el cliente suba un documento
 * directamente a Cloudinary sin pasar por nuestro servidor.
 *
 * publicId queda determinístico por (profileId, fileName, timestamp) para
 * idempotencia + trazabilidad: si el joven re-sube el mismo archivo, se
 * sobreescribe en vez de duplicarse.
 */
export function signUpload(args: {
  profileId: string;
  fileName: string;
  resourceType?: CloudinaryResourceType;
}): SignedUploadParams | null {
  if (!ensureInitialized()) return null;
  const cfg = getCloudinaryConfig()!;

  const timestamp = Math.floor(Date.now() / 1000);
  // PublicId: <folder>/<profileId>/<sanitizedFileName>-<timestamp>
  // Sanitización: solo letras, números, guiones, sin puntos (Cloudinary
  // los interpreta como extensión, y nosotros declaramos resource_type).
  const safeName = args.fileName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .slice(0, 80) || "doc";
  const folder = `${cfg.uploadFolder}/${args.profileId}`;
  const publicId = `${safeName}-${timestamp}`;
  const resourceType = args.resourceType ?? "auto";

  // Cloudinary firma SOLO los params que vamos a enviar al endpoint de upload.
  // Si después el cliente manda un param no incluido en la firma, Cloudinary
  // rechaza. Si omitís uno acá, el cliente no puede sobrepasarlo.
  const paramsToSign: Record<string, string | number> = {
    folder,
    public_id: publicId,
    timestamp,
  };

  const signature = cloudinary.utils.api_sign_request(paramsToSign, cfg.apiSecret);

  return {
    signature,
    timestamp,
    apiKey: cfg.apiKey,
    cloudName: cfg.cloudName,
    folder,
    publicId,
    resourceType,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cfg.cloudName}/${resourceType}/upload`,
    allowedFormats: ["pdf", "jpg", "jpeg", "png", "webp"],
    maxBytes: 10 * 1024 * 1024, // 10 MB
  };
}

/**
 * Borra un asset por publicId. Usado cuando el joven elimina un documento.
 * Devuelve true si Cloudinary confirmó la baja.
 */
export async function deleteAsset(
  publicId: string,
  resourceType: CloudinaryResourceType = "auto",
): Promise<boolean> {
  if (!ensureInitialized()) return false;
  try {
    const res = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType === "auto" ? undefined : resourceType,
      invalidate: true,
    });
    return res?.result === "ok" || res?.result === "not found";
  } catch (e) {
    console.warn("[cloudinary] deleteAsset failed:", (e as Error).message);
    return false;
  }
}
