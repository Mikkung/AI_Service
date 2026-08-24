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
  "knowledge-unpublish",
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

function requireArg(value, name) {
  if (!value || value === true) {
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
  const documentId = requireArg(
    args["document-id"],
    "document-id",
  );

  compileCore();
  installAliasResolver();

  const {
    unpublishKnowledgePublication,
  } = await importCompiled(
      "src",
      "core",
      "ai-platform",
      "admin",
      "knowledge-unpublish.js",
  );
  const {
    FirestoreAIPlatformKnowledgeRepository,
  } = await importCompiled(
      "src",
      "core",
      "ai-platform",
      "repositories",
      "firestore",
      "firestore-ai-platform-knowledge-repository.js",
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
    OpenAIKnowledgePublisher,
  } = await importCompiled(
      "src",
      "core",
      "ai-platform",
      "providers",
      "openai",
      "openai-knowledge-publisher.js",
  );

  const publicationRepository =
    new FirestoreAIPlatformKnowledgePublicationRepository();
  const publisher =
    new OpenAIKnowledgePublisher({
      publicationRepository,
      vectorStoreConfigRepository:
        new FirestoreOpenAIVectorStoreConfigRepository(),
      targetAudience: "public",
    });

  const report =
    await unpublishKnowledgePublication(
      {
        knowledgeRepository:
          new FirestoreAIPlatformKnowledgeRepository(),
        publicationRepository,
        publisher,
      },
      {
        documentId,
        execute:
          args.execute === true ||
          args.execute === "true",
        targetProvider:
          typeof args[
            "target-provider"
          ] === "string"
            ? args[
                "target-provider"
              ]
            : undefined,
        targetEnvironment:
          typeof args[
            "target-environment"
          ] === "string"
            ? args[
                "target-environment"
              ]
            : undefined,
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
      "Dry run only. Re-run with --execute to unpublish.",
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
