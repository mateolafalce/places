/* oxlint-disable next/no-img-element -- Vitest replaces next/image with a plain DOM image. */

import type { ImgHTMLAttributes } from 'react';

interface TestImageProps extends Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  'src'
> {
  src: string | { src: string };
  unoptimized?: boolean;
}

export default function TestImage({
  src,
  unoptimized: _unoptimized,
  ...props
}: TestImageProps) {
  return (
    <img
      src={typeof src === 'string' ? src : src.src}
      alt={props.alt ?? ''}
      {...props}
    />
  );
}
