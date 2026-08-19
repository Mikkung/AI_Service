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
  "knowledge-publish-queue",
);
const outDir = path.join(tempRoot, "out");
const tsconfigPath = path.join(
  tempRoot,
  "tsconfig.json",
);

function parseArgs(argv) {
  const result = {};

  for (let index = 2; index < argv.length; index += 1) {
    const current = argv[index];

    if (!current.startsWith("--")) {
      continue;
    }

    const key = current.slice(2);
    const next = argv[index + 1];

    if (!next || next.startsWith("--")) {
      result[key] = "true";
      continue;
    }

    result[key] = next;
    index += 1;
  }

  return result;
}

function requireArg(value, name) {
  if (!value) {
    throw new Error(
      `Missing required argument: --${name}`,
    );
  }

  return value;
}

function compileCore() {
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
    process.exit(compile.status ?? 1);
  }
}

function installAliasResolver() {
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
        const candidate = `${target}${extension}`;

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
}

async function main() {
  const args = parseArgs(process.argv);
  const queuePath = path.resolve(
    requireArg(args.queue, "queue"),
  );

  compileCore();
  installAliasResolver();

  const {
    OneDriveQueueAdapter,
  } = require(
    path.join(
      outDir,
      "src",
      "core",
      "ai-platform",
      "integrations",
      "sharepoint",
      "onedrive-queue-adapter.js",
    ),
  );
  const {
    createDefaultPublishApprovedKnowledgeUseCase,
  } = require(
    path.join(
      outDir,
      "src",
      "core",
      "ai-platform",
      "integrations",
      "sharepoint",
      "default-publish-approved-knowledge.js",
    ),
  );

  const adapter =
    new OneDriveQueueAdapter(
      createDefaultPublishApprovedKnowledgeUseCase(),
    );
  const results =
    await adapter.processQueue(queuePath);

  for (const result of results) {
    const label = result.ok
      ? result.result?.outcome ?? "ok"
      : `failed: ${result.error}`;

    console.log(
      `${path.basename(result.manifestPath)} => ${label}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        ok: results.every(
          (result) => result.ok,
        ),
        queuePath,
        processed: results.length,
        results,
      },
      null,
      2,
    ),
  );

  if (
    results.some(
      (result) => !result.ok,
    )
  ) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : error,
  );
  process.exitCode = 1;
});
