# Hosteva SecPanel MCP Server (@hosteva/secpanel-mcp)

Official Model Context Protocol (MCP) server for **Hosteva SecPanel**. Seamlessly connects Cursor, Claude, Antigravity, and VS Code with Hosteva's real-time 300,000+ vulnerability intelligence database, EPSS exploit predictions, Turkish AI remediation engine, and live quota tracking.

---

## 🚀 Quick Setup (1-Click)

Add the following configuration to your IDE's MCP config:

### For Cursor IDE (`.cursor/mcp.json`)
```json
{
  "mcpServers": {
    "hosteva-security": {
      "command": "npx",
      "args": ["-y", "github:hosteva/secpanel-mcp"],
      "env": {
        "SECPANEL_URL": "https://secpanel.hosteva.net",
        "SECPANEL_API_KEY": "YOUR_API_KEY_HERE"
      }
    }
  }
}
```

### For Antigravity IDE (`.agents/mcp_config.json`)
```json
{
  "mcpServers": {
    "hosteva-security": {
      "command": "npx",
      "args": ["-y", "github:hosteva/secpanel-mcp"],
      "env": {
        "SECPANEL_URL": "https://secpanel.hosteva.net",
        "SECPANEL_API_KEY": "YOUR_API_KEY_HERE"
      }
    }
  }
}
```

### For Claude Desktop (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "hosteva-security": {
      "command": "npx",
      "args": ["-y", "github:hosteva/secpanel-mcp"],
      "env": {
        "SECPANEL_URL": "https://secpanel.hosteva.net",
        "SECPANEL_API_KEY": "YOUR_API_KEY_HERE"
      }
    }
  }
}
```

---

## 🔑 How to Get an API Key

To use Hosteva SecPanel MCP in your IDE, an API key is required:
1. Visit **[https://www.hosteva.com](https://www.hosteva.com)** and sign up for an account.
2. Activate your **Hosteva SecPanel AI Security Copilot** service in your client area.
3. Generate your live API key (e.g. `sec_live_...`).
4. Replace `YOUR_API_KEY_HERE` with your API key in your IDE's MCP config.

---

## 🛠️ Available MCP Tools

### 1. `scan_dependencies`
Deep vulnerability scanning with exact lockfile resolution and external package support:
- **Strict Lockfile Whitelist:** Automatically parses validated lockfiles (`package-lock.json`, `composer.lock`, `yarn.lock`, `pnpm-lock.yaml`, `Pipfile.lock`, `poetry.lock`, `requirements.txt`). Arbitrary system path reads are strictly prevented.
- **External Package Input (`packages`):** AI models can directly pass a package list in memory or from external sources (`docker inspect`, `pip freeze`, custom container):
  ```json
  {
    "packages": [
      { "name": "axios", "version": "1.19.0", "ecosystem": "npm" },
      { "name": "guzzlehttp/guzzle", "version": "7.5.0", "ecosystem": "composer" }
    ]
  }
  ```
- **Raw Lockfile Content (`raw_content`):** Pass raw lockfile or requirements text obtained from SSH, remote VMs, or clipboards.
- **Micro-Chunking & Timeout Resilience:** Projects with 100+ dependencies are automatically chunked into 15-package batches to eliminate 504 Gateway Timeouts.
- **Quota Transparency:** Returns real-time quota status (`daily_package_quota`, `packages_scanned_today`, `remaining_quota`) with every scan. Quotas are deducted only on successful scan completion.

### 2. `check_package`
Instantly checks a single library and version before installing (e.g. `axios@1.19.0`). Returns live remaining quota.

### 3. `get_cve_remediation`
Retrieves verified Turkish AI remediation guides, patch details, and workarounds for a specific CVE ID.

### 4. `get_quota_status`
Queries your account's daily package quota, today's scanned packages count, remaining quota, and rate limits in real-time.

---

## 🆕 What's New in v1.1.1

- **Security & Path Whitelisting:** Enforced a strict lockfile whitelist (`isAllowedLockFile`) to eliminate arbitrary local file reads. Unsafe plaintext fallbacks have been removed.
- **High-Precision Vulnerability Matching:** Migrated from broad substring matching to canonical JSON package matching and strict Semver range evaluations. False-positive rate dropped to near zero.
- **Micro-Batch Scanning:** The backend engine now processes scans in concurrent 15-package chunks, reducing scan times for enterprise repositories from 45s+ down to ~600ms.
- **Abort-Safe Quota Handling:** API transactions are protected; if a client disconnects mid-scan, user quotas are preserved.

---

## 🔒 Security & Privacy

Your source code **never leaves your local machine**. The MCP client extracts only dependency package names and version strings, querying the SecPanel intelligence API over encrypted HTTPS.

## 📄 License

MIT © [Hosteva Cloud & Security](https://www.hosteva.com)

