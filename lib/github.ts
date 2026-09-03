/**
 * GitHub Contents API client.
 *
 * The admin UI uses this to add/remove tokens by committing the new
 * `config.json` (root) and `cloud/config.json` to the repo. Vercel
 * auto-redeploys on the commit; the next GitHub Actions cron run picks
 * up the new file.
 *
 * Required env vars (set in Vercel, NOT in GitHub Actions):
 *   - GITHUB_TOKEN  : Personal Access Token with `contents:write`
 *   - GITHUB_REPO_OWNER  : e.g. "aromatiCode"
 *   - GITHUB_REPO_NAME   : e.g. "crypto-ema-web"
 *   - GITHUB_REPO_BRANCH : defaults to "main"
 */

const API = "https://api.github.com";

interface RepoConfig {
  token: string;
  owner: string;
  repo: string;
  branch: string;
}

function getConfig(): RepoConfig | null {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_REPO_OWNER;
  const repo = process.env.GITHUB_REPO_NAME;
  if (!token || !owner || !repo) return null;
  return {
    token,
    owner,
    repo,
    branch: process.env.GITHUB_REPO_BRANCH || "main",
  };
}

interface GetFileResult {
  sha: string;
  content: string; // decoded UTF-8
}

export async function getFile(path: string): Promise<GetFileResult | null> {
  const cfg = getConfig();
  if (!cfg) throw new Error("GitHub env vars not configured.");
  const url = `${API}/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIComponent(
    path
  )}?ref=${encodeURIComponent(cfg.branch)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub GET ${path} failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as { sha: string; content: string; encoding: string };
  if (json.encoding !== "base64") {
    throw new Error(`Unexpected GitHub file encoding: ${json.encoding}`);
  }
  const content = Buffer.from(json.content, "base64").toString("utf-8");
  return { sha: json.sha, content };
}

interface PutFileResult {
  commitSha: string;
  contentUrl: string;
}

export async function putFile(
  path: string,
  content: string,
  message: string,
  expectedSha?: string
): Promise<PutFileResult> {
  const cfg = getConfig();
  if (!cfg) throw new Error("GitHub env vars not configured.");
  const url = `${API}/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIComponent(
    path
  )}`;
  const body: Record<string, unknown> = {
    message,
    content: Buffer.from(content, "utf-8").toString("base64"),
    branch: cfg.branch,
  };
  if (expectedSha) body.sha = expectedSha;

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub PUT ${path} failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as { commit: { sha: string }; content: { html_url: string } };
  return { commitSha: json.commit.sha, contentUrl: json.content.html_url };
}

/**
 * Read both config.json files, return parsed JSON for each (if present).
 */
export async function readConfigFiles(): Promise<{
  root: { sha: string; data: { tokens?: string[] } } | null;
  cloud: { sha: string; data: { tokens?: string[] } } | null;
}> {
  const [root, cloud] = await Promise.all([getFile("config.json"), getFile("cloud/config.json")]);
  return {
    root: root ? { sha: root.sha, data: JSON.parse(root.content) } : null,
    cloud: cloud ? { sha: cloud.sha, data: JSON.parse(cloud.content) } : null,
  };
}

function normalizeToken(t: string): string {
  return t.trim().toUpperCase();
}

/**
 * Add a token to both config files. Throws if already present.
 */
export async function addToken(token: string): Promise<void> {
  const normalized = normalizeToken(token);
  if (!/^[A-Z0-9]{2,20}$/.test(normalized)) {
    throw new Error("Invalid token symbol. Use 2-20 uppercase letters/digits.");
  }

  const { root, cloud } = await readConfigFiles();
  if (!root || !cloud) {
    throw new Error("Could not read one or both config.json files in the repo.");
  }

  const rootTokens = (root.data.tokens ?? []).map(normalizeToken);
  const cloudTokens = (cloud.data.tokens ?? []).map(normalizeToken);

  if (rootTokens.includes(normalized) || cloudTokens.includes(normalized)) {
    throw new Error(`${normalized} is already in the list.`);
  }

  rootTokens.push(normalized);
  cloudTokens.push(normalized);

  const message = `admin: add ${normalized}`;
  await Promise.all([
    putFile("config.json", JSON.stringify(root.data, null, 2) + "\n", message, root.sha),
    putFile("cloud/config.json", JSON.stringify(cloud.data, null, 2) + "\n", message, cloud.sha),
  ]);
}

export async function removeToken(token: string): Promise<void> {
  const normalized = normalizeToken(token);

  const { root, cloud } = await readConfigFiles();
  if (!root || !cloud) {
    throw new Error("Could not read one or both config.json files in the repo.");
  }

  const rootTokens = (root.data.tokens ?? []).map(normalizeToken);
  const cloudTokens = (cloud.data.tokens ?? []).map(normalizeToken);

  if (!rootTokens.includes(normalized) || !cloudTokens.includes(normalized)) {
    throw new Error(`${normalized} is not in the list.`);
  }

  const nextRoot = rootTokens.filter((t) => t !== normalized);
  const nextCloud = cloudTokens.filter((t) => t !== normalized);
  root.data.tokens = nextRoot;
  cloud.data.tokens = nextCloud;

  const message = `admin: remove ${normalized}`;
  await Promise.all([
    putFile("config.json", JSON.stringify(root.data, null, 2) + "\n", message, root.sha),
    putFile("cloud/config.json", JSON.stringify(cloud.data, null, 2) + "\n", message, cloud.sha),
  ]);
}
