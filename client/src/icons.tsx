// Small inline icons (no icon library needed). They inherit the text colour.
type P = { size?: number; className?: string };
const svg = (size: number, className: string | undefined, children: React.ReactNode) =>
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">{children}</svg>;

export const LogoMark = ({ size = 34 }: P) =>
  <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
    <rect width="40" height="40" rx="12" fill="#1f5a3d" />
    <path d="M20 31V17" stroke="#f3e7c9" strokeWidth="2.4" strokeLinecap="round" />
    <path d="M20 21c-5.5 0-9-3.5-9-9 5.5 0 9 3.5 9 9Z" fill="#8fc27a" />
    <path d="M20 25c5.5 0 9-3.5 9-9-5.5 0-9 3.5-9 9Z" fill="#e2b53e" />
  </svg>;

export const SproutIcon = ({ size = 24, className }: P) => svg(size, className, <>
  <path d="M12 21v-9" /><path d="M12 12c-4.5 0-7-2.5-7-7 4.5 0 7 2.5 7 7Z" /><path d="M12 15c4 0 6.5-2.3 6.5-6.5-4 0-6.5 2.3-6.5 6.5Z" /><path d="M7 21h10" />
</>);

export const StoreIcon = ({ size = 24, className }: P) => svg(size, className, <>
  <path d="M4 10v10h16V10" /><path d="M3 10l2-6h14l2 6" /><path d="M3 10c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3" /><path d="M10 20v-4h4v4" />
</>);

export const ChartIcon = ({ size = 24, className }: P) => svg(size, className, <>
  <path d="M4 20V4" /><path d="M4 20h16" /><path d="M7 15l4-4 3 3 5-6" />
</>);

export const MicIcon = ({ size = 28, className }: P) => svg(size, className, <>
  <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0" /><path d="M12 17.5V21" />
</>);

export const StopIcon = ({ size = 26, className }: P) =>
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}><rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" /></svg>;

export const SendIcon = ({ size = 20, className }: P) => svg(size, className, <><path d="M5 12h13" /><path d="M13 6l6 6-6 6" /></>);

export const SparkIcon = ({ size = 16, className }: P) =>
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}><path d="M12 2.5l2.1 6.4 6.4 2.1-6.4 2.1L12 19.5l-2.1-6.4L3.5 11l6.4-2.1L12 2.5Z" fill="currentColor" /></svg>;

/** Soft rolling fields with crop rows and a sun, for the top of the Sell screen. */
export const FieldArt = () =>
  <svg className="field-art" viewBox="0 0 360 120" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <circle cx="292" cy="38" r="20" fill="#f2c94c" opacity=".9" />
    <path d="M0 78 C 70 52, 140 60, 200 74 S 320 96, 360 70 V120 H0Z" fill="#b9d8a1" />
    <path d="M0 96 C 80 74, 170 82, 250 96 S 340 104, 360 94 V120 H0Z" fill="#7fb46a" />
    <path d="M0 110 C 90 96, 200 100, 360 112 V120 H0Z" fill="#4f8d4a" />
    {[30, 62, 94, 126, 158, 190, 222, 254, 286, 318].map((x, i) =>
      <path key={x} d={`M${x} ${104 - (i % 3)} q4 -10 0 -18 q-4 8 0 18`} fill="#2f6b3a" opacity=".55" />)}
  </svg>;
