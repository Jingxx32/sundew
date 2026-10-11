import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// The link preview for every page (LinkedIn, Slack, iMessage). Public in the proxy.
export const alt = "Sundew — TCF Canada practice that trains your weak spots";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const logo = await readFile(join(process.cwd(), "public/assets/sundew-logo-assets/sundew-symbol-3d-512.png"));
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          gap: 64,
          padding: "0 88px",
          background: "radial-gradient(circle at 78% 30%, rgba(122,156,255,0.45) 0%, rgba(255,168,176,0.22) 38%, #f6f8fd 70%)",
          color: "#0f2747",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ fontSize: 34, color: "#1f4ed8", letterSpacing: "-0.01em" }}>Sundew</div>
          <div style={{ marginTop: 20, fontSize: 70, lineHeight: 1.05, letterSpacing: "-0.035em" }}>
            Practise the exam. Fix the weakness behind it.
          </div>
          <div style={{ marginTop: 28, fontSize: 30, color: "#55617a" }}>
            TCF Canada practice · try it without signing up
          </div>
          <div style={{ marginTop: 40, fontSize: 24, color: "#55617a" }}>sundew.jingxuanxu.com</div>
        </div>
        <img src={logoSrc} width={300} height={300} alt="" />
      </div>
    ),
    size,
  );
}
