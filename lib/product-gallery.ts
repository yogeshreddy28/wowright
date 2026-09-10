import type { ProductVariant } from './domain';

export function galleryForFinish(
  defaultImages: string[],
  variant?: ProductVariant,
) {
  const exact = variant?.exactImages?.length
    ? variant.exactImages
    : variant?.exactImage
      ? [variant.exactImage]
      : [];
  return exact.length ? exact : defaultImages;
}

export function isFinishReferenceOnly(variant?: ProductVariant) {
  return Boolean(
    variant?.referenceImage &&
    !variant.exactImage &&
    !variant.exactImages?.length,
  );
}
