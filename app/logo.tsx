/** Aangan means courtyard: an arched doorway, with a small voice wave inside for the call assistant. */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path className="arch" d="M6 28V14a10 10 0 0 1 20 0v14Z" />
      <line className="step" x1="3" y1="28" x2="29" y2="28" />
      <rect className="wv" x="11" y="15" width="2.4" height="9" rx="1.2" />
      <rect className="wv" x="14.8" y="13" width="2.4" height="11" rx="1.2" />
      <rect className="wv" x="18.6" y="16" width="2.4" height="8" rx="1.2" />
    </svg>
  );
}
