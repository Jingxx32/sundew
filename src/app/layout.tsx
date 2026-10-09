import type { Metadata, Viewport } from "next";
import { Geist, Plus_Jakarta_Sans, Source_Serif_4, Source_Code_Pro } from "next/font/google";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

// Display face for page titles; only the weight we use.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: "800",
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  weight: ["400", "600"],
});

const sourceCodePro = Source_Code_Pro({
  variable: "--font-source-code",
  subsets: ["latin"],
  weight: ["500", "600"],
});

export const metadata: Metadata = {
  title: "Sundew — French learning, output-first",
  description:
    "Read French, write French, see your blind spots fade. A personal training ground for output-driven French learning.",
  icons: {
    icon: "/assets/sundew-logo-assets/sundew-app-icon-bold-512.png",
    apple: "/assets/sundew-logo-assets/sundew-app-icon-bold-512.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#f6f8fd",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${jakarta.variable} ${sourceSerif.variable} ${sourceCodePro.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
