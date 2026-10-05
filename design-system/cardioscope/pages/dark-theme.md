# Override: dark theme (landing + dashboard)

> **Update (product-owner decision):** the brand is now purple glassmorphism. Primary `#7B39FC`,
> dark plum `#2B2344`, background ink `#0B0814`, frosted `.glass` / `.glass-strong` surfaces.
> Fonts: Instrument Serif (headlines), Manrope (UI/nav), Cabin (buttons/tags), Inter (body).
> This intentionally overrides MASTER's "avoid purple" anti-pattern. Semantic data colours
> (risk scale, SHAP red/blue, low/high chips) are unchanged, and the accessibility rules
> still apply. The table below records the previous blue/amber theme.
>
> **Dashboard (/app) override:** neutral graphite glass (`.card-surface`: rgba(34,37,46,.66)->rgba(22,24,31,.72),
> hairline white/8% border, 20px blur) on #0b0c10-#101217. Purple is limited to accents (primary buttons,
> active tab/segment, switch, slider, focus, selected vessel). Reason: calm surfaces make the anatomy and the
> risk colours the most saturated elements, which is what a clinical tool should emphasise.

Overrides MASTER.md for every CardioScope page. Reason: the product centres on a 3D anatomical
viewer, and medical-imaging viewers conventionally use dark surroundings, so the semi-transparent
"x-ray" torso and the risk colours keep maximum contrast. Accessibility rules from MASTER still
apply in full.

| Role | Value | Notes |
|---|---|---|
| Background | `#020617` (slate-950) | page; panels `#0F172A` (slate-900) at 70-90% |
| Text | `#F1F5F9` / `#CBD5E1` / `#94A3B8` | primary / secondary / muted (all >= 4.5:1 on bg) |
| Primary (data, links) | `#3B82F6` / `#60A5FA` | MASTER secondary, lightened for dark bg |
| CTA | `#F59E0B` with **dark text** `#0B1120` | MASTER's white-on-amber fails WCAG (2.1:1); dark text gives ~9:1 |
| Risk scale | green `#22C55E` -> amber `#F59E0B` -> red `#DC2626` | shared with the 3D view and legend |
| Explanation diverging pair | red `#E34948` / blue `#2A78D6` | validated: CVD dE 21.6, contrast >= 3:1 |

- Fonts: Figtree (headings and UI). Noto Sans is not loaded, to keep one family and fewer bytes.
- Gradient text: blue -> amber only (no purple/pink, per the MASTER anti-patterns).
- Motion: at most one key animation per view; fades and rises of 200-600 ms with ease-out;
  everything is disabled under `prefers-reduced-motion`.
- Icons: lucide-react only (no emoji or text glyphs as icons).
