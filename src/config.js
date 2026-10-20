// Where the leaderboard server lives. Hosting your own (see server/README.md)?
// Change this, and the matching address in manifest.json "host_permissions".
// For local testing use http://localhost:8787 (and add it to host_permissions).
(function (root) {
  root.MKN = root.MKN || {};
  root.MKN.BOARD_URL = 'https://magtira-leaderboard.magtira-leaderboard.workers.dev';
})(globalThis);
