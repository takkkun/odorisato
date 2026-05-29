interface Env {
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_TOKEN: string;
}

const ALLOWED_ORIGINS = new Set([
  'https://preview.odorisato.com',
  'https://odorisato.com',
]);

function corsHeaders(origin: string | null): HeadersInit {
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : '';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Cf-Access-Jwt-Assertion',
    Vary: 'Origin',
  };
}

function jsonResponse(body: unknown, status = 200, origin: string | null = null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin),
    },
  });
}

async function githubFetch(env: Env, path: string, init?: RequestInit): Promise<Response> {
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}${path}`;
  return fetch(url, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'User-Agent': 'odorisato-promote-worker',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.headers ?? {}),
    },
  });
}

async function handlePromote(env: Env, origin: string | null): Promise<Response> {
  const res = await githubFetch(env, '/dispatches', {
    method: 'POST',
    body: JSON.stringify({ event_type: 'promote' }),
  });
  if (!res.ok) {
    const text = await res.text();
    return jsonResponse({ error: 'GitHub dispatch failed', detail: text }, 502, origin);
  }
  return jsonResponse({ ok: true }, 202, origin);
}

async function handleStatus(env: Env, origin: string | null): Promise<Response> {
  // Return the most recent run for each of the two workflows so the UI
  // can show whether a build/promote is in progress.
  const [previewRes, promoteRes] = await Promise.all([
    githubFetch(env, '/actions/workflows/build-preview.yml/runs?per_page=1'),
    githubFetch(env, '/actions/workflows/promote.yml/runs?per_page=1'),
  ]);
  if (!previewRes.ok || !promoteRes.ok) {
    return jsonResponse({ error: 'Failed to fetch run status' }, 502, origin);
  }
  const preview = (await previewRes.json()) as { workflow_runs?: WorkflowRun[] };
  const promote = (await promoteRes.json()) as { workflow_runs?: WorkflowRun[] };
  return jsonResponse(
    {
      preview: summarizeRun(preview.workflow_runs?.[0]),
      promote: summarizeRun(promote.workflow_runs?.[0]),
    },
    200,
    origin
  );
}

interface WorkflowRun {
  status: string;
  conclusion: string | null;
  updated_at: string;
  html_url: string;
}

function summarizeRun(run: WorkflowRun | undefined): WorkflowRun | null {
  if (!run) return null;
  return {
    status: run.status,
    conclusion: run.conclusion,
    updated_at: run.updated_at,
    html_url: run.html_url,
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname === '/promote' && request.method === 'POST') {
      return handlePromote(env, origin);
    }
    if (url.pathname === '/status' && request.method === 'GET') {
      return handleStatus(env, origin);
    }

    return jsonResponse({ error: 'Not Found' }, 404, origin);
  },
};
