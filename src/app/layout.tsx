import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Ayaale Hub — Your creative headquarters", description: "Organize projects, capture ideas, and build what comes next." };
export default function RootLayout({ children }: Readonly<{
    children: React.ReactNode;
}>) { return <html lang="en"><body>{children}</body></html>; }
