const {
  spawnSync,
} = require("node:child_process");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const tempRoot = path.join(
  root,
  ".tmp",
  "ai-platform-unit-tests",
);
const outDir = path.join(tempRoot, "out");
const tsconfigPath = path.join(
  tempRoot,
  "tsconfig.json",
);

fs.rmSync(tempRoot, {
  recursive: true,
  force: true,
});
fs.mkdirSync(tempRoot, {
  recursive: true,
});

fs.writeFileSync(
  tsconfigPath,
  JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        lib: [
          "ES2022",
          "DOM",
        ],
        module: "CommonJS",
        rootDir: root,
        outDir,
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        types: [
          "node",
        ],
        paths: {
          "@/*": [
            "../../src/*",
          ],
        },
      },
      include: [
        "../../src/core/ai-platform/**/*.ts",
      ],
      exclude: [
        "node_modules",
      ],
    },
    null,
    2,
  ),
  "utf8",
);

const tscExecutable = path.join(
  root,
  "node_modules",
  "typescript",
  "bin",
  "tsc",
);

const compile = spawnSync(
  process.execPath,
  [
    tscExecutable,
    "-p",
    tsconfigPath,
  ],
  {
    cwd: root,
    stdio: "inherit",
  },
);

if (compile.status !== 0) {
  process.exit(
    compile.status ?? 1,
  );
}

const originalResolveFilename =
  Module._resolveFilename;

Module._resolveFilename = function resolveFilename(
  request,
  parent,
  isMain,
  options,
) {
  if (request.startsWith("@/")) {
    const target = path.join(
      outDir,
      "src",
      request.slice(2),
    );

    for (const extension of [
      ".js",
      ".json",
    ]) {
      const candidate =
        `${target}${extension}`;

      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return originalResolveFilename.call(
    this,
    request,
    parent,
    isMain,
    options,
  );
};

require(
  path.join(
    outDir,
    "src",
    "core",
    "ai-platform",
    "__tests__",
    "ai-platform.test.js",
  ),
);
