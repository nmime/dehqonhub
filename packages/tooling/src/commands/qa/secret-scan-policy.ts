const generatedToastVariantPattern =
  /^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)_(?:[1-5]\d{2}|ERR|NET)(?:_[a-z][a-z0-9]*(?:-[a-z0-9]+)*)?$/u;
const nestOperationIdPattern = /^[A-Z][A-Za-z0-9]+Controller_[a-z][A-Za-z0-9]+$/u;
const migrationIdentifierPattern = /^Migration\d{14}[A-Z][A-Za-z0-9]+$/u;

function isGeneratedApiContractPath(relativePath: string) {
  return (
    (/^apps\/backend\/[^/]+\/[^/]+\/contracts\/openapi\/[^/]+\.json$/u.test(relativePath) ||
      /^libs\/common\/api-contracts\/lib\/src\/generated\/[^/]+\.ts$/u.test(relativePath) ||
      /^libs\/frontend\/api-client\/lib\/src\/generated\/[^/]+\.ts$/u.test(relativePath)) &&
    !relativePath.includes("../")
  );
}

function isGeneratedToastRulePath(relativePath: string) {
  return (
    (/^apps\/backend\/[^/]+\/[^/]+\/contracts\/toast\/[^/]+\.toast-rules\.generated\.json$/u.test(relativePath) ||
      /^libs\/frontend\/api-client\/lib\/src\/generated\/toast\/[^/]+\.toast-rules\.frontend\.generated\.json$/u.test(
        relativePath,
      )) &&
    !relativePath.includes("../")
  );
}

export function secretValueEntropy(value: string) {
  const counts = new Map<string, number>();
  for (const char of value) counts.set(char, (counts.get(char) ?? 0) + 1);
  return [...counts.values()].reduce((sum, count) => {
    const probability = count / value.length;
    return sum - probability * Math.log2(probability);
  }, 0);
}

export function isAllowedSecretScanValue(value: string, relativePath = "") {
  if (value.includes("${")) return true;
  if (/example|sample|fixture|test|dummy|changeme|placeholder|process\.env/i.test(value)) return true;
  if (relativePath.endsWith("env-loader.ts") && /postgres/i.test(value)) return true;
  if (relativePath === "scripts/validate-deployment-config.mjs" && value.startsWith("SITE_DIST_ROOT=/workspace/")) return true;
  if (isGeneratedToastRulePath(relativePath) && generatedToastVariantPattern.test(value)) return true;
  if ((isGeneratedApiContractPath(relativePath) || isGeneratedToastRulePath(relativePath)) && nestOperationIdPattern.test(value))
    return true;
  if (
    relativePath.endsWith(".component-spec.ts") &&
    relativePath.includes("/migrations/") === false &&
    migrationIdentifierPattern.test(value)
  )
    return true;
  return false;
}

export function isSecretScanIgnoredPath(relativePath: string) {
  return relativePath === ".claude/worktrees" || relativePath.startsWith(".claude/worktrees/");
}
