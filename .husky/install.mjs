const isCi = Boolean(process.env.CI && !["0", "false"].includes(process.env.CI));

if (
  process.env.NODE_ENV === "production" ||
  process.env.npm_config_production === "true" ||
  process.env.HUSKY === "0" ||
  process.env.VERCEL === "1" ||
  isCi
) {
  process.exit(0);
}

const husky = (await import("husky")).default;

console.log(husky());
