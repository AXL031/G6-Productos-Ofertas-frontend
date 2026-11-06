import { G7Session } from "../../features/promotions/adapters/g7Session";

export function createOptionalAuthSession(base?: string): G7Session | null {
  if (!base) return null;
  try { return new G7Session(base); }
  catch { return null; }
}
