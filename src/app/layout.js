import './globals.css';

export const metadata = {
  title: 'AdVision — Ad Placement Preview Tool',
  description: 'Generate realistic ad placement mockups on live publisher pages',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen">
        <nav className="bg-[#1A1A2E] text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#00B4D8] rounded-lg flex items-center justify-center text-sm font-bold">AV</div>
            <span className="text-lg font-semibold">AdVision</span>
            <span className="text-xs text-gray-400 ml-2">by Alkimi Exchange</span>
          </div>
          <span className="text-xs text-gray-500">Internal Tool — v1.0 MVP</span>
        </nav>
        <main className="max-w-7xl mx-auto px-6 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
