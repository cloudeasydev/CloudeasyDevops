/** Express 5 types `req.params` values as `string | string[]`. These routes use a single segment. */
export function routeParam(value: string | string[] | undefined): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? "";
  return "";
}
