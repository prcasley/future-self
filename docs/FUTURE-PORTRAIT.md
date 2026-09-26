# Future portrait API

POST /future/portrait (hosted browser path /api/future/portrait):

    {"session_id":"<UUID>","side":"dream","consent":false}

Sides: dream, good, neutral, bad; drift and hard road are aliases. The backend is selected by server configuration, never by the request.

Response: side, backend, brief (five styling fields), brief_source (local or nemotron), image_b64, mime_type, identity_requested, identity_preserving, disclaimer. identity_preserving remains false because the API cannot certify resemblance; identity_requested identifies the reference-guided mode. No image URLs are fetched or returned.

## Configuration (no secrets are supplied or changed by this implementation)

- FUTURE_IMAGE_BACKEND: local (default), tokenfactory, endpoint.
- NEBIUS_API_KEY and NEBIUS_SUPER_MODEL: existing Nemotron settings. Local without a key is entirely offline; local with a key generates the brief through Nemotron.
- FUTURE_IMAGE_MODEL: required for tokenfactory. Configure an account-supported text-to-image model; live availability is not verified here. Uses the OpenAI-compatible /images/generations JSON contract with response_format=b64_json.
- FUTURE_IMAGE_ENDPOINT: full HTTPS POST URL for a deployed reference-image adapter.
- FUTURE_IMAGE_ENDPOINT_KEY: optional separate bearer credential for that endpoint. Never forwards the Token Factory key to a custom endpoint.

The custom endpoint contract is POST {prompt, image_b64} -> {image_b64}. It must run the selected image-editing model, honor the preserve-identity instruction, and disable image/request/response retention. This is an adapter contract, not a claim that a GPU endpoint has already been deployed.

Endpoint requests require consent:true and image_b64 (raw base64 PNG/JPEG/WebP, no data URL, at most 8 million base64 characters). Consent is not remembered and never inferred from a previous request. Other backends reject photos, even with consent. Images never go to Nemotron. Body-shape/health instructions cannot enter the brief: the model selects from server-owned styling options.

The API does not store images or briefs. Responses and validation errors use Cache-Control:no-store; validation/provider errors do not echo request input. Logs retain only model labels, duration and status. Configure reverse proxies and the custom GPU endpoint not to log bodies; Python cannot guarantee secure memory erasure.

## Budgets and failures

One model-backed portrait request consumes one session allowance. Global slots are reserved atomically in the existing ledger before any paid work: one for a Nemotron brief; two for brief plus image. Failed or unused reservations remain counted conservatively. No retries, redirects, provider switching, or background generation. Global slots also count against existing voice/scan limits; existing in-flight voice calls retain their previous completion-based accounting.

400: invalid consent/image/backend setup; 422: invalid schema; 429: daily budget; 503: missing Nemotron configuration for remote rendering; 502: provider failure or malformed output. A failed remote render never returns local output as if an image was generated.

The optional “Preview your future self” panel now reads GET /future/portrait/config, selects a future, and displays either the brief or the rendered image. Reference mode uses a separate, transient photo picker with fresh consent for every attempt. The saved device-only photo is never automatically uploaded. Results remain in page memory; Clear preview, forgetting the photo, and confirmed data deletion discard them. Cancellation stops the browser waiting but cannot guarantee cancellation of a provider job already submitted. Claude's live renderer still needs to consume the result; no live-animation folder exists in this checkout. Existing avatar/scan/living files are unchanged.

## September 26 integration

103 backend tests and 24 web tests pass, alongside Ruff and the production build. Capability discovery exposes no endpoint URLs or credentials. Actual likeness, generation latency and animation remain unverified: no paid provider calls were made. A generated static preview is not presented as completed live animation.

## Verification — September 25

100 backend tests, 24 existing web tests, Ruff, Prettier and the production build pass. New tests mock all providers and cover consent, schema redaction, concept/identity separation, no image persistence, provider failures, no redirects, and both daily budgets. Browser smoke check: typing expands, blank Send is disabled, spaces work, submission uses the existing voice turn client, and the text is preserved when the API is offline. Actual microphone pause/resume and live provider fidelity/latency remain untested. Existing dependency/cache and large-bundle warnings remain.
