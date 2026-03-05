import "./globals.css";

export const metadata = {
  title: "Number Duel",
  description: "Guess each other's number",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, Arial", margin: 0 }}>{children}</body>
    </html>
  );
}