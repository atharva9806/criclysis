#!/usr/bin/env python3
"""A stub HTTP server for testing scripts/ci/smoke.sh.

    python3 scripts/ci/tests/stub_server.py PORT_FILE

Binds a free port on 127.0.0.1, writes it to PORT_FILE and serves the pages
below, which imitate what `next start` sends: a layout with a <nav> and a
<footer>, React Server Components payloads in <script> tags, and pages that
stream behind a loading fallback. Standard library only.
"""
from __future__ import annotations

import http.server
import sys
from pathlib import Path

HEAD = "<head><title>{title}</title>{meta}<style>.x{{content:'undefined'}}</style></head>"
LAYOUT = (
    "<!DOCTYPE html><html>" + HEAD +
    "<body><header><nav><a href='/players'>Players</a><a href='/teams'>Teams</a></nav></header>"
    "<main>{main}</main>"
    "<footer><nav><a href='/players'>Players</a></nav><p>Data: Cricsheet</p></footer>"
    "<script>self.__next_f.push([1,\"{payload}\"])</script>{tail}</body></html>"
)


def page(main: str, *, title: str = "Criclysis", meta: str = "",
         payload: str = "$undefined", tail: str = "") -> str:
    return LAYOUT.format(title=title, meta=meta, main=main, payload=payload, tail=tail)


LOADING = "<template id='B:0'></template><p>Loading...</p>"

PAGES: dict[str, tuple[int, str, str]] = {
    # Rendered straight away.
    "/players": (200, "text/html; charset=utf-8",
                 page("<h2>Players</h2><table><tr><td>Nanda</td><td>48.2</td></tr></table>")),
    # Streamed: the fallback first, then the page in a hidden div.
    "/players/v-kohli": (200, "text/html; charset=utf-8", page(
        LOADING, tail="<div hidden id='S:0'><h1>V Kohli</h1><p>Average 58.1</p></div>"
                      "<script>$RC('B:0','S:0')</script>")),
    # The page threw while streaming: only the fallback, and the error digest
    # in the RSC payload, escaped inside a JS string as Next sends it.
    "/players/throws": (200, "text/html; charset=utf-8", page(
        LOADING, title="V Kohli", payload='5:E{\\"digest\\":\\"1234567\\"}',
        tail="<script>$RX('B:0','1234567')</script>")),
    # The same, as an unescaped key and as React's data-dgst attribute.
    "/throws-plain": (200, "text/html", page("<p>x</p>", tail='<script>{"digest":"1"}</script>')),
    "/throws-dgst": (200, "text/html", page('<template data-dgst="1"></template>')),
    # notFound() while streaming: still 200, with a noindex meta tag.
    "/players/missing": (200, "text/html; charset=utf-8", page(
        LOADING, meta='<meta name="robots" content="noindex"/>')),
    # The heading word only exists in the navigation and the title.
    "/nav-only": (200, "text/html", page("<p>Nothing here</p>", title="Teams")),
    "/nan": (200, "text/html", page("<svg><path d='M0,NaN L1,2'/></svg>")),
    "/undefined": (200, "text/html", page('<div class="undefined">x</div>')),
    "/api/health": (200, "application/json", '{"ok":true,"dataset":null}'),
    "/api/bad": (200, "application/json", '{"label":"NaN%"}'),
    "/missing": (404, "text/html", page("<h1>404</h1>")),
    "/redirect": (307, "text/html", ""),
}


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802 - the stdlib's name
        path = self.path.split("?", 1)[0]
        if path == "/":
            path = "/players"
        code, ctype, body = PAGES.get(path, (404, "text/html", "not found"))
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        if code == 307:
            self.send_header("Location", "/")
        self.end_headers()
        self.wfile.write(body.encode())

    def log_message(self, *args) -> None:
        pass


def main() -> None:
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    Path(sys.argv[1]).write_text(str(server.server_address[1]))
    server.serve_forever()


if __name__ == "__main__":
    main()
