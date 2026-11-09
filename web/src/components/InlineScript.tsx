/**
 * A script that runs during HTML parsing, before first paint. On the client it
 * renders as text/plain, so React neither re-runs it nor warns about a script
 * tag; suppressHydrationWarning accepts the type difference.
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** Applies a saved light or dark choice before paint, so there is no flash of the wrong theme. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("criclysis-theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
