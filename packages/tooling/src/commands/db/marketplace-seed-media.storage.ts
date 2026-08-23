import { createHash, createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  inspectMarketplaceMedia,
  marketplaceMediaChecksum,
  type MarketplaceMediaType,
} from "../../../../../libs/backend/feature/agritech/shared/lib/src/marketplace-media.ts";
import { demoMarketplaceMediaAssets, type DemoMediaAssetFixture } from "./marketplace-seed-media.ts";

/**
 * Putting the demo photographs into object storage, and deciding honestly
 * whether they got there.
 *
 * The seed must succeed on a deployment that has no bucket at all — that is the
 * normal state of a fresh clone — and it must not leave a listing pointing at an
 * object nobody can serve. So this module answers one question: are these
 * photographs stored right now? Everything downstream keys off that answer. When
 * it is yes, listings carry `/marketplace/media/<id>` and reviews carry
 * `public-asset:<id>`. When it is no, listings fall back to the checked-in
 * library path and reviews carry no photograph, and the seed says so on stdout
 * rather than writing a reference that renders as a broken frame.
 *
 * "Configured" is not the same as "reachable", which is why the bucket is
 * written to rather than merely inspected. A deployment can carry `S3_BUCKET`
 * and still have no server behind it — a stopped MinIO container is the common
 * case locally — and a fixture that trusted configuration would seed exactly the
 * broken references this is here to prevent.
 *
 * S3 is addressed directly with a signed request instead of through
 * `@app/backend-common-s3`, because that library is a Nest provider tree
 * (`@Injectable`, Joi-validated config, an injected client) and the seed is a
 * plain script with no container. The bytes, the key, the media type, the
 * checksum and the reference shapes all come from
 * `libs/backend/feature/agritech/shared/lib/src/marketplace-media.ts`, which is
 * the module the upload endpoint itself uses, so nothing about what is stored is
 * reinvented here — only the transport.
 */

export interface DemoMediaObject extends DemoMediaAssetFixture {
  mediaType: MarketplaceMediaType;
  byteSize: number;
  checksumSha256: string;
}

export interface DemoMediaPlan {
  /**
   * Whether the photographs are in the bucket. `false` means the seed writes no
   * `marketplace_media_assets` row and every listing and review falls back.
   */
  stored: boolean;
  /** Why storage was not used, for the command's own output. */
  reason?: string;
  objects: readonly DemoMediaObject[];
}

interface S3Target {
  bucket: string;
  region: string;
  endpoint?: string;
  forcePathStyle: boolean;
  accessKey?: string;
  secretKey?: string;
}

const emptyPlan = (reason: string): DemoMediaPlan => ({ objects: [], reason, stored: false });

function readS3Target(env: NodeJS.ProcessEnv): S3Target | undefined {
  const bucket = env.S3_BUCKET?.trim();
  if (!bucket) {
    return undefined;
  }
  const endpoint = env.S3_ENDPOINT?.trim();
  return {
    accessKey: env.S3_ACCESS_KEY?.trim() || undefined,
    bucket,
    forcePathStyle: (env.S3_FORCE_PATH_STYLE ?? "").trim().toLowerCase() === "true" || Boolean(endpoint),
    region: env.S3_REGION?.trim() || "us-east-1",
    secretKey: env.S3_SECRET_KEY?.trim() || undefined,
    ...(endpoint ? { endpoint } : {}),
  };
}

/**
 * The bytes and metadata of one seeded photograph.
 *
 * The file is inspected with the same `inspectMarketplaceMedia` the upload route
 * uses, so a library file this build cannot parse is refused here rather than
 * stored and served as an image later, and the stored bytes are the sanitized
 * ones — a photograph the seed puts in the bucket is byte-identical to one a
 * seller would have uploaded.
 */
async function readObject(
  workspaceRoot: string,
  asset: DemoMediaAssetFixture,
): Promise<{ object: DemoMediaObject; content: Uint8Array }> {
  const content = new Uint8Array(await readFile(resolve(workspaceRoot, asset.sourceFile)));
  const inspection = inspectMarketplaceMedia(content);
  if (inspection.status === "rejected") {
    throw new Error(`Demo photograph ${asset.sourceFile} was refused as ${inspection.reason}.`);
  }
  return {
    content: inspection.value.content,
    object: {
      ...asset,
      byteSize: inspection.value.content.byteLength,
      checksumSha256: marketplaceMediaChecksum(inspection.value.content),
      mediaType: inspection.value.mediaType,
    },
  };
}

function objectUrl(target: S3Target, key: string): URL {
  if (target.endpoint) {
    const base = new URL(target.endpoint);
    const prefix = target.forcePathStyle ? `${target.bucket}/` : "";
    return new URL(`${base.pathname.replace(/\/$/u, "")}/${prefix}${key}`, base);
  }
  return target.forcePathStyle
    ? new URL(`https://s3.${target.region}.amazonaws.com/${target.bucket}/${key}`)
    : new URL(`https://${target.bucket}.s3.${target.region}.amazonaws.com/${key}`);
}

const encodeSegment = (value: string): string =>
  encodeURIComponent(value).replaceAll(/[!'()*]/gu, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);

/** S3 canonical URI: each path segment percent-encoded, the separators left alone. */
const canonicalUri = (pathname: string): string => pathname.split("/").map(encodeSegment).join("/");

const sha256Hex = (value: Uint8Array | string): string => createHash("sha256").update(value).digest("hex");

const hmac = (key: Buffer | string, value: string): Buffer => createHmac("sha256", key).update(value).digest();

/**
 * AWS Signature Version 4 for one `PUT`.
 *
 * Written out rather than pulled from a client library so this command carries no
 * dependency the rest of the tooling package does not already have. It is the
 * minimum the specification requires for a single request with a known body:
 * the payload hash is a real digest (never `UNSIGNED-PAYLOAD`), so the server
 * verifies the bytes it received are the bytes that were signed.
 */
function signedHeaders(
  target: S3Target,
  url: URL,
  body: Uint8Array,
  contentType: string,
  now: Date,
): Record<string, string> {
  const payloadHash = sha256Hex(body);
  const amzDate = `${now.toISOString().replaceAll(/[:-]|\.\d{3}/gu, "")}`;
  const headers: Record<string, string> = {
    "content-length": String(body.byteLength),
    "content-type": contentType,
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (!target.accessKey || !target.secretKey) {
    return headers;
  }
  const scopeDate = amzDate.slice(0, 8);
  const scope = `${scopeDate}/${target.region}/s3/aws4_request`;
  // `content-length` is deliberately outside the signed set: Node rewrites it on
  // the wire for a typed-array body, and a signed value the transport may change
  // is a signature the server cannot reproduce.
  const signedNames = ["content-type", "host", "x-amz-content-sha256", "x-amz-date"];
  const canonicalHeaders = signedNames.map((name) => `${name}:${headers[name]}\n`).join("");
  const canonicalRequest = [
    "PUT",
    canonicalUri(url.pathname),
    "",
    canonicalHeaders,
    signedNames.join(";"),
    payloadHash,
  ].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${target.secretKey}`, scopeDate), target.region), "s3"), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  headers.authorization =
    `AWS4-HMAC-SHA256 Credential=${target.accessKey}/${scope}, ` +
    `SignedHeaders=${signedNames.join(";")}, Signature=${signature}`;
  return headers;
}

async function putObject(target: S3Target, object: DemoMediaObject, body: Uint8Array): Promise<void> {
  const url = objectUrl(target, object.storageKey);
  const response = await fetch(url, {
    // A copy, because `fetch` types its body as `BodyInit` and a `Uint8Array`
    // over a shared buffer is not one; the bytes are identical either way.
    body: Buffer.from(body),
    headers: signedHeaders(target, url, body, object.mediaType, new Date()),
    method: "PUT",
  });
  if (!response.ok) {
    // The response body can name the bucket and the key, which is exactly what
    // must not reach a log, so only the status travels.
    throw new Error(`Object storage refused a demo photograph with HTTP ${response.status}.`);
  }
}

/**
 * Store every demo photograph, or decide that none of them are stored.
 *
 * There is no partial outcome on purpose. A run that put four of eleven objects
 * in the bucket would leave four listings resolving and seven broken, and a
 * reviewer would read that as a bug in the upload path rather than as a
 * half-configured deployment. So the first failure abandons storage for the whole
 * seed and every listing falls back together.
 *
 * `PUT` is idempotent on the same key, and both the key and the bytes are derived
 * from the fixture, so re-running this overwrites each object with itself.
 */
/**
 * Where the checked-in photographs are, resolved from this module's own location.
 *
 * `fileURLToPath` rather than `new URL(...).pathname`: a repository checked out
 * under a non-ASCII path — this one is — comes back percent-encoded from
 * `pathname`, and every read then fails on a directory that does not exist.
 * `process.cwd()` is no help either, because `pnpm --filter` runs the command
 * from the package directory rather than the repository root.
 */
export const seedWorkspaceRoot = (): string => fileURLToPath(new URL("../../../../../", import.meta.url));

export async function prepareDemoMarketplaceMedia(
  workspaceRoot: string = seedWorkspaceRoot(),
  env: NodeJS.ProcessEnv = process.env,
): Promise<DemoMediaPlan> {
  const target = readS3Target(env);
  if (!target) {
    return emptyPlan("S3_BUCKET is not configured, so no photograph was uploaded.");
  }
  try {
    const objects = await Promise.all(
      demoMarketplaceMediaAssets.map(async (asset) => {
        const { content, object } = await readObject(workspaceRoot, asset);
        await putObject(target, object, content);
        return object;
      }),
    );
    return { objects, stored: true };
  } catch (error) {
    return emptyPlan(
      `Object storage was configured but not reachable, so no photograph was uploaded: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * The reference each fixture key resolves to, or nothing when the photographs are
 * not stored.
 *
 * Handing callers a resolver rather than a map keeps the fallback decision in one
 * place: a listing asks for a path, a review asks for a handle, and both get
 * `undefined` on a deployment without storage instead of having to know why.
 */
export interface DemoMediaResolver {
  stored: boolean;
  pathFor(key: string): string | undefined;
  referenceFor(key: string): string | undefined;
  objects: readonly DemoMediaObject[];
}

export function demoMediaResolver(plan: DemoMediaPlan): DemoMediaResolver {
  const byKey = new Map(plan.objects.map((object) => [object.key, object] as const));
  return {
    objects: plan.objects,
    pathFor: (key) => byKey.get(key)?.path,
    referenceFor: (key) => byKey.get(key)?.reference,
    stored: plan.stored,
  };
}
