# Protected paths

Automated remediation may open a pull request for these paths, but a human has to review it before merge.

| Path | Why |
| --- | --- |
| `src/auth/` | Mock Entra ID token checks. A bad edit can accept another app's tokens. |
| `migrations/` | Schema changes. CI cannot safely roll them back. |
| `infra/` | Deployment and network configuration. |

The same paths are listed in `.github/CODEOWNERS`.
