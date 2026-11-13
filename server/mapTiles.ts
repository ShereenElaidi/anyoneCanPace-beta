/**
 * Map tiles for one route's area at a time (design/backend-v1-spec.md §4a).
 * The whole Montréal–Québec City map is one PMTiles file in R2; this reads one
 * tile from it with a ranged read and returns it. Cloudflare's edge cache keeps
 * repeat requests off R2. Open to visitors (public routes need maps too).
 * Tile coordinates are never logged: for a personal route they outline where
 * that route is.
 */
import { PMTiles, SharedPromiseCache, type RangeResponse, type Source } from 'pmtiles';

/** The subset of Cloudflare's R2 binding used here. */
export interface R2Bucket {
  get(key: string, options?: { range?: { offset: number; length: number } }): Promise<{ arrayBuffer(): Promise<ArrayBuffer>; etag?: string } | null>;
}

/** Highest zoom in the cut (scripts/cut-map.ts MAX_ZOOM); the map draws closer zooms from these. */
export const MAX_TILE_ZOOM = 15;
/** The map file's name in the bucket unless MAP_OBJECT says otherwise. */
export const DEFAULT_MAP_OBJECT = 'quebec.pmtiles';

class R2Source implements Source {
  private readonly bucket: R2Bucket;
  private readonly key: string;
  constructor(bucket: R2Bucket, key: string) {
    this.bucket = bucket;
    this.key = key;
  }
  getKey() {
    return this.key;
  }
  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    const obj = await this.bucket.get(this.key, { range: { offset, length } });
    if (!obj) throw new Error('Map file not found');
    return { data: await obj.arrayBuffer(), etag: obj.etag };
  }
}

// Kept between requests while this server instance lives: the header and directories are read once.
const directories = new SharedPromiseCache(50);
let archive: { key: string; bucket: R2Bucket; pmtiles: PMTiles } | null = null;

function open(bucket: R2Bucket, key: string): PMTiles {
  if (!archive || archive.key !== key || archive.bucket !== bucket) {
    archive = { key, bucket, pmtiles: new PMTiles(new R2Source(bucket, key), directories) };
  }
  return archive.pmtiles;
}

/** "/api/map/tiles/14/4823/5862" → [14, 4823, 5862], or null if it isn't a valid tile. */
export function parseTilePath(path: string): [number, number, number] | null {
  const m = /^\/api\/map\/tiles\/(\d{1,2})\/(\d{1,6})\/(\d{1,6})$/.exec(path);
  if (!m) return null;
  const [z, x, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (z > MAX_TILE_ZOOM || x >= 2 ** z || y >= 2 ** z) return null;
  return [z, x, y];
}

const tileHeaders = {
  'content-type': 'application/x-protobuf',
  // Tiles only change when the map is re-cut, and the app asks with ?v=<map version>.
  'cache-control': 'public, max-age=2592000, immutable',
  'access-control-allow-origin': 'same-origin',
};

/**
 * One tile, or 204 where the map has none (open water, outside the cut).
 * `edgeCache` is Cloudflare's cache (caches.default) when running there.
 */
export async function serveTile(
  request: Request,
  bucket: R2Bucket,
  key: string,
  edgeCache?: { match(r: Request): Promise<Response | undefined>; put(r: Request, res: Response): Promise<void> },
): Promise<Response> {
  const zxy = parseTilePath(new URL(request.url).pathname);
  if (!zxy) return new Response('Not a map tile', { status: 404 });
  const cacheKey = new Request(request.url, { method: 'GET' });
  const hit = await edgeCache?.match(cacheKey);
  if (hit) return hit;
  const tile = await open(bucket, key).getZxy(...zxy);
  const res = tile ? new Response(tile.data, { headers: tileHeaders }) : new Response(null, { status: 204, headers: tileHeaders });
  if (edgeCache) await edgeCache.put(cacheKey, res.clone());
  return res;
}
