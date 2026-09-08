import type { Metadata, Viewport } from "next";
import { Manrope, Source_Serif_4, Source_Code_Pro } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
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
  themeColor: "#faf8f4",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${sourceSerif.variable} ${sourceCodePro.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
