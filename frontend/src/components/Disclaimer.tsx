/** Permanent clinical safety disclaimer (hackathon requirement). Never hide or make dismissible. */
export function Disclaimer() {
  return (
    <div role="note" className="flex items-center gap-2 border-b border-amber-500/40 bg-amber-500/15 px-4 py-2 text-xs text-amber-100 sm:text-sm">
      <span aria-hidden className="text-base">⚠</span>
      <span>
        <strong>For decision support and education only.</strong> CardioScope predictions are not a diagnosis and are
        not a substitute for formal diagnostic imaging (e.g. coronary angiography). Vessel colours show predicted
        stenosis probability per artery, not the location of a lesion.
      </span>
    </div>
  );
}
