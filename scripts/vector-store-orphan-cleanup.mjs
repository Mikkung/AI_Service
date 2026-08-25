import {
  spawnSync,
} from "node:child_process";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import process from "node:process";
import {
  fileURLToPath,
  pathToFileURL,
} from "node:url";
import OpenAI from "openai";

const root = path.resolve(
  path.dirname(
    fileURLToPath(
      import.meta.url,
    ),
  ),
  "..",
);
const tempRoot = path.join(
  root,
  ".tmp",
  "vector-store-orphan-cleanup",
);
const outDir = path.join(
  tempRoot,
  "out",
);
const tsconfigPath = path.join(
  tempRoot,
  "tsconfig.json",
);

function parseArgs(argv) {
  const result = {};

  for (
    let index = 2;
    index < argv.length;
    index += 1
  ) {
    const current = argv[index];

    if (!current.startsWith("--")) {
      continue;
    }

    const key = current.slice(2);
    const next = argv[index + 1];

    if (
      !next ||
      next.startsWith("--")
    ) {
      result[key] = true;
      continue;
    }

    result[key] = next;
    index += 1;
  }

  return result;
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
    process.exit(
      compile.status ?? 1,
    );
  }
}

function installAliasResolver() {
  const originalResolveFilename =
    Module._resolveFilename;

  Module._resolveFilename =
    function resolveFilename(
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

          if (
            fs.existsSync(candidate)
          ) {
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

async function importCompiled(
  ...parts
) {
  return import(
    pathToFileURL(
      path.join(
        outDir,
        ...parts,
      ),
    ).href
  );
}

async function main() {
  const args = parseArgs(
    process.argv,
  );

  compileCore();
  installAliasResolver();

  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY is required. Run with node --env-file=.env.local or configure the environment.",
    );
  }

  const {
    runVectorStoreOrphanCleanup,
  } = await importCompiled(
    "src",
    "core",
    "ai-platform",
    "admin",
    "vector-store-orphan-cleanup.js",
  );
  const {
    FirestoreOpenAIVectorStoreConfigRepository,
  } = await importCompiled(
    "src",
    "core",
    "ai-platform",
    "providers",
    "openai",
    "firestore-openai-vector-store-config-repository.js",
  );
  const {
    FirestoreAIPlatformKnowledgePublicationRepository,
  } = await importCompiled(
    "src",
    "core",
    "ai-platform",
    "repositories",
    "firestore",
    "firestore-ai-platform-knowledge-publication-repository.js",
  );

  const report =
    await runVectorStoreOrphanCleanup(
      {
        vectorStoreConfigRepository:
          new FirestoreOpenAIVectorStoreConfigRepository(),
        publicationRepository:
          new FirestoreAIPlatformKnowledgePublicationRepository(),
        client:
          new OpenAI({
            apiKey:
              process.env.OPENAI_API_KEY,
          }),
      },
      {
        list:
          args.list === true ||
          args.list === "true",
        fileId:
          typeof args["file-id"] ===
          "string"
            ? args["file-id"]
            : undefined,
        execute:
          args.execute === true ||
          args.execute === "true",
      },
    );

  for (const warning of report.warnings) {
    console.warn(warning);
  }

  console.log(
    JSON.stringify(
      report,
      null,
      2,
    ),
  );

  if (report.dryRun) {
    console.log(
      "Dry run only. Re-run with --execute to detach.",
    );
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
