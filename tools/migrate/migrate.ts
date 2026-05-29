/* eslint-disable no-console */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, createManagementClient } from 'microcms-js-sdk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '../..');
const SOURCE_REPO = join(PROJECT_ROOT, '../supernormal');
const DUMP_PATH = join(SOURCE_REPO, 'db/dump.sql');
const THUMBNAILS_DIR = join(SOURCE_REPO, 'data/thumbnails');
const IMAGES_DIR = join(SOURCE_REPO, 'data/images');
const STATE_PATH = join(__dirname, 'state.json');
const LOG_PATH = join(__dirname, 'migrate.log');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const LIMIT = (() => {
  const i = args.findIndex((a) => a === '--limit');
  return i >= 0 ? Number(args[i + 1]) : Infinity;
})();

const apiKey = process.env.MICROCMS_API_KEY;
const serviceDomain = process.env.MICROCMS_SERVICE_DOMAIN;
if (!DRY_RUN && (!apiKey || !serviceDomain)) {
  console.error('Missing MICROCMS_API_KEY or MICROCMS_SERVICE_DOMAIN. Pass them via `node --env-file=.env`.');
  process.exit(1);
}

const contentClient = !DRY_RUN
  ? createClient({ serviceDomain: serviceDomain!, apiKey: apiKey! })
  : null;
const mgmtClient = !DRY_RUN
  ? createManagementClient({ serviceDomain: serviceDomain!, apiKey: apiKey! })
  : null;

type DBCategory = { id: number; name: string };
type DBPost = {
  id: number;
  thumbnail_file_name: string;
  thumbnail_content_type: string;
  category_id: number;
  caption: string;
  public: boolean;
  created_at: string;
  updated_at: string;
};
type DBImage = {
  id: number;
  post_id: number;
  original_file_name: string;
  original_content_type: string;
  width: number;
  height: number;
  order: number;
};

type State = {
  /** db category id -> microCMS contentId */
  categoryIdMap: Record<string, string>;
  /** db post id -> { thumbUrl, imageUrls } - lets us resume mid-post */
  uploadedMedia: Record<string, { thumbUrl: string; imageUrls: string[] }>;
  /** db post ids that finished both upload + content create */
  processedPostIds: number[];
};

function loadState(): State {
  if (!existsSync(STATE_PATH)) {
    return { categoryIdMap: {}, uploadedMedia: {}, processedPostIds: [] };
  }
  return JSON.parse(readFileSync(STATE_PATH, 'utf-8')) as State;
}

function saveState(s: State): void {
  writeFileSync(STATE_PATH, JSON.stringify(s, null, 2));
}

function log(msg: string): void {
  console.log(msg);
  writeFileSync(LOG_PATH, `[${new Date().toISOString()}] ${msg}\n`, { flag: 'a' });
}

function idPartition(id: number): string {
  const padded = String(id).padStart(9, '0');
  return `${padded.slice(0, 3)}/${padded.slice(3, 6)}/${padded.slice(6, 9)}`;
}

function findFile(baseDir: string, id: number): string | null {
  const partition = idPartition(id);
  const dir = join(baseDir, dirname(partition));
  const basename = partition.split('/').pop()!;
  if (!existsSync(dir)) return null;
  const matches = readdirSync(dir).filter((f) => f.startsWith(`${basename}.`));
  return matches.length > 0 ? join(dir, matches[0]) : null;
}

// --- SQL dump parser (handles single-row INSERTs with --complete-insert format) ---

function parseValues(valuesStr: string): unknown[] {
  const out: unknown[] = [];
  let cur = '';
  let inQuote = false;
  let escaped = false;
  for (let i = 0; i < valuesStr.length; i++) {
    const c = valuesStr[i]!;
    if (escaped) {
      cur += c;
      escaped = false;
      continue;
    }
    if (c === '\\' && inQuote) {
      cur += c;
      escaped = true;
      continue;
    }
    if (inQuote) {
      if (c === "'") {
        inQuote = false;
      }
      cur += c;
      continue;
    }
    if (c === "'") {
      inQuote = true;
      cur += c;
      continue;
    }
    if (c === ',') {
      out.push(parseValue(cur.trim()));
      cur = '';
      continue;
    }
    cur += c;
  }
  if (cur.trim().length > 0) out.push(parseValue(cur.trim()));
  return out;
}

function parseValue(raw: string): unknown {
  if (raw === 'NULL') return null;
  if (raw.startsWith("'") && raw.endsWith("'")) {
    return raw
      .slice(1, -1)
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\0/g, '\0');
  }
  const n = Number(raw);
  if (!Number.isNaN(n)) return n;
  return raw;
}

function parseInserts(sql: string, table: string): Array<Record<string, unknown>> {
  const pattern = new RegExp(
    `INSERT INTO \`${table}\` \\(([^)]+)\\) VALUES \\((.+)\\);\\s*$`,
    'gm'
  );
  const rows: Array<Record<string, unknown>> = [];
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(sql)) !== null) {
    const cols = m[1]!.split(',').map((c) => c.trim().replace(/`/g, ''));
    const values = parseValues(m[2]!);
    if (cols.length !== values.length) {
      console.warn(`Column/value count mismatch in ${table}: ${cols.length} vs ${values.length}`);
      continue;
    }
    const row: Record<string, unknown> = {};
    cols.forEach((col, i) => {
      row[col] = values[i];
    });
    rows.push(row);
  }
  return rows;
}

function parseDump(sql: string): { categories: DBCategory[]; posts: DBPost[]; images: DBImage[] } {
  const categories = parseInserts(sql, 'categories').map((r) => ({
    id: Number(r.id),
    name: String(r.name),
  }));
  const posts = parseInserts(sql, 'posts').map((r) => ({
    id: Number(r.id),
    thumbnail_file_name: String(r.thumbnail_file_name ?? ''),
    thumbnail_content_type: String(r.thumbnail_content_type ?? 'image/jpeg'),
    category_id: Number(r.category_id),
    caption: r.caption == null ? '' : String(r.caption),
    public: Number(r.public) === 1,
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  }));
  const images = parseInserts(sql, 'images').map((r) => ({
    id: Number(r.id),
    post_id: Number(r.post_id),
    original_file_name: String(r.original_file_name ?? ''),
    original_content_type: String(r.original_content_type ?? 'image/jpeg'),
    width: Number(r.width),
    height: Number(r.height),
    order: Number(r.order),
  }));
  return { categories, posts, images };
}

// --- helpers ---

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetry<T>(fn: () => Promise<T>, label: string, maxAttempts = 7): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const is429 = msg.includes('429') || msg.toLowerCase().includes('too many requests');
      attempt++;
      if (!is429 || attempt >= maxAttempts) throw err;
      const delay = Math.min(60_000, 2_000 * Math.pow(2, attempt - 1));
      log(`  ${label}: 429, backoff ${delay}ms (attempt ${attempt}/${maxAttempts})`);
      await sleep(delay);
    }
  }
}

async function uploadFile(filePath: string, fileName: string, mime: string): Promise<string> {
  if (DRY_RUN) return `dry://${filePath.split('/').pop()}`;
  const buf = readFileSync(filePath);
  return withRetry(async () => {
    const blob = new Blob([new Uint8Array(buf)], { type: mime });
    const res = await mgmtClient!.uploadMedia({
      data: blob,
      name: fileName,
      type: mime,
    });
    return res.url;
  }, `upload ${fileName}`);
}

// --- main ---

async function main(): Promise<void> {
  log(`Migration started`);

  if (!existsSync(DUMP_PATH)) {
    console.error(`Dump not found: ${DUMP_PATH}`);
    process.exit(1);
  }
  const dump = readFileSync(DUMP_PATH, 'utf-8');
  const { categories, posts, images } = parseDump(dump);
  log(`Parsed: ${categories.length} categories, ${posts.length} posts, ${images.length} images`);

  const state = loadState();

  // 1. Categories
  for (const cat of categories) {
    if (state.categoryIdMap[String(cat.id)]) {
      log(`Category ${cat.name} already done (cmsId=${state.categoryIdMap[String(cat.id)]})`);
      continue;
    }
    log(`Creating category: ${cat.name}`);
    if (DRY_RUN) {
      state.categoryIdMap[String(cat.id)] = cat.name;
    } else {
      const res = await contentClient!.create({
        endpoint: 'categories',
        contentId: cat.name,
        content: { name: cat.name },
      });
      state.categoryIdMap[String(cat.id)] = res.id;
    }
    saveState(state);
    if (!DRY_RUN) await sleep(300);
  }

  // Group images by post_id, sort by order
  const imagesByPost = new Map<number, DBImage[]>();
  for (const img of images) {
    if (!imagesByPost.has(img.post_id)) imagesByPost.set(img.post_id, []);
    imagesByPost.get(img.post_id)!.push(img);
  }
  for (const list of imagesByPost.values()) list.sort((a, b) => a.order - b.order);

  // 2. Posts (public only, sort by created_at)
  const publicPosts = posts
    .filter((p) => p.public)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  log(`Processing ${publicPosts.length} public posts`);

  let count = 0;
  let success = 0;
  let failure = 0;
  for (const post of publicPosts) {
    if (count >= LIMIT) break;
    count++;
    const tag = `[${count}/${Math.min(publicPosts.length, LIMIT)}] post#${post.id}`;

    if (state.processedPostIds.includes(post.id)) {
      log(`${tag} SKIP (already processed)`);
      continue;
    }

    const postImages = imagesByPost.get(post.id) ?? [];
    if (postImages.length === 0) {
      log(`${tag} WARN no images, skipping`);
      continue;
    }

    try {
      let { thumbUrl, imageUrls } = state.uploadedMedia[String(post.id)] ?? {
        thumbUrl: '',
        imageUrls: [],
      };

      // Thumbnail upload (only if not already uploaded)
      if (!thumbUrl) {
        const thumbPath = findFile(THUMBNAILS_DIR, post.id);
        if (!thumbPath) {
          log(`${tag} ERROR thumbnail file not found for id_partition ${idPartition(post.id)}`);
          failure++;
          continue;
        }
        log(`${tag} uploading thumbnail (${thumbPath.split('/').pop()})`);
        thumbUrl = await uploadFile(thumbPath, post.thumbnail_file_name, post.thumbnail_content_type);
        state.uploadedMedia[String(post.id)] = { thumbUrl, imageUrls };
        saveState(state);
      }

      // Image uploads (continue from where left off)
      for (let i = imageUrls.length; i < postImages.length; i++) {
        const img = postImages[i]!;
        const imgPath = findFile(IMAGES_DIR, img.id);
        if (!imgPath) {
          throw new Error(`Image file not found for image id_partition ${idPartition(img.id)} (post #${post.id})`);
        }
        log(`${tag} uploading image ${i + 1}/${postImages.length} (${imgPath.split('/').pop()})`);
        const url = await uploadFile(imgPath, img.original_file_name, img.original_content_type);
        imageUrls.push(url);
        state.uploadedMedia[String(post.id)] = { thumbUrl, imageUrls };
        saveState(state);
        await sleep(200);
      }

      // Create post content
      const categoryCmsId = state.categoryIdMap[String(post.category_id)];
      if (!categoryCmsId) {
        throw new Error(`Category cms id missing for db id ${post.category_id}`);
      }

      log(`${tag} creating post content (caption="${post.caption.slice(0, 30)}", category=${categoryCmsId}, images=${imageUrls.length})`);
      if (!DRY_RUN) {
        await withRetry(
          () =>
            contentClient!.create({
              endpoint: 'posts',
              contentId: String(post.id),
              content: {
                caption: post.caption,
                category: categoryCmsId,
                thumbnail: thumbUrl,
                images: imageUrls,
              },
            }),
          `create post#${post.id}`
        );
      }

      state.processedPostIds.push(post.id);
      delete state.uploadedMedia[String(post.id)];
      saveState(state);
      success++;
      await sleep(500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`${tag} ERROR ${msg}`);
      failure++;
      // continue with next post; state already saved for partial progress
      await sleep(1000);
    }
  }

  log(`Done. success=${success}, failure=${failure}, skipped=${publicPosts.length - count}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
