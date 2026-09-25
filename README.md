# Hosteva SecPanel MCP Server (@hosteva/secpanel-mcp)

Official Model Context Protocol (MCP) server for **Hosteva SecPanel**. Seamlessly connects Cursor, Claude, Antigravity, and VS Code with Hosteva's real-time 300,000+ vulnerability intelligence database, EPSS exploit predictions, and Turkish AI remediation engine.

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

1. **`scan_dependencies`**: Scans `package.json`, `composer.json`, or `requirements.txt` in your project workspace. Automatically cross-references CVEs, scores risks, and tracks remediation progress.
2. **`check_package`**: Instantly checks a single library and version before installing (e.g., `axios@1.8.1`).
3. **`get_cve_remediation`**: Retrieves verified Turkish AI remediation guides, patch details, and workarounds for a specific CVE ID.
4. **`get_quota_status`**: Checks your daily package quota and live API rate limits.

---

## 🔒 Security & Privacy

Your source code **never leaves your local machine**. The MCP client extracts only dependency package names and version strings, querying the SecPanel intelligence API over encrypted HTTPS.

## 📄 License

MIT © [Hosteva Cloud & Security](https://www.hosteva.com)
