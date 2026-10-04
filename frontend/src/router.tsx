/** Minimal two-route router (History API): "/" = landing page, "/app" = dashboard. */
import { useEffect, useState, type AnchorHTMLAttributes, type MouseEvent } from "react";

const EVENT = "cardioscope:navigate";

export function navigate(to: string) {
  if (to === window.location.pathname + window.location.hash) return;
  window.history.pushState({}, "", to);
  window.dispatchEvent(new Event(EVENT));
  if (!to.includes("#")) window.scrollTo({ top: 0 });
}

export function usePath(): string {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const update = () => setPath(window.location.pathname);
    window.addEventListener("popstate", update);
    window.addEventListener(EVENT, update);
    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener(EVENT, update);
    };
  }, []);
  return path;
}

/** In-app link: client-side navigation for plain left clicks, normal behaviour otherwise. */
export function Link({ href, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || href.startsWith("#")) return;
    e.preventDefault();
    navigate(href);
  };
  return <a href={href} onClick={handle} {...rest} />;
}
