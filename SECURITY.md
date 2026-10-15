# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration handles:

- **No secret.** No account, no password, no API key: the configuration holds
  a language and a country code.
- **`/data`** holds one file, `epic-games-state.json`: the identifiers of the
  free games already announced to the scenes, and the country they were read
  for. Nothing personal.
- **Network**: outbound HTTPS only, to
  `store-site-backend-static.ak.epicgames.com` (the free games list) and to
  `*.epicgames.com` (the posters of the widget). The poster URLs come from the
  store's answer: the integration fetches them only over https and only on an
  Epic host, without credentials, with a size cap. It listens on no port.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and the Epic Games Store and its services.
