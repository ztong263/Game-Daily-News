import {cloudEnabled} from "../cloud/config";
export function localAccess(request: Request) {
  if(cloudEnabled())throw new Error("CLOUD_ROUTE_REQUIRED");
  const host = request.headers.get("host") || new URL(request.url).host;
  const hostname = new URL("http://" + host).hostname;
  if (!["localhost", "127.0.0.1", "[::1]"].includes(hostname))
    throw new Error("LOCAL_ONLY");
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== host) throw new Error("ORIGIN");
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new Error("CROSS_SITE");
}
