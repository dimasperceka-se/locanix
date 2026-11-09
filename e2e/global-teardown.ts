import { readFile, writeFile } from "node:fs/promises";

/** The e2e `next dev` points next-env.d.ts at its own build folder; point it back. */
export default async function globalTeardown() {
  const file = "next-env.d.ts";
  const content = await readFile(file, "utf8").catch(() => "");
  if (content.includes("./.next-e2e/")) await writeFile(file, content.replaceAll("./.next-e2e/", "./.next/"));
}
