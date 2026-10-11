// An AI-generated portrait of the project's author, published with his consent (docs/ghost/README.md),
// so judges see ECHO's face before choosing their own.
export const DEMO_FACE = new URL("./assets/demo-face.jpg", import.meta.url).href;

export async function demoFaceFile(): Promise<File> {
  const blob = await (await fetch(DEMO_FACE)).blob();
  return new File([blob], "demo-face.jpg", { type: "image/jpeg" });
}
