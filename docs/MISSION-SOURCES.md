# Mission-related reading

Set `TAVILY_API_KEY` in the ignored `.env` (or a hosting secret), restart the API,
and refresh the page. Open a mission card and choose **Find sources**. The card
explains that only its goal, truncated to 400 characters, will be sent to Tavily.
No search runs when the card appears. No memories, conversation or images are sent.

The API calls [Tavily Search](https://docs.tavily.com/documentation/api-reference/endpoint/search)
with basic search, three results and no generated answer/raw pages/images.
The key remains on the server. The UI displays returned titles and safe HTTP(S)
links as related reading; these are not sources used to create the mission.
A timestamp identifies when the links were retrieved.

Successful and empty results are saved with the current mission, so opening it
again does not spend another search. Failed searches can be retried. A changed
mission gets fresh source state; late responses for an old/deleted mission are
rejected. Source metadata is included in data export and removed by data deletion.
Tavily controls retention of queries it receives; deleting local data cannot erase
an external provider's logs. Links open in a new tab without a referrer.

Without a key, the card says sources are unavailable and keeps the mission usable.
Timeouts, rejected keys, quota errors, invalid responses and empty results never
produce invented links. Hosting's existing per-IP API rate limit also covers this
endpoint; successful caching avoids duplicate searches for the same mission.

## Verification status

On 2026-10-11, the no-key fallback was exercised through the real browser and API.
Successful search, failures, unsafe links, caching, export, deletion and races are
covered by contract tests with fake HTTP responses. A real successful Tavily call
has **not** been verified, and no live result is represented in screenshots.
Claude must add a key and verify a real call before claiming the Tavily prize bonus.
