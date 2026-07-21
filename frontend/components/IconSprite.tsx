// SVG symbol sprite ported verbatim from the approved "navegación nocturna" mockup.
// Mounted once in the root layout; every icon renders via <use href="#ic-…"> and the
// animated radar brand logo via <use href="#logo">. Raw markup is injected because the
// logo relies on SMIL (<animate>/<animateTransform>) which must reach the DOM untouched.
const SPRITE_MARKUP = `
  <defs>
    <linearGradient id="lg-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#132638"/><stop offset="1" stop-color="#060a10"/></linearGradient>
    <radialGradient id="lg-disc" cx="0.5" cy="0.46" r="0.55"><stop offset="0" stop-color="#10202f"/><stop offset="1" stop-color="#091019"/></radialGradient>
    <linearGradient id="lg-sweep" x1="256" y1="256" x2="452" y2="130" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#35E0C1" stop-opacity="0"/><stop offset="0.55" stop-color="#35E0C1" stop-opacity="0.3"/><stop offset="1" stop-color="#7BFFEA" stop-opacity="0.9"/></linearGradient>
    <linearGradient id="lg-pinFire" x1="0" y1="-80" x2="0" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FF9F6B"/><stop offset="0.5" stop-color="#FF5A45"/><stop offset="1" stop-color="#E12A2A"/></linearGradient>
    <linearGradient id="lg-pinRed" x1="0" y1="-80" x2="0" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FF8A8A"/><stop offset="0.5" stop-color="#FF4D4D"/><stop offset="1" stop-color="#D62222"/></linearGradient>
    <linearGradient id="lg-pinAmber" x1="0" y1="-80" x2="0" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFDD82"/><stop offset="0.5" stop-color="#FDB022"/><stop offset="1" stop-color="#E8890C"/></linearGradient>
    <linearGradient id="lg-pinTeal" x1="0" y1="-80" x2="0" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#8FF3E0"/><stop offset="0.5" stop-color="#33D6E6"/><stop offset="1" stop-color="#159FCB"/></linearGradient>
    <clipPath id="lg-clip"><circle cx="256" cy="256" r="190"/></clipPath>
  </defs>
  <symbol id="ic-map" viewBox="0 0 24 24"><path d="M9 4 3 6.2v14L9 18l6 2 6-2.2v-14L15 6 9 4Z"/><path d="M9 4v14M15 6v14"/></symbol>
  <symbol id="ic-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>
  <symbol id="ic-mic" viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></symbol>
  <symbol id="ic-user" viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.6"/><path d="M5 20a7 7 0 0 1 14 0"/></symbol>
  <symbol id="ic-car" viewBox="0 0 24 24"><path d="M5.5 11 7 6.6A2 2 0 0 1 8.9 5.2h6.2A2 2 0 0 1 17 6.6L18.5 11"/><rect x="4" y="11" width="16" height="6" rx="1.6"/><path d="M7.5 17v1.6M16.5 17v1.6"/></symbol>
  <symbol id="ic-water" viewBox="0 0 24 24"><path d="M12 3.5c3 3.4 6 6.8 6 10.1a6 6 0 0 1-12 0c0-3.3 3-6.7 6-10.1Z"/></symbol>
  <symbol id="ic-fire" viewBox="0 0 24 24"><path d="M12 3c.5 2.8 3.8 4 3.8 8.2A3.8 3.8 0 0 1 8.2 11c0-1 .4-1.9 1-2.6.4 1 1.2 1.5 2 1.5C10.5 8 12 6.2 12 3Z"/></symbol>
  <symbol id="ic-road" viewBox="0 0 24 24"><path d="M7 21 9 3M17 21 15 3M12 5.5v3M12 11v3M12 16.5v3"/></symbol>
  <symbol id="ic-cam" viewBox="0 0 24 24"><path d="M4 8.5h3L8.4 6h7.2l1.4 2.5H20V19H4z"/><circle cx="12" cy="13" r="3.2"/></symbol>
  <symbol id="ic-shield" viewBox="0 0 24 24"><path d="M12 3 5 6v5c0 4 3 7 7 8 4-1 7-4 7-8V6l-7-3Z"/><path d="M9 11.5 11 13.5 15 9.5"/></symbol>
  <symbol id="ic-eye" viewBox="0 0 24 24"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.6"/></symbol>
  <symbol id="ic-spark" viewBox="0 0 24 24"><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7Z"/></symbol>
  <symbol id="ic-check" viewBox="0 0 24 24"><path d="M4 12.5 9 17.5 20 6.5"/></symbol>
  <symbol id="ic-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-3.5-3.5"/></symbol>
  <symbol id="ic-bell" viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.6 2.3H4.4z"/><path d="M9.5 20a2.5 2.5 0 0 0 5 0"/></symbol>
  <symbol id="ic-target" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.4"/></symbol>
  <symbol id="ic-chevron" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></symbol>
  <symbol id="ic-back" viewBox="0 0 24 24"><path d="m14 6-6 6 6 6"/></symbol>
  <symbol id="ic-logout" viewBox="0 0 24 24"><path d="M14 4H6v16h8M10 12h10M17 8.5 20.5 12 17 15.5"/></symbol>
  <symbol id="ic-pin" viewBox="0 0 24 24"><path d="M12 21s7-6.3 7-12a7 7 0 1 0-14 0c0 5.7 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/></symbol>
  <symbol id="ic-chat" viewBox="0 0 24 24"><path d="M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4 3.5V16H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/></symbol>
  <symbol id="ic-alert" viewBox="0 0 24 24"><path d="M12 4 21.5 20H2.5Z"/><path d="M12 10v4.5"/><path d="M12 17.4h.01"/></symbol>
  <symbol id="ic-phone" viewBox="0 0 24 24"><path d="M6 3h3.5l1.7 4.3-2.2 1.6a11 11 0 0 0 5.1 5.1l1.6-2.2 4.3 1.7V19a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2Z"/></symbol>
  <symbol id="logo" viewBox="0 0 512 512">
    <rect x="16" y="16" width="480" height="480" rx="116" fill="url(#lg-bg)"/>
    <circle cx="256" cy="256" r="190" fill="url(#lg-disc)"/>
    <g clip-path="url(#lg-clip)">
      <path d="M120 470 C 210 360 250 300 235 210 C 225 150 250 100 300 70" fill="none" stroke="#4FA9FF" stroke-opacity="0.20" stroke-width="10" stroke-linecap="round"/>
      <g stroke="#35E0C1" stroke-opacity="0.10" stroke-width="3" fill="none"><path d="M95 140 L470 205 M70 250 L450 315 M150 70 L205 460 M385 90 L430 430"/></g>
    </g>
    <circle cx="256" cy="256" r="190" fill="none" stroke="#35E0C1" stroke-width="7" opacity="0.95"/>
    <circle cx="256" cy="256" r="132" fill="none" stroke="#35E0C1" stroke-width="3" opacity="0.22"/>
    <circle cx="256" cy="256" r="74" fill="none" stroke="#35E0C1" stroke-width="3" opacity="0.22"/>
    <path d="M66 256H446M256 66V446" stroke="#35E0C1" stroke-width="3" opacity="0.15"/>
    <g clip-path="url(#lg-clip)"><g>
      <path d="M256 256 L452 130 A190 190 0 0 1 452 256 Z" fill="url(#lg-sweep)"/>
      <path d="M256 256 L452 130" stroke="#9BFFEE" stroke-width="4" opacity="0.9"/>
      <animateTransform attributeName="transform" type="rotate" from="0 256 256" to="360 256 256" dur="4s" repeatCount="indefinite"/>
    </g></g>
    <circle cx="256" cy="256" r="11" fill="#9BFFEE"/><circle cx="256" cy="256" r="5" fill="#0a141d"/>
    <g>
      <circle cx="205" cy="360" r="5" fill="#35E0C1"><animate attributeName="opacity" values="0;1;.5;0" dur="4s" begin="0s" repeatCount="indefinite"/></circle>
      <circle cx="388" cy="205" r="4.5" fill="#35E0C1"><animate attributeName="opacity" values="0;1;.5;0" dur="4s" begin="1s" repeatCount="indefinite"/></circle>
      <circle cx="160" cy="235" r="4.5" fill="#35E0C1"><animate attributeName="opacity" values="0;1;.5;0" dur="4s" begin="2s" repeatCount="indefinite"/></circle>
      <circle cx="330" cy="150" r="4" fill="#FF6B6B"><animate attributeName="opacity" values="0;1;.5;0" dur="4s" begin="1.5s" repeatCount="indefinite"/></circle>
      <circle cx="400" cy="290" r="4" fill="#FFC24A"><animate attributeName="opacity" values="0;1;.5;0" dur="4s" begin="2.8s" repeatCount="indefinite"/></circle>
    </g>
    <g transform="translate(185,208)">
      <ellipse cx="0" cy="9" rx="18" ry="5" fill="#000" fill-opacity="0.25"/>
      <path d="M0 0 C -16 -22 -30 -34 -30 -50 A30 30 0 1 1 30 -50 C30 -34 16 -22 0 0 Z" fill="url(#lg-pinFire)"/>
      <ellipse cx="-8" cy="-60" rx="9" ry="6" fill="#fff" fill-opacity="0.28"/>
      <g transform="translate(0,-50) scale(1.32) translate(-12,-12)" fill="#fff"><path d="M12 2.5c1.1 3.4 4.7 4.8 4.7 9A4.7 4.7 0 0 1 12 16a4.7 4.7 0 0 1-4.7-4.5c0-1.2.4-2.3 1.2-3.2.3 1.5 1.4 2.4 2.6 2.4C12.8 8.4 12 5.9 12 2.5Z"/></g>
    </g>
    <g transform="translate(180,338)">
      <ellipse cx="0" cy="9" rx="18" ry="5" fill="#000" fill-opacity="0.25"/>
      <path d="M0 0 C -16 -22 -30 -34 -30 -50 A30 30 0 1 1 30 -50 C30 -34 16 -22 0 0 Z" fill="url(#lg-pinRed)"/>
      <ellipse cx="-8" cy="-60" rx="9" ry="6" fill="#fff" fill-opacity="0.28"/>
      <g transform="translate(0,-50) scale(1.32) translate(-12,-12)" fill="#fff"><path d="M4.4 13.6 5.9 10a2.2 2.2 0 0 1 2-1.3h8.2a2.2 2.2 0 0 1 2 1.3l1.5 3.6c.2.3.3.7.3 1.1v2.6c0 .6-.5 1-1 1h-1.1c-.6 0-1-.5-1-1v-.6H7.2v.6c0 .6-.5 1-1 1H5c-.6 0-1-.5-1-1v-2.6c0-.4.1-.8.4-1.1Z"/></g>
    </g>
    <g transform="translate(350,338)">
      <ellipse cx="0" cy="9" rx="18" ry="5" fill="#000" fill-opacity="0.25"/>
      <path d="M0 0 C -16 -22 -30 -34 -30 -50 A30 30 0 1 1 30 -50 C30 -34 16 -22 0 0 Z" fill="url(#lg-pinAmber)"/>
      <ellipse cx="-8" cy="-60" rx="9" ry="6" fill="#fff" fill-opacity="0.30"/>
      <g transform="translate(0,-50) scale(1.32) translate(-12,-12)"><rect x="4" y="8.5" width="16" height="4.6" rx="1.2" fill="#fff"/><path d="M6.5 13.1V19M17.5 13.1V19" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></g>
    </g>
    <g transform="translate(295,406)">
      <ellipse cx="0" cy="9" rx="18" ry="5" fill="#000" fill-opacity="0.25"/>
      <path d="M0 0 C -16 -22 -30 -34 -30 -50 A30 30 0 1 1 30 -50 C30 -34 16 -22 0 0 Z" fill="url(#lg-pinTeal)"/>
      <ellipse cx="-8" cy="-60" rx="9" ry="6" fill="#fff" fill-opacity="0.30"/>
      <g transform="translate(0,-50) scale(1.32) translate(-12,-12)" fill="#fff"><path d="M4.4 11.6 5.9 8.2a2.2 2.2 0 0 1 2-1.3h8.2a2.2 2.2 0 0 1 2 1.3l1.5 3.4c.2.3.3.7.3 1.1v1.8H4v-1.8c0-.4.1-.8.4-1.1Z"/></g>
    </g>
  </symbol>
`;

export default function IconSprite() {
  return (
    <svg
      width="0"
      height="0"
      style={{ position: "absolute" }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: SPRITE_MARKUP }}
    />
  );
}
