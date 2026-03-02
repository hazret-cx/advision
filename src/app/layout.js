import './globals.css';

export const metadata = {
  title: 'AdVision — Ad Placement Preview Tool',
  description: 'Generate realistic ad placement mockups on live publisher pages',
};

const ALKIMI_LOGO_PATHS = [
  'M83.8615 58.6759C78.5907 58.5085 73.4034 59.9878 69.0608 62.8966L72.2676 68.7C75.3341 66.4522 79.084 65.2623 82.9241 65.3187C88.7704 65.3187 91.6565 68.0525 91.6565 72.7289V73.2325H82.5787C71.9222 73.2325 68 77.693 68 83.4005C68 89.1081 73.057 93.6166 81.074 93.6166C86.3283 93.6166 90.1518 91.9618 92.1005 89.0121V93.1609H99.8462V73.0646C99.8462 63.2323 93.9999 58.6759 83.8861 58.6759H83.8615ZM91.6319 82.5132C90.9055 84.187 89.6588 85.5979 88.0663 86.5483C86.4738 87.4987 84.6154 87.9409 82.7514 87.8131C78.5332 87.8131 76.0417 85.9665 76.0417 83.0168C76.0417 80.6187 77.5465 78.4844 83.1461 78.4844H91.6319V82.4413V82.5132Z',
  'M113.711 46H105.497V93.4109H113.711V46Z',
  'M145.855 93.7292H155.845L139.811 73.9447L154.464 59.6278H144.597L127.576 74.9519V46H119.361V93.7292H127.576V84.7362L133.693 79.1006L145.855 93.7292Z',
  'M167.592 59.3477H159.378V93.473H167.592V59.3477Z',
  'M218.253 59.034C215.761 58.9459 213.281 59.412 211.002 60.397C208.724 61.382 206.707 62.8597 205.105 64.7176C203.822 62.8392 202.051 61.324 199.972 60.3258C197.892 59.3277 195.578 58.8819 193.264 59.034C191.102 58.9506 188.947 59.3381 186.958 60.1679C184.97 60.9977 183.197 62.2489 181.769 63.8302V59.4896H173.949V93.591H182.164V76.2765C182.164 69.5138 185.839 66.0605 191.291 66.0605C196.224 66.0605 199.184 69.0102 199.184 75.0774V93.591H207.399V76.2765C207.399 69.5138 211.148 66.0605 216.526 66.0605C221.46 66.0605 224.42 69.0102 224.42 75.0774V93.591H232.634V74.0463C232.634 63.7583 226.714 59.1059 218.253 59.1059',
  'M246.093 85.2653V67.2933C246.093 62.7562 242.415 59.0781 237.877 59.0781V93.4804C242.415 93.4804 246.093 89.8024 246.093 85.2653Z',
  'M262.163 59.0781C260.952 59.0781 261.062 60.3218 261.503 60.7674C261.985 61.1977 263.589 62.8645 263.589 62.8645L263.589 67.5642C263.589 67.5642 254.221 84.7493 253.026 86.9955C251.49 89.8835 253.906 93.4804 256.657 93.4804C258.562 93.4804 275.266 93.4804 278.111 93.4804C281.412 93.4804 283.833 90.0974 282.292 86.9955C281.75 85.9032 271.51 67.5642 271.51 67.5642V62.867L273.621 60.7674C274.267 60.1379 273.968 59.0781 273.044 59.0781C272.12 59.0781 263.549 59.0781 262.163 59.0781Z',
];

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Unbounded:wght@200;300;400;500;600;700;800;900&family=Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400;1,500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen">
        <nav style={{
          background: 'rgba(10,10,15,0.9)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          padding: '14px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            {/* Alkimi wordmark */}
            <div style={{ display: 'inline-flex', alignItems: 'baseline' }}>
              <svg
                viewBox="68 46 216 48"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                style={{ height: 22, width: 'auto' }}
              >
                {ALKIMI_LOGO_PATHS.map((d, i) => (
                  <path key={i} d={d} fill="#FFFFFF" />
                ))}
              </svg>
            </div>

            {/* Divider + product name */}
            <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.12)' }} />
            <span style={{
              fontFamily: 'var(--font-title)',
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#C8C8D0',
            }}>
              AdVision
            </span>
          </div>

          <span style={{
            fontFamily: 'var(--font-body)',
            fontSize: 11,
            color: '#7A7A85',
            letterSpacing: '0.02em',
          }}>
            Internal Tool — v1.0
          </span>
        </nav>

        <main className="max-w-7xl mx-auto px-6 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
