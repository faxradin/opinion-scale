import { useEffect, useRef, useState } from 'react';
import { User } from 'lucide-react';

interface PortraitImageProps {
  src?: string;
  alt: string;
  className?: string;
  noir?: boolean;
}

export function PortraitImage({
  src,
  alt,
  className = '',
  noir = true,
}: PortraitImageProps) {
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setFailed(false);
    if (imgRef.current && imgRef.current.complete && imgRef.current.naturalWidth === 0) {
      setFailed(true);
    }
  }, [src]);

  const hasValidSrc = Boolean(src && src.trim().length > 0 && !failed);

  if (!hasValidSrc) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-zinc-900 to-black text-zinc-500 border border-zinc-800 select-none ${
          ''
        } ${className}`}
        aria-label={alt}
      >
        <User className="w-5 h-5 text-zinc-600" strokeWidth={1.5} />
      </div>
    );
  }

  return (
    <img
      ref={imgRef}
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`dn-photo-reveal object-cover bg-[#0A0A0D] transition-[filter,transform] duration-300 ease-out ${
        noir
          ? 'grayscale-[30%] contrast-[1.08] group-hover:grayscale-0 group-hover:contrast-100'
          : ''
      } ${className}`}
    />
  );
}
