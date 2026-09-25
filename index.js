#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const SECPANEL_URL = (process.env.SECPANEL_URL || 'https://secpanel.hosteva.net').replace(/\/+$/, '');
const SECPANEL_API_KEY = process.env.SECPANEL_API_KEY || '';

async function callSecpanelApi(endpoint, method = 'GET', body = null) {
  if (!SECPANEL_API_KEY) {
    throw new Error('SECPANEL_API_KEY ortam değişkeni tanımlanmamış. API anahtarı almak için lütfen https://www.hosteva.com adresinden kaydolup anahtarınızı oluşturun.');
  }

  const url = `${SECPANEL_URL}${endpoint}`;
  const headers = {
    'Authorization': `Bearer ${SECPANEL_API_KEY}`,
    'Content-Type': 'application/json',
    'User-Agent': 'Hosteva-SecPanel-MCP/1.0'
  };

  const options = {
    method,
    headers
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const text = await response.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch (_) {
    throw new Error(`SecPanel API geçersiz yanıt döndü (${response.status}): ${text.substring(0, 200)}`);
  }

  if (!response.ok) {
    throw new Error(data.error || `SecPanel API Hatası (${response.status}): ${data.message || text}`);
  }

  return data;
}

function parseDependenciesFromDir(projectDir = process.cwd()) {
  const packages = [];

  const packageJsonPath = path.join(projectDir, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      for (const [name, rawVer] of Object.entries(allDeps)) {
        const cleanVer = String(rawVer).replace(/^[\^~>=<]+/, '').trim();
        packages.push({ name, version: cleanVer, ecosystem: 'npm' });
      }
    } catch (_) {}
  }

  const composerJsonPath = path.join(projectDir, 'composer.json');
  if (fs.existsSync(composerJsonPath)) {
    try {
      const comp = JSON.parse(fs.readFileSync(composerJsonPath, 'utf8'));
      const allDeps = { ...(comp.require || {}), ...(comp['require-dev'] || {}) };
      for (const [name, rawVer] of Object.entries(allDeps)) {
        if (name === 'php' || name.startsWith('ext-')) continue;
        const cleanVer = String(rawVer).replace(/^[\^~>=<]+/, '').trim();
        packages.push({ name, version: cleanVer, ecosystem: 'composer' });
      }
    } catch (_) {}
  }

  const reqTxtPath = path.join(projectDir, 'requirements.txt');
  if (fs.existsSync(reqTxtPath)) {
    try {
      const lines = fs.readFileSync(reqTxtPath, 'utf8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const match = trimmed.match(/^([a-zA-Z0-9_\-\.]+)(?:==|>=|<=|~=)?([0-9\.]+)?/);
        if (match) {
          packages.push({ name: match[1], version: match[2] || '*', ecosystem: 'pypi' });
        }
      }
    } catch (_) {}
  }

  return packages;
}

const TOOLS = [
  {
    name: 'scan_dependencies',
    description: 'Proje dizinindeki (package.json, composer.json, requirements.txt) kütüphaneleri otomatik tarar ve Hosteva SecPanel üzerinden CVE, risk skoru ve Türkçe AI çözüm rehberi çıkarır.',
    inputSchema: {
      type: 'object',
      properties: {
        project_dir: {
          type: 'string',
          description: 'Taranacak proje kök dizini (Boş bırakılırsa çalışma dizini kullanılır).'
        }
      }
    }
  },
  {
    name: 'check_package',
    description: 'Tek bir kütüphane için anlık zafiyet ve CVE sorgusu yapar.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Kütüphane veya paket adı (Örn: axios, lodash, guzzlehttp/guzzle)' },
        version: { type: 'string', description: 'Paket sürümü (Örn: 0.21.1, 4.17.15)' },
        ecosystem: { type: 'string', description: 'Ekosistem (npm, composer, pypi vb.)' }
      },
      required: ['name', 'version']
    }
  },
  {
    name: 'get_cve_remediation',
    description: 'Belirli bir CVE kodu için Hosteva SecPanel Türkçe AI açıklamasını, risk analizini ve güvenli hedef sürümü döner.',
    inputSchema: {
      type: 'object',
      properties: {
        cve_id: { type: 'string', description: 'CVE Kodu (Örn: CVE-2024-38856)' }
      },
      required: ['cve_id']
    }
  },
  {
    name: 'get_quota_status',
    description: 'Hosteva SecPanel hesabınızın günlük paket tarama kotasını ve kullanım durumunu sorgular.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

async function handleToolCall(name, args) {
  if (name === 'scan_dependencies') {
    const targetDir = args?.project_dir || process.cwd();
    const pkgs = parseDependenciesFromDir(targetDir);

    if (pkgs.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `Belirtilen dizinde (${targetDir}) taranabilir bağımlılık dosyası (package.json, composer.json, requirements.txt) bulunamadı.`
          }
        ]
      };
    }

    const response = await callSecpanelApi('/api/v1/mcp/scan', 'POST', {
      project_name: path.basename(targetDir),
      packages: pkgs
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }
      ]
    };
  }

  if (name === 'check_package') {
    const response = await callSecpanelApi('/api/v1/mcp/check-package', 'POST', {
      name: args.name,
      version: args.version,
      ecosystem: args.ecosystem || 'npm'
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }
      ]
    };
  }

  if (name === 'get_cve_remediation') {
    const response = await callSecpanelApi(`/api/v1/mcp/cve/${encodeURIComponent(args.cve_id)}`, 'GET');
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }
      ]
    };
  }

  if (name === 'get_quota_status') {
    const response = await callSecpanelApi('/api/v1/mcp/verify', 'GET');
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }
      ]
    };
  }

  throw new Error(`Bilinmeyen araç (tool): ${name}`);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', async (line) => {
  if (!line.trim()) return;

  let request;
  try {
    request = JSON.parse(line);
  } catch (_) {
    return;
  }

  const { id, method, params } = request;

  if (method === 'initialize') {
    const response = {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: 'hosteva-secpanel-mcp',
          version: '1.0.0'
        }
      }
    };
    process.stdout.write(JSON.stringify(response) + '\n');
    return;
  }

  if (method === 'notifications/initialized') {
    return;
  }

  if (method === 'tools/list') {
    const response = {
      jsonrpc: '2.0',
      id,
      result: {
        tools: TOOLS
      }
    };
    process.stdout.write(JSON.stringify(response) + '\n');
    return;
  }

  if (method === 'tools/call') {
    try {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};
      const result = await handleToolCall(toolName, toolArgs);

      const response = {
        jsonrpc: '2.0',
        id,
        result
      };
      process.stdout.write(JSON.stringify(response) + '\n');
    } catch (err) {
      const response = {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: err.message
        }
      };
      process.stdout.write(JSON.stringify(response) + '\n');
    }
    return;
  }

  if (id !== undefined) {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: 'Metod bulunamadı.' }
    }) + '\n');
  }
});
