import type { Metadata } from "next";
import "./globals.css";
import { ScrollProvider } from "@/providers/ScrollProvider";
import { AuthProvider } from "@/providers/AuthProvider";
import Navigation from "@/components/Navigation";

export const metadata: Metadata = {
  title: "Our Wedding | A Celebration of Love",
  description: "Join us in celebrating the union of two souls. A beautiful journey of love, laughter, and forever.",
  keywords: ["wedding", "celebration", "love", "ceremony"],
  openGraph: {
    title: "Our Wedding | A Celebration of Love",
    description: "Join us in celebrating the union of two souls.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-parchment min-h-screen">
        <AuthProvider>
          <ScrollProvider>
            <Navigation />
            <main>{children}</main>
          </ScrollProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
