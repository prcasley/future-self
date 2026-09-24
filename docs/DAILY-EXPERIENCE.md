# Daily experience

Start session now opens with a spoken first-goal prompt or a returning mission recap. There are no onboarding text fields. “My goal is to learn Python” saves a first goal and proposes a small mission without a provider call. Replacing a saved goal still requires confirmation. Free-form requests continue through the existing model/tool route.

“What is my mission?” uses the selected goal, a small goal-related task template, and the latest consented Lab decision's target minutes. Without a decision it uses a disclosed 15-minute starter. The setup, work and wrap-up allocations sum to that target. These are planning suggestions, not validated estimates of capacity or guaranteed outcomes. A new check-in updates the mission to the latest target; the UI displays why. “Mission complete” records the user's report without inventing a Lab check-in or measured progress.

“Remind me daily at 9 AM” creates one daily in-app schedule in the browser's reported timezone. “Stop reminders” disables it; another time replaces it. Bare ambiguous times such as “at 9” ask for clarification. The local server persists the schedule and up to 14 messages. A visible browser polls every 30 seconds; reopening delivers the current day's check-in after the chosen time, without replaying every missed day. Delivery is serialized with voice turns and deduplicated by local calendar date. Daylight-saving changes use IANA timezone data (`tzdata` on Windows). The timezone chosen at scheduling remains fixed until rescheduling.

Messages appear in the inbox card and can be spoken with “Read my messages”. They never automatically interrupt speech. This does not implement email, push notifications, or delivery while the app and server are closed. Scheduling after today's chosen time starts tomorrow.

State is still a local single-user prototype. UUID session separation is not authentication; do not deploy publicly as-is.

Validation: 58 backend tests, 24 frontend tests, Ruff and production build pass. New tests exercise provider-free onboarding, persisted completion, Lab sizing, selected goals, consent fallback, schedule restart/deduplication/cancellation, DST, invalid times and session isolation. The local app loads with the new voice hints. Real microphone recognition and audible opening recap still need a user speech test. Existing dependency deprecation and bundle-size warnings remain.

Try: Start session → “My goal is to learn Python” → “What is my mission?” → “Mission complete” → “Remind me daily at 9 AM” → “Stop reminders”.
