// ════════════════════════════════════════════════════════════════════
//  J.A.R.V.I.S. CONFIG — all text/visual settings for the Iron Man README
//
//  Edit anything here, then rebuild:
//    node ironman/build.mjs --static                 → artwork only
//    GITHUB_TOKEN=$(gh auth token) node ironman/build.mjs   → artwork + live stats
//
//  Pushing a change inside ironman/ to GitHub also rebuilds everything
//  automatically (.github/workflows/ironman-hud.yml), and the live stats
//  card refreshes every day.
// ════════════════════════════════════════════════════════════════════

export default {
  username: 'Dragonslayer-beer',
  name: 'APHISIT INTHONGXAY',
  company: 'DRAGONSLAYER INDUSTRIES',
  role: 'FULL-STACK DEVELOPER  ·  AI EXPLORER  ·  RUNNER',

  // Header terminal — typed one line at a time, then loops.
  typing: [
    'Welcome back, Aphisit. All systems online.',
    'Loading armor: Next.js · Go · Flutter · Docker',
    'Exploring AI — building my own J.A.R.V.I.S.',
    'Suit up. Ship code. Repeat.',
  ],

  // Header chips: [label, value]
  chips: [
    ['HANDLE', '@Dragonslayer-beer'],
    ['CLASS', 'FULL-STACK'],
    ['R&D', 'AI'],
    ['POWER', '400%'],
  ],

  // Facial-recognition card. Use a square photo (~440px).
  // face / landmarks are positions inside the photo, from 0 to 1.
  pilot: {
    photo: 'ironman/pilot.jpg',
    face: { x: 0.325, y: 0.18, w: 0.34, h: 0.39 },
    landmarks: [
      [0.489, 0.227], // forehead
      [0.41, 0.318], // left eye
      [0.54, 0.318], // right eye
      [0.375, 0.43], // left cheek
      [0.473, 0.405], // nose
      [0.615, 0.43], // right cheek
      [0.473, 0.455], // mouth
      [0.477, 0.55], // chin
    ],
    callsign: 'DRAGONSLAYER-BEER',
    match: '99.7%',
    clearance: 'LEVEL 7',
  },

  // Section title bars (a dark + a light version are generated for each).
  sections: [
    { id: 'pilot', no: '01', title: 'PILOT PROFILE', tag: 'ABOUT ME' },
    { id: 'arsenal', no: '02', title: 'ARSENAL', tag: 'TECH STACK' },
    { id: 'diagnostics', no: '03', title: 'SUIT DIAGNOSTICS', tag: 'GITHUB STATS' },
    { id: 'repulsor', no: '04', title: 'REPULSOR TARGETING', tag: 'CONTRIBUTIONS' },
    { id: 'status', no: '05', title: 'SUIT STATUS LOG', tag: 'CODE CYCLE' },
  ],

  // "Code cycle" panel — images are embedded into the SVG.
  statusLog: [
    { image: 'ironman/status-1.png', state: 'CRITICAL', text: 'Suit malfunction — broken system!', tone: 'red' },
    { image: 'ironman/status-2.png', state: 'RESTORED', text: "Systems restored — it's working!", tone: 'gold' },
    { image: 'ironman/status-3.png', state: 'UNKNOWN', text: "It works… and nobody knows how.", tone: 'arc' },
  ],

  footer: {
    motto: 'SUIT UP. SHIP CODE. REPEAT.',
    signoff: 'J.A.R.V.I.S.  ·  END OF TRANSMISSION  ·  THANKS FOR VISITING',
  },

  // Live stats card (built with the GitHub API).
  stats: {
    // 6 readout tiles, pick from: contributions, contributionsYear, commits, prs,
    // issues, stars, repos, followers, languages, years, activeDays
    tiles: ['contributions', 'commits', 'prs', 'repos', 'languages', 'years'],
    topLanguages: 6,
    excludeLanguages: [], // e.g. ['HTML', 'CSS']
    excludeRepos: [], // repo names to ignore for languages/stars
  },
};
