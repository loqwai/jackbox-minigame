export const manifestJson = JSON.stringify({
  name: "Draw Together",
  short_name: "Draw",
  description: "Collaborative infinite canvas drawing",
  start_url: "/",
  display: "standalone",
  orientation: "any",
  background_color: "#1a1a2e",
  theme_color: "#e94560",
  icons: [
    {
      src: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect fill='%231a1a2e' width='100' height='100' rx='20'/><circle fill='%23e94560' cx='50' cy='50' r='25'/></svg>",
      sizes: "any",
      type: "image/svg+xml",
      purpose: "any maskable"
    }
  ]
})
