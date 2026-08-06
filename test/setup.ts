// colour detection reads process.env, so on a CI runner (CI + GITHUB_ACTIONS set)
// a non TTY stream correctly resolves to level 1 instead of 0 & the assertions
// that assume a bare shell blow up. strip the ambient vars so every run sees the
// same empty environment, tests that care about CI behaviour pass env in directly.
const AMBIENT = [
  "CI",
  "GITHUB_ACTIONS",
  "GITEA_ACTIONS",
  "GITLAB_CI",
  "CIRCLECI",
  "TRAVIS",
  "APPVEYOR",
  "BUILDKITE",
  "DRONE",
  "TEAMCITY_VERSION",
  "FORCE_COLOR",
  "NO_COLOR",
  "TERM",
  "COLORTERM",
];

// Reflect.deleteProperty over `delete env[key]` to satisfy no-dynamic-delete, &
// over `= undefined` because node coerces that to the literal string "undefined"
// (which would leave CI looking set & make this whole file a no op)
for (const key of AMBIENT) Reflect.deleteProperty(process.env, key);
