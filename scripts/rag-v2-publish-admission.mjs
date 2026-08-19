import {
  readFile,
} from "node:fs/promises";
import path from "node:path";

import mammoth from "mammoth";

const DEFAULT_BASE_URL =
  "http://localhost:3000";

function parseArgs(argv) {
  const result = {};

  for (let index = 2; index < argv.length; index += 1) {
    const current =
      argv[index];

    if (!current.startsWith("--")) {
      continue;
    }

    const key =
      current.slice(2);
    const next =
      argv[index + 1];

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

async function readDocumentText(filePath) {
  const extension =
    path.extname(filePath).toLowerCase();

  if (extension === ".docx") {
    const result =
      await mammoth.extractRawText({
        path: filePath,
      });

    return result.value.trim();
  }

  return (
    await readFile(
      filePath,
      "utf8",
    )
  ).trim();
}

async function main() {
  const args =
    parseArgs(process.argv);

  if (
    args["confirm-approve"] !==
    "true"
  ) {
    throw new Error(
      "Explicit approval is required. Re-run with --confirm-approve to create, approve, and publish the public document.",
    );
  }

  const filePath =
    requireArg(args.file, "file");
  const apiKey =
    requireArg(
      args["api-key"] ??
        process.env.APP_API_KEY,
      "api-key",
    );
  const baseUrl =
    args["base-url"] ??
    DEFAULT_BASE_URL;
  const content =
    await readDocumentText(filePath);

  const response =
    await fetch(
      `${baseUrl.replace(/\/$/, "")}/api/admin/experiments/rag-v2/publish`,
      {
        method: "POST",
        headers: {
          "content-type":
            "application/json",
          "x-api-key":
            apiKey,
        },
        body: JSON.stringify({
          title:
            args.title ??
            "ISE Admission AY2027 Public Criteria",
          sourceReference:
            args["source-reference"] ??
            path.basename(filePath),
          category:
            args.category ??
            "admission",
          owner:
            args.owner,
          version:
            args.version ??
            "AY2027",
          effectiveFrom:
            args["effective-from"],
          effectiveTo:
            args["effective-to"],
          contentType:
            path.extname(filePath)
              .toLowerCase() ===
            ".docx"
              ? "text/plain"
              : args["content-type"] ??
                "text/plain",
          filename:
            path.basename(filePath)
              .replace(
                /\.docx$/i,
                ".txt",
              ),
          actorId:
            args.actor ??
            "rag-v2-publish-script",
          approve: true,
          content,
        }),
      },
    );

  const body =
    await response.json();

  if (
    !response.ok ||
    body.ok !== true
  ) {
    throw new Error(
      body.error ??
        `Publication failed with HTTP ${response.status}`,
    );
  }

  console.log(
    JSON.stringify(
      body,
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : error,
  );
  process.exitCode = 1;
});
