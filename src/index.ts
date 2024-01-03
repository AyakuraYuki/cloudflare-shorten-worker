// declare worker bindings
export interface Env {
	// components
	links: KVNamespace;

	// environments
}

// constants
const $defaultLen = 4;
const $whiteList = [
	'ayakurayuki.cc'
];
const $expireTimeout = (60 * 60 * 1000); // ttl in milliseconds, default to 60 minutes, 0 as ttl not set
const $removeCompletely = true; // 自动删除短链记录

class ApiReq {
	url: string;
	hash: string;
	key: string;

	constructor(url: string, hash: string, key: string) {
		this.url = url;
		this.hash = hash;
		this.key = key;
	}
}

// entrance
export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		let requestURL = new URL(request.url);
		let path = requestURL.pathname.substring(1);

		// preflight
		if (request.method === 'OPTIONS') {
			return new Response(``, {
				status: 204,
				headers: {
					'Content-Type': 'text/html;charset=UTF-8',
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Methods': 'GET,POST'
				}
			});
		}

		// api mapping
		if (request.method === 'POST') {
			if (path === 'save-url') {

				let params = await request.json<ApiReq>();
				let url = params.url;
				let hash = params.hash;
				let admin = await checkHash(url, hash);
				console.log(`[handle] url: ${url}, admin: ${admin}, hash: ${hash}`);

				let [key, ttl] = await saveURL(env, url, params.key, admin, $defaultLen);
				console.log(`[handle] key: ${key}`);

				let data = {
					'key': key,
					'ttl': ttl
				};
				return new Response(JSON.stringify(data), {
					status: 200,
					headers: {
						'Content-Type': 'application/json',
						'Access-Control-Allow-Origin': '*',
						'Access-Control-Allow-Methods': 'GET,POST'
					}
				});

			} else {
				return produce404NotFound();
			}
		}

		// redirect
		console.log(`[handle] url: ${requestURL}, path: ${path}`);
		if (!path) {
			return new Response(`400 Bad Request`, {
				status: 400,
				headers: {
					'Content-Type': 'text/html;charset=UTF-8'
				}
			});
		}
		let url = await loadURL(env, path);
		if (!url) {
			return produce404NotFound();
		}
		return Response.redirect(url, 302);
	}
};

function produce404NotFound(): Response {
	return new Response(`404 Not Found`, {
		status: 404,
		headers: {
			'Content-Type': 'text/html;charset=UTF-8'
		}
	});
}

// --- random string ---

const $chars: string = 'ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678'; // 默认去掉了容易混淆的字符oOLl, 9gq, Vv, Uu, I1
const $maxPos: number = $chars.length;

function randomString(len: number): string {
	let result = '';
	for (let i = 0; i < len; i++) {
		result += $chars.charAt(Math.floor(Math.random() * $maxPos));
	}
	return result;
}

// --- validate URL ---

const $regexp = /^http(s)?:\/\/(.*@)?([\w-]+\.)*[\w-]+([_\-.,~!*:#()\w\/?%&=]*)?$/;

function checkURL(url: string): boolean {
	let re = new RegExp($regexp);
	let str = url;
	if (re.test(str)) {
		return str[0] === 'h';
	} else {
		return false;
	}
}

function checkWhiteList(host: string): boolean {
	return $whiteList.some(h => host === h || host.endsWith('.' + h));
}

// --- md5 ---

async function md5(message: string): Promise<string> {
	let msgU8 = new TextEncoder().encode(message);
	let hashBuf = await crypto.subtle.digest('MD5', msgU8);
	let hashArr = Array.from(new Uint8Array(hashBuf));
	return hashArr.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function checkHash(url: string, hash: string): Promise<boolean> {
	if (!hash) {
		return false;
	}
	let raw = await md5(url);
	return raw === hash;
}

// --- biz ---

async function loadURL(env: Env, key: string): Promise<string | null> {
	let value = await env.links.get(key);
	if (!value) {
		return null;
	}
	let list = value.split(';');
	console.log(`[loadURL] value split ${list}`);
	let url;
	if (list.length === 1) {
		url = list[0];
	} else {
		url = list[2];
		let mode = parseInt(list[0]);
		let createTime = parseInt(list[1]);
		if (mode !== 0 && $expireTimeout > 0 && Date.now() - createTime > $expireTimeout) {
			let host = new URL(url).host;
			if (checkURL(host)) {
				console.log(`[loadURL] white list host ${host}`);
			} else {
				console.log(`[loadURL] shorten timeout ${key}`);
				return null;
			}
		}
	}
	return url;
}

async function saveURL(env: Env, url: string, key: string, fromAdmin: boolean, len: number): Promise<[string, number]> {
	len = len || $defaultLen;

	let override = fromAdmin && key; // 来自管理操作的，即 key 和 fromAdmin 都正确，进行覆盖操作
	if (!override) {
		key = randomString(len); // 不是覆盖模式，不使用指定的 key
	}

	let exist = await loadURL(env, key);
	console.log(`[saveURL] key exist ${key}: ${exist}`);
	if (override || !exist) {
		let mode = 3;
		if (fromAdmin) {
			mode = 0;
		}
		let value = `${mode};${Date.now()};${url}`;
		let isWhiteListed = checkWhiteList(new URL(url).host);
		if ($removeCompletely && mode != 0 && !isWhiteListed) {
			let ttl = Math.max(60, $expireTimeout / 1000);
			console.log(`[saveURL] key auto remove ${key} with ttl ${ttl}s`);
			await env.links.put(key, value, { expirationTtl: ttl });
			return [key, ttl];
		} else {
			await env.links.put(key, value);
			return [key, -1];
		}
	} else {
		return saveURL(env, url, key, fromAdmin, len + 1);
	}
}
