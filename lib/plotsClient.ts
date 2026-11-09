import type { Plot } from "./geo";

/**
 * Persist uploaded plots to the server database (best-effort). Every plot that
 * passes through the upload/validation step is saved for the signed-in user.
 * Failures are logged but never block the analysis flow.
 */
export async function persistPlots(plots: Plot[], source = "upload"): Promise<void> {
  if (!plots.length) return;
  try {
    await fetch("/api/plots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        source,
        plots: plots.map((p) => ({
          plotId: p.plotId,
          name: p.name,
          areaHa: p.areaHa,
          isValid: p.isValid,
          issues: p.issues,
          ring: p.ring,
        })),
      }),
    });
  } catch (e) {
    console.warn("[plots] persist failed:", (e as Error).message);
  }
}
