/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        alkimi: {
          dark: '#1A1A2E',
          accent: '#00B4D8',
          light: '#F0F7FA',
        },
      },
    },
  },
  plugins: [],
};
