# Dev server with caching disabled so module edits always load. Usage: python3 tools/serve.py [port]
import http.server, sys, os
os.chdir(os.path.join(os.path.dirname(__file__), '..'))
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer(('', int(sys.argv[1]) if len(sys.argv) > 1 else 5173), H).serve_forever()
