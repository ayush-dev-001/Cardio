/** CardioScope mark: white heart with a purple ECG pulse across its centre. */
export function HeartMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <path
        d="M16 28.5C9.6 23.4 2.5 18.2 2.5 10.9 2.5 6.9 5.6 3.8 9.4 3.8c2.6 0 4.9 1.4 6.6 3.7 1.7-2.3 4-3.7 6.6-3.7 3.8 0 6.9 3.1 6.9 7.1 0 7.3-7.1 12.5-13.5 17.6z"
        fill="#ffffff"
      />
      <path
        d="M1.5 15.2h8.2l2-4.4 3.3 9.2 2.6-6.9 1.6 2.1h11.3"
        fill="none"
        stroke="#7b39fc"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Wordmark: heart mark + "CardioScope" (Manrope Bold 17px); name hidden on very small screens. */
export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <HeartMark />
      <span className="font-manrope text-[17px] font-bold tracking-tight text-white max-[340px]:sr-only">CardioScope</span>
    </span>
  );
}
