export const GOOD_BODY = {
  success: true,
  data: { timestamp: "2026-09-17 11:31:39", suhu: 28.5, kelembaban: 72 },
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function fetchReturning(response: Response | (() => Response)): typeof fetch {
  return (async () => (typeof response === "function" ? response() : response.clone())) as typeof fetch;
}

/** fetch yang tidak pernah selesai sampai signal timeout memicu abort. */
export const hangingFetch = ((_url: unknown, init?: RequestInit) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason ?? new Error("aborted")));
  })) as typeof fetch;

export const SENSOR_URL = "https://script.google.com/macros/s/TEST/exec?action=getLastSensor";
