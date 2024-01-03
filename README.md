# cloudflare-shorten-worker

A Cloudflare Worker that provides shorten link service.

## Detail

This is a worker that provide shorten link service, you can submit a link to get a shorten key with/without expire seconds, then visit this short link by appending host before the key.

The appended host is the one that you registered to this worker.

Inside this worker, I made a built-in white list for some host that I don't want to set expire time as default.

## Deployment / Installation

To deploy this worker, you may want to modify some codes such as `$whiteList`, `$expireTimeout` and `$defaultLen` in `src/index.ts`.
And then you can follow the steps to deploy to your Cloudflare account.

1. (Optional) Install `wangler`, and log in with your Cloudflare account.
2. Clone this repository.
3. `cd cloudflare-shorturl-worker` then `npm install`.
4. run `wrangler kv:namespace create links` to create a new KV namespace, then replace the `id` to `[[kv_namespaces]] -> id` in `wrangler.toml`, do NOT change the value of `binding`.
5. run `wrangler whoami` to get your `account_id`, then replace the `account_id` in `wrangler.toml`.
6. Change the `$whiteList` in `src/index.ts` to your domains.
7. Deploy workers by running `wrangler deploy`.
8. Done!

## Usage

### Preflight

By sending `OPTIONS` request to any path, you will get the HTTP 204 No Content response.

### Visit / Redirect

By visit `https://example.com/AbxY` in browser, if the key is correct, you will be redirected to the actual link.

### Save URL

```http request
POST /save-url
Content-Type: application/json
Accept: application/json

{"url": "<LINK_TO_BE_SHORTEN>", "hash": "<LINK_STRING_MD5>", "key": "<SPECIFY_KEY_TO_OVERRIDE>"}
```

#### Payload

* `url`: A link that you want to shorten it.
* `hash`: (Optional) A MD5 value of `url`.
* `key`: (Optional) A specify key that you want to override with new link.

#### Response

```json
{
	"key": "AbxY",
	"ttl": 3600
}
```

* `key`: The shorten key of your link, append to `https://example.com/<key>` to visit, such as `https://example.com/AbxY`.
* `ttl`: An expiry time in seconds, and value `-1` means no expiry.
