export function publicAssetUrl(assetPath: string): string {
  const basePath = import.meta.env.BASE_URL || '/';
  const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`;
  const normalizedAsset = assetPath.startsWith('/') ? assetPath.slice(1) : assetPath;
  return new URL(`${normalizedBase}${normalizedAsset}`, window.location.origin).toString();
}
