export const CONNECT_FRAME_HEADERS = {
  "Content-Security-Policy": "frame-ancestors 'none'",
  "X-Frame-Options": "DENY",
} as const;

export function connectRedirect(path: string): Response {
  return new Response(null, {
    status: 303,
    headers: { Location: path, "Cache-Control": "no-store", ...CONNECT_FRAME_HEADERS },
  });
}
