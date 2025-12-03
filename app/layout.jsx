import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "./providers";
import "@/style/globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "EverGreen",
  description: "EverGreen Development",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/logoCompany/logoCompany_1.png" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          <div className="min-h-screen w-full bg-light-background dark:bg-dark-background overflow-x-hidden">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
